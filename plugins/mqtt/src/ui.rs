use crate::model::{Model, hex, row};
use serde_json::{Value, json};
use zeroize::Zeroizing;

pub fn translations() -> Value {
    serde_json::from_str(include_str!("../locales.json")).unwrap()
}
fn field(kind: &str, id: &str, label: &str, value: impl Into<Value>) -> Value {
    json!({"kind":kind,"id":id,"label":format!("@mqtt.{label}"),"value":value.into()})
}
fn button(id: &str, label: &str, disabled: bool) -> Value {
    json!({"kind":"button","id":id,"label":format!("@mqtt.{label}"),"variant":"outline","disabled":disabled})
}
fn select(id: &str, label: &str, value: &str, choices: &[(&str, &str)]) -> Value {
    json!({"kind":"select","id":id,"label":format!("@mqtt.{label}"),"value":value,
        "options":choices.iter().map(|(value,label)|json!({"value":value,"label":label})).collect::<Vec<_>>()})
}
fn qos(id: &str, value: u8) -> Value {
    select(
        id,
        "qos",
        &value.to_string(),
        &[("0", "0"), ("1", "1"), ("2", "2")],
    )
}

pub fn schema(model: &Model) -> Value {
    let rows = model.visible();
    let selected = model.selected_message();
    let detail = Zeroizing::new(
        selected
            .map(|m| match model.detail_format.as_str() {
                "hex" => hex(&m.body),
                "json" => serde_json::from_slice::<Value>(&m.body)
                    .and_then(|mut v| {
                        let result = serde_json::to_string_pretty(&v);
                        crate::protocol::erase(&mut v);
                        result
                    })
                    .unwrap_or_else(|_| String::from_utf8_lossy(&m.body).into_owned()),
                _ => String::from_utf8_lossy(&m.body).into_owned(),
            })
            .unwrap_or_default(),
    );
    let mut status = vec![
        json!({"kind":"statusBadge","label":format!("@mqtt.{}",model.status),"tone":if model.status=="connected" {"success"}else{"warning"}}),
        json!({"kind":"keyValue","label":"@mqtt.received","value":model.received}),
        json!({"kind":"keyValue","label":"@mqtt.published","value":model.sent}),
        json!({"kind":"keyValue","label":"@mqtt.evicted","value":model.evicted}),
    ];
    status = vec![
        json!({"kind":"row","children":status}),
        json!({"kind":"segmentedControl","id":"page","value":model.page,"options":[{"label":"@mqtt.messages","value":"messages"},{"label":"@mqtt.subscriptions","value":"subscriptions"}]}),
    ];
    if model.status != "connected" {
        status.push(button("retry", "retry", false));
    }
    if let Some(notice) = model.notice {
        status.push(json!({"kind":"alert","tone":"warning","text":format!("@mqtt.{notice}")}));
    }
    let mut schema = json!({"componentVersion":1,"kind":"form","title":"MQTT","translations":translations(),"sections":[
        {"id":"session","controls":status},
        {"id":"subscriptions","title":"@mqtt.subscriptions","controls":[
            {"kind":"row","children":[field("text","filter","topic_filter",model.subscription.as_str()),qos("qos",model.sub_qos),button("subscribe","subscribe",model.status!="connected")]},
            {"kind":"table","id":"list","selectable":true,"rowKey":"id","value":model.selected_subscription,
             "columnDefs":[{"key":"topic","label":"@mqtt.topic"},{"key":"qos","label":"QoS"}],
             "rows":model.subscriptions.iter().map(|(topic,qos)|json!({"id":topic,"topic":topic,"qos":qos})).collect::<Vec<_>>()},
            button("unsubscribe","unsubscribe",model.selected_subscription.is_empty() || model.status!="connected")
        ]},
        {"id":"messages","title":"@mqtt.messages","description":"@mqtt.buffer_hint","controls":[
            {"kind":"row","children":[field("text","topic_filter","topic_filter",model.topic_filter.as_str()),field("text","keyword","keyword",model.keyword.as_str()),button("pause",if model.paused.is_some(){"resume"}else{"pause"},false),button("clear","clear",false)]},
            {"kind":"table","id":"list","rowKey":"id","selectable":true,"value":model.selected,
            "columnDefs":[{"key":"direction","label":"↔"},{"key":"time","label":"@mqtt.time"},{"key":"topic","label":"@mqtt.topic","style":"mono"},{"key":"preview","label":"@mqtt.payload"}],
            "rows":rows.into_iter().map(row).collect::<Vec<_>>()},
            {"kind":"row","children":[select("format","format",&model.detail_format,&[("text","@mqtt.text"),("json","JSON"),("hex","Hex")]),button("reuse","reuse",selected.is_none())]},
            {"kind":"row","children":[
                {"kind":"keyValue","label":"QoS","value":selected.map(|m|m.qos)},
                {"kind":"keyValue","label":"@mqtt.retain","value":selected.map(|m|m.retain)},
                {"kind":"statusBadge","label":selected.map(|m|format!("@mqtt.{}",m.status)).unwrap_or_else(||"—".into())}
            ]},
            {"kind":"keyValue","label":"@mqtt.topic","value":selected.map(|m|m.topic.as_str()).unwrap_or("—")},
            {"kind":"textarea","id":"details","disabled":true,"value":detail.as_str()}
        ]},
        {"id":"publish","title":"@mqtt.publish","controls":[
            field("text","topic","topic",model.publish_topic.as_str()),
            {"kind":"row","children":[qos("qos",model.publish_qos),field("checkbox","retain","retain",model.retain),select("encoding","format",&model.encoding,&[("text","@mqtt.text"),("json","JSON"),("hex","Hex")])]},
            field("textarea","body","payload",model.body.as_str()),
            button("send","publish",model.status!="connected")
        ]}
    ]});
    schema["sections"]
        .as_array_mut()
        .unwrap()
        .retain_mut(|section| {
            let keep = section["id"] == "session"
                || if model.page == "subscriptions" {
                    section["id"] == "subscriptions"
                } else {
                    section["id"] != "subscriptions"
                };
            if !keep {
                crate::protocol::erase(section);
            }
            keep
        });
    // Input events already update the host's draft. Echoing them in asynchronous
    // snapshots would replace newer typing and IME composition with stale text.
    fn seed(controls: &mut Value, section: &str, sources: &Value) {
        if let Some(controls) = controls.as_array_mut() {
            for control in controls {
                let key = format!("{section}/{}", control["id"].as_str().unwrap_or(""));
                if let Some(value) = sources.get(&key) {
                    crate::protocol::erase(&mut control["value"]);
                    control["value"] = value.clone();
                }
                if let Some(children) = control.get_mut("children") {
                    seed(children, section, sources);
                }
            }
        }
    }
    for section in schema["sections"].as_array_mut().unwrap() {
        let id = section["id"].as_str().unwrap().to_owned();
        seed(&mut section["controls"], &id, &model.input_sources);
    }
    protect_literal_values(&mut schema);
    schema
}

fn protect_literal_values(schema: &mut Value) {
    // The host translates matching strings recursively. Keep broker content and
    // drafts literal by giving only presentation labels a collision-free namespace.
    fn uses_prefix(value: &Value, prefix: &str) -> bool {
        match value {
            Value::String(s) => s.starts_with(prefix),
            Value::Array(items) => items.iter().any(|v| uses_prefix(v, prefix)),
            Value::Object(items) => items.values().any(|v| uses_prefix(v, prefix)),
            _ => false,
        }
    }
    let mut prefix = "ui.".to_string();
    while uses_prefix(schema, &format!("@{prefix}")) {
        prefix.insert(0, '_');
    }
    fn labels(value: &mut Value, prefix: &str) {
        match value {
            Value::Array(items) => items.iter_mut().for_each(|v| labels(v, prefix)),
            Value::Object(items) => {
                for (key, value) in items {
                    if matches!(key.as_str(), "label" | "title" | "description" | "text") {
                        if let Some(text) = value.as_str().filter(|s| s.starts_with("@mqtt.")) {
                            *value = Value::String(format!("@{prefix}{}", &text[1..]));
                        }
                    }
                    labels(value, prefix);
                }
            }
            _ => (),
        }
    }
    labels(&mut schema["sections"], &prefix);
    for dictionary in schema["translations"].as_object_mut().unwrap().values_mut() {
        let old = std::mem::take(dictionary.as_object_mut().unwrap());
        *dictionary = Value::Object(
            old.into_iter()
                .map(|(key, value)| (format!("{prefix}{key}"), value))
                .collect(),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn live_views_preserve_host_drafts_and_literal_payloads() {
        let mut model = Model::default();
        model.body = Zeroizing::new("newer local draft".into());
        model.selected = model.record(
            "device/state".into(),
            b"@ui.mqtt.text".to_vec(),
            1,
            false,
            true,
        );
        let view = schema(&model);
        let publisher = &view["sections"][2]["controls"];
        assert_eq!(
            publisher[2]["value"], "",
            "input echoes must not replace the host draft"
        );
        let messages = &view["sections"][1]["controls"];
        assert_eq!(messages[1]["rows"][0]["preview"], "@ui.mqtt.text");
        assert_eq!(messages[5]["value"], "@ui.mqtt.text");
        for dictionary in view["translations"].as_object().unwrap().values() {
            assert!(dictionary.get("ui.mqtt.text").is_none());
            assert!(dictionary.get("_ui.mqtt.text").is_some());
        }
        model.restore_publisher_sources();
        assert_eq!(
            schema(&model)["sections"][2]["controls"][2]["value"],
            "newer local draft"
        );
    }
}
