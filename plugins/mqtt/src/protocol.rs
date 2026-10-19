use serde_json::{Value, json};
use tokio::io::{AsyncWrite, AsyncWriteExt};
use zeroize::{Zeroize, Zeroizing};

pub const PLUGIN_ID: &str = "com.oxideterm.mqtt";

pub fn erase(value: &mut Value) {
    match value {
        Value::String(text) => text.zeroize(),
        Value::Array(items) => items.iter_mut().for_each(erase),
        Value::Object(items) => items.values_mut().for_each(erase),
        _ => (),
    }
}

pub async fn frame(
    output: &mut (impl AsyncWrite + Unpin),
    request: Value,
    mut payload: Value,
) -> std::io::Result<()> {
    let mut envelope = json!({"protocolVersion":1,"requestId":request,"payload":payload.take()});
    let mut bytes = Zeroizing::new(serde_json::to_vec(&envelope)?);
    erase(&mut envelope);
    bytes.push(b'\n');
    output.write_all(&bytes).await?;
    output.flush().await
}

pub async fn reply(
    output: &mut (impl AsyncWrite + Unpin),
    request: Value,
    result: Result<Value, &'static str>,
) -> std::io::Result<()> {
    let result = match result {
        Ok(value) => json!({"status":"ok","value":value}),
        Err(code) => {
            json!({"status":"error","error":{"code":code,"message":"MQTT operation could not be completed. Check the connection settings and workbench status.","recoverable":true}})
        }
    };
    frame(
        output,
        request.clone(),
        json!({"requestId":request,"result":result}),
    )
    .await
}
