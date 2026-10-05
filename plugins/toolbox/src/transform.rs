use base64::Engine;
use serde_json::{Value, json};
use zeroize::Zeroizing;
pub fn run(command: &str, input: &str, parameter: &str) -> Value {
    if input.len() > 256 * 1024 || parameter.len() > 4096 {
        return error("limit", 0, 0);
    }
    match command {
        "base64.encode" => {
            json!({"output":base64::engine::general_purpose::STANDARD.encode(input.as_bytes())})
        }
        "base64.decode" => {
            let bytes = match base64::engine::general_purpose::STANDARD.decode(input) {
                Ok(bytes) => Zeroizing::new(bytes),
                Err(_) => return error("invalidBase64", 0, 0),
            };
            match std::str::from_utf8(&bytes) {
                Ok(text) => json!({"output":text}),
                Err(_) => error("invalidUtf8", 0, 0),
            }
        }
        "json.pretty" | "json.compact" | "json.validate" | "json.pointer" => {
            let value = match serde_json::from_str::<Value>(input) {
                Ok(value) => super::Json(value),
                Err(error) => return self::error("invalidJson", error.line(), error.column()),
            };
            let selected = if command == "json.pointer" {
                if !valid_pointer(parameter) {
                    return error("invalidPath", 0, 0);
                }
                match value.0.pointer(parameter) {
                    Some(value) => value,
                    None => return error("missingPath", 0, 0),
                }
            } else {
                &value.0
            };
            // Formatting retains numeric lexemes instead of passing numbers through f64.
            let output = if command == "json.validate" {
                input.to_string()
            } else if command == "json.compact" {
                serde_json::to_string(selected).unwrap()
            } else {
                serde_json::to_string_pretty(selected).unwrap()
            };
            if output.len() > 2 * 1024 * 1024 {
                return error("limit", 0, 0);
            }
            json!({"output":output})
        }
        _ => match super::utilities::run(command, input, parameter) {
            Ok(output) if output.len() <= 2 * 1024 * 1024 => json!({"output":output.as_str()}),
            Ok(_) => error("limit", 0, 0),
            Err(code) => error(code, 0, 0),
        },
    }
}
fn error(code: &str, line: usize, column: usize) -> Value {
    json!({"error":{"code":code,"line":line,"column":column}})
}
fn valid_pointer(path: &str) -> bool {
    if !path.is_empty() && !path.starts_with('/') {
        return false;
    }
    let mut chars = path.chars();
    while let Some(ch) = chars.next() {
        if ch == '~' && !matches!(chars.next(), Some('0' | '1')) {
            return false;
        }
    }
    true
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transformations_preserve_unicode_newlines_and_exact_json_numbers() {
        assert_eq!(
            run("base64.encode", "中文\r\n", "")["output"],
            "5Lit5paHDQo="
        );
        assert_eq!(
            run("base64.decode", "5Lit5paHDQo=", "")["output"],
            "中文\r\n"
        );
        assert_eq!(
            run("base64.decode", "/w==", "")["error"]["code"],
            "invalidUtf8"
        );
        assert_eq!(
            run("base64.decode", "Zg=", "")["error"]["code"],
            "invalidBase64"
        );
        let input = "{\"n\":123456789012345678901234567890,\"decimal\":1.234567890123456789,\"a/b\":{\"~\":[true,null]}}";
        assert_eq!(run("json.compact", input, "")["output"], input);
        assert_eq!(
            run("json.pretty", "{\"n\":9007199254740993}", "")["output"],
            "{\n  \"n\": 9007199254740993\n}"
        );
        assert_eq!(run("json.pointer", input, "/a~1b/~0/1")["output"], "null");
        assert_eq!(
            run("json.pointer", input, "/a~2b")["error"]["code"],
            "invalidPath"
        );
        assert_eq!(
            run("json.pointer", input, "/absent")["error"]["code"],
            "missingPath"
        );
        assert_eq!(
            run("json.validate", " {\"a\":1}\r\n", "")["output"],
            " {\"a\":1}\r\n"
        );
        assert_eq!(
            run("json.pretty", "{\n  \"token\": }", "")["error"],
            json!({"code":"invalidJson","line":2,"column":12})
        );
        assert_eq!(
            run("base64.encode", &"a".repeat(256 * 1024 + 1), "")["error"]["code"],
            "limit"
        );
    }
}
