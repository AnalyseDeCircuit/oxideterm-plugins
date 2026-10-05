use chrono::{DateTime, SecondsFormat, Utc};
use chrono_tz::Tz;
use regex::RegexBuilder;
use sha2::{Digest, Sha256, Sha512};
use std::{collections::HashSet, fmt::Write};
use zeroize::Zeroizing;

pub fn run(command: &str, input: &str, parameter: &str) -> Result<Zeroizing<String>, &'static str> {
    let result = match command {
        "url.encode" => {
            let mut output = String::new();
            for byte in input.bytes() {
                if byte.is_ascii_alphanumeric() || b"-._~".contains(&byte) {
                    output.push(byte as char);
                } else {
                    write!(output, "%{byte:02X}").unwrap();
                }
            }
            output
        }
        "url.decode" => {
            let mut bytes = Zeroizing::new(Vec::new());
            let mut source = input.as_bytes().iter().copied();
            while let Some(byte) = source.next() {
                if byte == b'%' {
                    let high = source.next().and_then(hex_digit).ok_or("invalidUrl")?;
                    let low = source.next().and_then(hex_digit).ok_or("invalidUrl")?;
                    bytes.push(high * 16 + low);
                } else {
                    bytes.push(byte);
                }
            }
            // Percent decoding is not form decoding: a literal '+' stays '+'.
            std::str::from_utf8(&bytes)
                .map_err(|_| "invalidUtf8")?
                .to_string()
        }
        "hex.encode" => {
            let mut output = String::new();
            for byte in input.bytes() {
                write!(output, "{byte:02x}").unwrap();
            }
            output
        }
        "hex.decode" => {
            let mut bytes = Zeroizing::new(Vec::new());
            let mut high = None;
            for byte in input.bytes() {
                if byte.is_ascii_whitespace() {
                    continue;
                }
                let digit = hex_digit(byte).ok_or("invalidHex")?;
                if let Some(first) = high.take() {
                    bytes.push(first * 16 + digit);
                } else {
                    high = Some(digit);
                }
            }
            if high.is_some() {
                return Err("invalidHex");
            }
            std::str::from_utf8(&bytes)
                .map_err(|_| "invalidUtf8")?
                .to_string()
        }
        "time.seconds" | "time.millis" => {
            let stamp = input.parse::<i64>().map_err(|_| "invalidTimestamp")?;
            let date = if command == "time.seconds" {
                DateTime::<Utc>::from_timestamp(stamp, 0)
            } else {
                DateTime::<Utc>::from_timestamp_millis(stamp)
            }
            .ok_or("invalidTimestamp")?;
            let zone = parameter.parse::<Tz>().map_err(|_| "invalidTimezone")?;
            date.with_timezone(&zone)
                .to_rfc3339_opts(SecondsFormat::AutoSi, false)
        }
        "date.seconds" | "date.millis" | "date.zone" => {
            // An explicit offset resolves DST overlaps without guessing a wall-clock instant.
            let date = DateTime::parse_from_rfc3339(input).map_err(|_| "invalidDate")?;
            match command {
                "date.seconds" => {
                    if date.timestamp_subsec_nanos() != 0 {
                        return Err("subsecondPrecision");
                    }
                    date.timestamp().to_string()
                }
                "date.millis" => {
                    if date.timestamp_subsec_nanos() % 1_000_000 != 0 {
                        return Err("subsecondPrecision");
                    }
                    date.timestamp_millis().to_string()
                }
                _ => date
                    .with_timezone(&parameter.parse::<Tz>().map_err(|_| "invalidTimezone")?)
                    .to_rfc3339_opts(SecondsFormat::AutoSi, false),
            }
        }
        "text.unique" | "text.sort" | "text.reverseSort" => {
            // Distinguish blank lines from EOF and retain the first separator style.
            let mut lines = input
                .split_inclusive('\n')
                .map(|line| {
                    if let Some(line) = line.strip_suffix("\r\n") {
                        (line, "\r\n")
                    } else if let Some(line) = line.strip_suffix('\n') {
                        (line, "\n")
                    } else {
                        (line, "")
                    }
                })
                .collect::<Vec<_>>();
            if command == "text.unique" {
                let mut seen = HashSet::new();
                lines.retain(|(line, _)| seen.insert(*line));
            } else {
                lines.sort_by(|a, b| a.0.cmp(b.0));
                if command == "text.reverseSort" {
                    lines.reverse();
                }
            }
            let ending = if input
                .find('\n')
                .is_some_and(|index| index > 0 && input.as_bytes()[index - 1] == b'\r')
            {
                "\r\n"
            } else {
                "\n"
            };
            let mut output = String::new();
            for (index, (line, _)) in lines.iter().enumerate() {
                output.push_str(line);
                if index + 1 < lines.len() || input.ends_with('\n') {
                    output.push_str(ending);
                }
            }
            output
        }
        "text.ansi" => {
            let bytes = Zeroizing::new(strip_ansi_escapes::strip(input));
            String::from_utf8(bytes.to_vec()).map_err(|_| "invalidUtf8")?
        }
        "text.regex" => {
            if parameter.is_empty() {
                return Err("invalidRegex");
            }
            let regex = RegexBuilder::new(parameter)
                .size_limit(2 * 1024 * 1024)
                .build()
                .map_err(|_| "invalidRegex")?;
            let mut output = Zeroizing::new(String::new());
            // Extract complete, non-overlapping matches; flags such as (?m) are explicit.
            for (index, matched) in regex.find_iter(input).enumerate() {
                if index > 0 {
                    output.push('\n');
                }
                if index >= 10_000 || output.len() + matched.len() > 2 * 1024 * 1024 {
                    return Err("limit");
                }
                output.push_str(matched.as_str());
            }
            return Ok(output);
        }
        "hash.sha256" => format!("{:x}", Sha256::digest(input.as_bytes())),
        "hash.sha512" => format!("{:x}", Sha512::digest(input.as_bytes())),
        "generate.uuid" => {
            let mut bytes = Zeroizing::new([0u8; 16]);
            getrandom::fill(&mut *bytes).map_err(|_| "randomUnavailable")?;
            bytes[6] = (bytes[6] & 0x0f) | 0x40;
            bytes[8] = (bytes[8] & 0x3f) | 0x80;
            let mut output = String::new();
            for (index, byte) in bytes.iter().enumerate() {
                if matches!(index, 4 | 6 | 8 | 10) {
                    output.push('-');
                }
                write!(output, "{byte:02x}").unwrap();
            }
            output
        }
        "random.alphanumeric" | "random.hex" | "random.digits" => {
            let length = parameter
                .parse::<usize>()
                .ok()
                .filter(|length| (1..=4096).contains(length))
                .ok_or("invalidLength")?;
            let alphabet: &[u8] = match command {
                "random.hex" => b"0123456789abcdef",
                "random.digits" => b"0123456789",
                _ => b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
            };
            random_text(length, alphabet)?
        }
        _ => return Err("failed"),
    };
    Ok(Zeroizing::new(result))
}

fn hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn random_text(length: usize, alphabet: &[u8]) -> Result<String, &'static str> {
    let limit = 256 - 256 % alphabet.len();
    let mut output = Zeroizing::new(String::with_capacity(length));
    let mut bytes = Zeroizing::new([0u8; 128]);
    while output.len() < length {
        getrandom::fill(&mut *bytes).map_err(|_| "randomUnavailable")?;
        for byte in &*bytes {
            // Rejection sampling avoids favoring characters when the alphabet does not divide 256.
            if (*byte as usize) < limit {
                output.push(alphabet[*byte as usize % alphabet.len()] as char);
            }
            if output.len() == length {
                break;
            }
        }
    }
    Ok(std::mem::take(&mut *output))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn encoding_time_text_and_hash_contracts() {
        for (command, input, parameter, expected) in [
            (
                "url.encode",
                "中文 +/\n",
                "",
                "%E4%B8%AD%E6%96%87%20%2B%2F%0A",
            ),
            ("url.decode", "%E4%B8%AD%E6%96%87+%20", "", "中文+ "),
            ("hex.encode", "中\r\n", "", "e4b8ad0d0a"),
            ("hex.decode", "e4 b8 ad 0D 0a", "", "中\r\n"),
            (
                "time.seconds",
                "0",
                "Asia/Shanghai",
                "1970-01-01T08:00:00+08:00",
            ),
            ("time.millis", "-1", "UTC", "1969-12-31T23:59:59.999+00:00"),
            ("date.millis", "1969-12-31T23:59:59.999Z", "", "-1"),
            (
                "date.zone",
                "2024-03-10T07:00:00Z",
                "America/New_York",
                "2024-03-10T03:00:00-04:00",
            ),
            ("text.unique", "b\r\na\r\nb\r\n\r\n", "", "b\r\na\r\n\r\n"),
            ("text.sort", "b\na", "", "a\nb"),
            (
                "text.ansi",
                "\x1b[31m红色\x1b[0m\n\x1b]8;;https://example.test\x1b\\link\x1b]8;;\x1b\\",
                "",
                "红色\nlink",
            ),
            ("text.regex", "id=12 id=34", "\\d+", "12\n34"),
            (
                "hash.sha256",
                "abc",
                "",
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            ),
            (
                "hash.sha512",
                "abc",
                "",
                "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
            ),
        ] {
            assert_eq!(
                run(command, input, parameter).unwrap().as_str(),
                expected,
                "{command}"
            );
        }
        for (command, input, parameter, error) in [
            ("url.decode", "%Q0", "", "invalidUrl"),
            ("hex.decode", "f", "", "invalidHex"),
            ("hex.decode", "ff", "", "invalidUtf8"),
            ("time.seconds", "1.5", "UTC", "invalidTimestamp"),
            ("time.seconds", "0", "guess", "invalidTimezone"),
            ("date.seconds", "2024-11-03T01:30:00", "", "invalidDate"),
            (
                "date.seconds",
                "1970-01-01T00:00:00.001Z",
                "",
                "subsecondPrecision",
            ),
            ("text.regex", "private input", "[", "invalidRegex"),
            ("random.hex", "", "0", "invalidLength"),
        ] {
            assert_eq!(
                run(command, input, parameter).unwrap_err(),
                error,
                "{command}"
            );
        }
        assert_ne!(
            run("hash.sha256", "abc\n", "").unwrap(),
            run("hash.sha256", "abc", "").unwrap()
        );
    }
}
