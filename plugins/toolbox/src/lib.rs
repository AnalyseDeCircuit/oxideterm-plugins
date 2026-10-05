use serde_json::{Value, json};
use std::{cell::RefCell, mem, ptr};
use zeroize::{Zeroize, Zeroizing};
mod transform;
mod utilities;

thread_local! {
    static RESPONSE: RefCell<Zeroizing<Vec<u8>>> = RefCell::new(Zeroizing::new(Vec::new()));
    static OUTBOUND: RefCell<Zeroizing<Vec<u8>>> = RefCell::new(Zeroizing::new(Vec::new()));
}
#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub extern "C" fn _start() {}
#[unsafe(no_mangle)]
pub extern "C" fn oxideterm_plugin_alloc(length: i32) -> i32 {
    if length <= 0 || length > 4 * 1024 * 1024 {
        return 0;
    }
    Box::into_raw(vec![0u8; length as usize].into_boxed_slice()) as *mut u8 as i32
}
struct Json(Value);
impl Drop for Json {
    fn drop(&mut self) {
        wipe(&mut self.0);
    }
}
fn wipe(value: &mut Value) {
    match value {
        Value::String(text) => text.zeroize(),
        Value::Array(items) => {
            for item in items {
                wipe(item)
            }
        }
        Value::Object(items) => {
            for (mut key, mut value) in mem::take(items) {
                key.zeroize();
                wipe(&mut value)
            }
        }
        _ => {}
    }
}
fn request(pointer: i32, length: i32) -> Json {
    if pointer <= 0 || length <= 0 {
        return Json(Value::Null);
    }
    // The host filled this exact boxed allocation. Erase it after parsing.
    let bytes = Zeroizing::new(unsafe {
        Box::from_raw(ptr::slice_from_raw_parts_mut(
            pointer as usize as *mut u8,
            length as usize,
        ))
    });
    Json(serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}
fn store(buffer: &mut Zeroizing<Vec<u8>>, value: &Value) -> i64 {
    *buffer = Zeroizing::new(serde_json::to_vec(value).unwrap());
    ((u64::from(buffer.as_ptr() as usize as u32) << 32) | buffer.len() as u64) as i64
}
#[unsafe(no_mangle)]
pub extern "C" fn oxideterm_plugin_command(pointer: i32, length: i32) -> i64 {
    let request = request(pointer, length);
    let value = transform::run(
        request.0["kind"]["command"].as_str().unwrap_or(""),
        request.0["kind"]["args"]["input"].as_str().unwrap_or(""),
        request.0["kind"]["args"]["parameter"]
            .as_str()
            .unwrap_or(""),
    );
    let response =
        Json(json!({"requestId":request.0["requestId"],"result":{"status":"ok","value":value}}));
    RESPONSE.with(|buffer| store(&mut buffer.borrow_mut(), &response.0))
}
#[unsafe(no_mangle)]
pub extern "C" fn oxideterm_plugin_event(pointer: i32, length: i32) -> i64 {
    let request = request(pointer, length);
    RESPONSE.with(|buffer| {
        store(
            &mut buffer.borrow_mut(),
            &json!({"requestId":request.0["requestId"],"result":{"status":"ok","value":null}}),
        )
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn oxideterm_plugin_drain_outbound() -> i64 {
    let translations: Value = serde_json::from_str(include_str!("../locales.json")).unwrap();
    let options = [
        ("base64.encode", "encode"),
        ("base64.decode", "decode"),
        ("json.pretty", "pretty"),
        ("json.compact", "compact"),
        ("json.validate", "validate"),
        ("json.pointer", "extract"),
        ("url.encode", "urlEncode"),
        ("url.decode", "urlDecode"),
        ("hex.encode", "hexEncode"),
        ("hex.decode", "hexDecode"),
        ("time.seconds", "secondsDate"),
        ("time.millis", "millisDate"),
        ("date.seconds", "dateSeconds"),
        ("date.millis", "dateMillis"),
        ("date.zone", "convertZone"),
        ("text.unique", "unique"),
        ("text.sort", "sort"),
        ("text.reverseSort", "reverseSort"),
        ("text.ansi", "stripAnsi"),
        ("text.regex", "regex"),
        ("hash.sha256", "sha256"),
        ("hash.sha512", "sha512"),
        ("generate.uuid", "uuid"),
        ("random.alphanumeric", "randomAlphanumeric"),
        ("random.hex", "randomHex"),
        ("random.digits", "randomDigits"),
    ]
    .into_iter()
    .map(|(command, label)| {
        let mut value = json!({"command":command});
        let group = match command.split('.').next().unwrap() {
            "base64" | "url" | "hex" => "encodingGroup",
            "json" => "jsonGroup",
            "time" | "date" => "timeGroup",
            "text" => "textGroup",
            "hash" => "hashGroup",
            _ => "generateGroup",
        };
        value["group"] = json!(format!("@{group}"));
        if command.starts_with("time.") || command == "date.zone" {
            value["parameterLabel"] = json!("@timezone");
            value["parameterDefault"] = json!("UTC");
        }
        if command.starts_with("date.") {
            value["description"] = json!("@dateHint");
        }
        if command.starts_with("url.") {
            value["description"] = json!("@urlHint");
        }
        if command.starts_with("hash.") {
            value["description"] = json!("@hashHint");
        }
        if matches!(command, "text.sort" | "text.reverseSort" | "text.unique") {
            value["description"] = json!("@linesHint");
        }
        if command == "text.regex" {
            value["parameterLabel"] = json!("@pattern");
            value["description"] = json!("@regexHint");
        }
        if command.starts_with("random.") {
            value["parameterLabel"] = json!("@length");
            value["parameterDefault"] = json!("32");
        }
        if command == "json.pointer" {
            value["parameterLabel"] = json!("@path");
        }
        json!({"label":format!("@{label}"),"value":value})
    })
    .collect::<Vec<_>>();
    let labels = [
        "input",
        "output",
        "execute",
        "working",
        "copy",
        "useInput",
        "clear",
        "limit",
        "failed",
        "invalidBase64",
        "invalidUtf8",
        "invalidJson",
        "invalidPath",
        "missingPath",
        "line",
        "column",
        "invalidUrl",
        "invalidHex",
        "invalidTimestamp",
        "invalidTimezone",
        "invalidDate",
        "subsecondPrecision",
        "invalidRegex",
        "invalidLength",
        "randomUnavailable",
    ]
    .into_iter()
    .map(|key| (key.to_string(), json!(format!("@{key}"))))
    .collect::<serde_json::Map<_, _>>();
    let messages = json!([
        {"type":"registerContribution","registration":{"registrationId":"toolbox-view","pluginId":env!("OXIDETERM_PLUGIN_ID"),"kind":"tab","metadata":{"tabId":"toolbox","schema":{"componentVersion":1,"kind":"form","title":"@title","description":"@description","translations":translations,"controls":[{"kind":"textWorkbench","id":"text","options":options,"value":labels}]}}}},
        {"type":"registerContribution","registration":{"registrationId":"toolbox-selection","pluginId":env!("OXIDETERM_PLUGIN_ID"),"kind":"context-menu","metadata":{"target":"terminal","items":[{"label":"@openMenu","tabId":"toolbox","controlId":"text"}]}}},
        {"type":"runtimeReady"}
    ]);
    OUTBOUND.with(|buffer| store(&mut buffer.borrow_mut(), &messages))
}
