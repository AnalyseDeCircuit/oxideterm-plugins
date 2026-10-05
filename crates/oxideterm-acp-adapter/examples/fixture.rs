// A real child process fixture verifies the packaged adapters without agent accounts.
use serde_json::{Value, json};
use std::io::{self, BufRead, Write};

fn emit(value: Value) {
    println!("{value}");
    io::stdout().flush().unwrap();
}

fn main() {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.first().is_some_and(|arg| arg == "app-server") {
        for line in io::stdin().lock().lines() {
            let message: Value = serde_json::from_str(&line.unwrap()).unwrap();
            let method = message["method"].as_str().unwrap_or_default();
            let Some(id) = message.get("id") else {
                continue;
            };
            let result = match method {
                "initialize" => json!({"userAgent":"fixture"}),
                "config/read" => json!({"config":{"model":"fixture-model"}}),
                "model/list" => {
                    json!({"data":[{"id":"fixture-model","displayName":"Fixture Model","isDefault":true}],"nextCursor":null})
                }
                "thread/start" | "thread/resume" => json!({"thread":{"id":"fixture-thread"}}),
                "turn/start" => json!({"turn":{"id":"fixture-turn"}}),
                "turn/interrupt" => json!({}),
                _ => panic!("Unexpected fixture method: {method}"),
            };
            emit(json!({"id":id,"result":result}));
            if method == "turn/start" {
                let hold = message["params"]["input"][0]["text"] == "hold";
                emit(
                    json!({"method":"item/agentMessage/delta","params":{"delta":if hold {"waiting"} else {"fixture output"}}}),
                );
                if !hold {
                    emit(json!({"method":"turn/completed","params":{}}));
                }
            }
            if method == "turn/interrupt" {
                emit(json!({"method":"turn/completed","params":{}}));
            }
        }
    } else {
        assert!(args.iter().any(|arg| arg == "--output-format"));
        emit(
            json!({"type":"system","subtype":"init","model":"fixture-model","session_id":"fixture-session"}),
        );
        let hold = args.last().is_some_and(|arg| arg == "hold");
        emit(
            json!({"type":"stream_event","session_id":"fixture-session","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":if hold {"waiting"} else {"fixture output"}}}}),
        );
        if hold {
            std::thread::sleep(std::time::Duration::from_secs(60));
        }
    }
}
