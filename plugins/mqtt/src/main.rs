mod config;
mod model;
mod protocol;
mod session;
mod ui;

use serde_json::{Value, json};
use std::collections::HashMap;
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, BufReader},
    sync::mpsc,
};
use zeroize::Zeroize;
use zeroize::Zeroizing;

#[tokio::main]
async fn main() {
    let code = if run().await.is_ok() { 0 } else { 1 };
    // Tokio's stdin worker can still be blocked in an OS read after deactivate.
    std::process::exit(code);
}

async fn run() -> std::io::Result<()> {
    let mut input = BufReader::new(tokio::io::stdin());
    let mut output = tokio::io::stdout();
    let (updates, mut incoming) = mpsc::channel::<session::Update>(16);
    let mut sessions = HashMap::<String, session::Session>::new();
    let mut active = false;
    let mut credentials_allowed = false;
    let mut line = Zeroizing::new(Vec::new());
    loop {
        let remaining = (2 * 1024 * 1024 + 1 - line.len()) as u64;
        tokio::select! {
            read = async { (&mut input).take(remaining).read_until(b'\n', &mut line).await } => {
                read?;
                if line.is_empty() || line.len()>2*1024*1024 { break; }
                let Ok(mut envelope) = serde_json::from_slice::<Value>(&line) else { break; };
                if envelope["protocolVersion"] != 1 { protocol::erase(&mut envelope); break; }
                let request = envelope["payload"]["requestId"].clone();
                let kind = &envelope["payload"]["kind"];
                let mut stopping = false;
                let result = match kind["type"].as_str().unwrap_or("") {
                    "activate" => {
                        let capabilities = kind["permissions"]["capabilities"].as_array();
                        active = capabilities.is_some_and(|v|v.iter().any(|x|x=="ui.write"));
                        credentials_allowed = capabilities.is_some_and(|v|v.iter().any(|x|x=="credentials.raw.read"));
                        if active {
                            protocol::frame(&mut output, Value::Null, json!({"type":"runtimeReady"})).await?;
                            Ok(json!({"activated":true}))
                        } else { Err("permission_denied") }
                    }
                    "health" => Ok(json!({"ok":true})),
                    "deactivate" | "kill" => { stopping = true; Ok(Value::Null) }
                    "dispatchCommand" if active => {
                        let args = &kind["args"];
                        let id = args["instanceId"].as_str().unwrap_or("").to_string();
                        match kind["command"].as_str().unwrap_or("") {
                            "connection.open" if !id.is_empty() && args["typeId"]=="mqtt" => {
                                if sessions.contains_key(&id) || sessions.len()>=16 { Err("instance_limit") }
                                else if args["credentials"].as_object().is_some_and(|v|!v.is_empty()) && !credentials_allowed { Err("permission_denied") }
                                else { match config::options(args) {
                                    Ok(options) => {
                                        sessions.insert(id.clone(), session::Session::start(id, options, updates.clone()));
                                        Ok(json!({"kind":"workbench","schema":ui::schema(&model::Model::default())}))
                                    }
                                    Err(error) => Err(error),
                                }}
                            }
                            "connection.close" => {
                                if let Some(session) = sessions.remove(&id) { session.close().await; }
                                Ok(Value::Null)
                            }
                            _ => Err("unsupported_command"),
                        }
                    }
                    "sendEvent" if active => {
                        let event = &kind["event"];
                        if event["name"]=="ui.event" {
                            if let Some(session) = event["payload"]["surfaceId"].as_str().and_then(|id|sessions.get(id)) {
                                match session.commands.try_send(session::UiEvent(event["payload"].clone())) {
                                    Ok(()) => Ok(Value::Null),
                                    Err(_) => Err("queue_full")
                                }
                            } else { Err("instance_closed") }
                        } else { Ok(Value::Null) }
                    }
                    "cancelRequest" => Ok(Value::Null),
                    _ => Err("unsupported_request"),
                };
                protocol::erase(&mut envelope);
                line.zeroize();
                if stopping {
                    close_all(&mut sessions).await;
                }
                protocol::reply(&mut output, request, result).await?;
                if stopping { break; }
            }
            Some(mut update) = incoming.recv() => {
                if sessions.contains_key(&update.instance) {
                    protocol::frame(&mut output, Value::Null, json!({"type":"registerContribution","registration":{
                        "registrationId":format!("mqtt-{}",update.instance),"pluginId":protocol::PLUGIN_ID,"kind":"tab",
                        "metadata":{"connectionId":update.instance,"schema":update.schema.take()}
                    }})).await?;
                }
            }
        }
    }
    close_all(&mut sessions).await;
    Ok(())
}

async fn close_all(sessions: &mut HashMap<String, session::Session>) {
    let mut closing = tokio::task::JoinSet::new();
    for (_, session) in sessions.drain() {
        closing.spawn(session.close());
    }
    while closing.join_next().await.is_some() {}
}
