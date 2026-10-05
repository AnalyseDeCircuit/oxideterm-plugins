// SPDX-License-Identifier: MIT
use serde_json::{Value, json};
use std::io::{self, BufRead, Read, Write};
use zeroize::Zeroizing;

pub fn read_source(args: &Value) -> Result<Zeroizing<Vec<u8>>, &'static str> {
    let path = args["path"].as_str().ok_or("invalid_request")?;
    let file = std::fs::File::open(path).map_err(|_| "unreadable_file")?;
    let mut data = Zeroizing::new(Vec::new());
    file.take(10 * 1024 * 1024 + 1)
        .read_to_end(&mut data)
        .map_err(|_| "unreadable_file")?;
    if data.len() > 10 * 1024 * 1024 {
        return Err("file_too_large");
    }
    Ok(data)
}

pub fn run(render: fn(&Value) -> Result<Value, &'static str>) {
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.len() > 64 * 1024 {
            break;
        }
        let Ok(envelope) = serde_json::from_str::<Value>(&line) else {
            break;
        };
        if envelope["protocolVersion"] != 1 {
            break;
        }
        let request = &envelope["payload"];
        let kind = &request["kind"];
        let result = match kind["type"].as_str() {
            Some("activate") => Ok(json!({"ready":true})),
            Some("health") => Ok(json!({"ok":true})),
            Some("deactivate" | "kill") => Ok(json!({"stopped":true})),
            Some("dispatchCommand") if kind["command"] == "preview.render" => render(&kind["args"]),
            _ => Err("unsupported_request"),
        };
        let result = match result {
            Ok(value) => json!({"status":"ok","value":value}),
            // Parser diagnostics and file bytes must never cross the error boundary.
            Err(code) => {
                json!({"status":"error","error":{"code":code,"message":"File inspection failed","recoverable":true}})
            }
        };
        let response = json!({"protocolVersion":1,"requestId":request["requestId"],"payload":{"requestId":request["requestId"],"result":result}});
        if writeln!(stdout, "{response}")
            .and_then(|_| stdout.flush())
            .is_err()
        {
            break;
        }
        if matches!(kind["type"].as_str(), Some("deactivate" | "kill")) {
            break;
        }
    }
}
