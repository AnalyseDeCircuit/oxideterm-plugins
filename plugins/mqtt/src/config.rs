use rumqttc::{MqttOptions, Transport};
use serde_json::Value;
use std::time::Duration;
use zeroize::Zeroizing;

pub const MAX_PAYLOAD: usize = 64 * 1024;

pub fn options(args: &Value) -> Result<MqttOptions, &'static str> {
    let config = &args["config"];
    let text = |key: &str| {
        config
            .get(format!("root/{key}"))
            .and_then(Value::as_str)
            .unwrap_or("")
    };
    let number = |key: &str, default: u64| -> Result<u64, &'static str> {
        match config.get(format!("root/{key}")) {
            None | Some(Value::Null) => Ok(default),
            Some(Value::String(s)) if s.is_empty() => Ok(default),
            Some(Value::String(s)) => s.parse().map_err(|_| "invalid_config"),
            Some(v) => v.as_u64().ok_or("invalid_config"),
        }
    };
    let host = text("host").trim();
    if host.is_empty() || host.chars().any(char::is_control) || host.contains("://") {
        return Err("invalid_config");
    }
    let tls = config["root/tls"].as_bool().unwrap_or(false);
    let port = number("port", if tls { 8883 } else { 1883 })?;
    let keep_alive = number("keep_alive", 30)?;
    if !(1..=65535).contains(&port) || !(5..=65535).contains(&keep_alive) {
        return Err("invalid_config");
    }
    let id = if text("client_id").is_empty() {
        format!("ox-{}", &uuid::Uuid::new_v4().simple().to_string()[..20])
    } else {
        text("client_id").to_string()
    };
    if id.len() > 65535 || id.chars().any(char::is_control) {
        return Err("invalid_config");
    }
    let clean = config["root/clean_session"].as_bool().unwrap_or(true);
    if !clean && text("client_id").is_empty() {
        return Err("persistent_id");
    }
    let mut options = MqttOptions::new(id, host, port as u16);
    options.set_keep_alive(Duration::from_secs(keep_alive));
    options.set_clean_session(clean);
    options.set_max_packet_size(MAX_PAYLOAD + 65536, MAX_PAYLOAD + 65536);
    let password = Zeroizing::new(
        args["credentials"]["root/password"]
            .as_str()
            .unwrap_or("")
            .to_owned(),
    );
    if !password.is_empty() && text("username").is_empty() {
        return Err("username_required");
    }
    if !text("username").is_empty() {
        // The MQTT library owns its authentication copy for the lifetime of this session.
        // Never format options or connection errors into diagnostics or view state.
        options.set_credentials(text("username"), password.as_str());
    }
    if tls {
        let ca = text("ca_pem");
        options.set_transport(if ca.trim().is_empty() {
            Transport::tls_with_default_config()
        } else {
            Transport::tls(ca.as_bytes().to_vec(), None, None)
        });
    }
    Ok(options)
}

pub fn valid_topic(value: &str, subscription: bool) -> bool {
    if value.is_empty() || value.len() > 1024 || value.chars().any(|c| c == '\0') {
        return false;
    }
    if !subscription {
        return !value.contains(['#', '+']);
    }
    let levels: Vec<_> = value.split('/').collect();
    levels.iter().enumerate().all(|(i, level)| {
        (!level.contains('#') || (*level == "#" && i + 1 == levels.len()))
            && (!level.contains('+') || *level == "+")
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn topic_and_connection_inputs_preserve_protocol_boundaries() {
        for (topic, subscribe, valid) in [
            ("sensors/+/state", true, true),
            ("sensors/#", true, true),
            ("/", true, true),
            ("sensors/#/state", true, false),
            ("sensors/a+", true, false),
            ("", true, false),
            ("sensors/+", false, false),
            ("sensors/a", false, true),
            ("a\0b", false, false),
        ] {
            assert_eq!(valid_topic(topic, subscribe), valid, "{topic:?}");
        }
        assert!(matches!(
            options(&json!({"config":{"root/host":"localhost", "root/port":"70000"}})),
            Err("invalid_config")
        ));
        assert!(matches!(
            options(&json!({"config":{"root/host":"localhost", "root/clean_session":false}})),
            Err("persistent_id")
        ));
    }
}
