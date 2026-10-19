use chrono::{Local, SecondsFormat};
use serde_json::{Value, json};
use std::collections::{BTreeMap, VecDeque};
use zeroize::Zeroizing;

pub const MAX_MESSAGES: usize = 1000;
pub const MAX_BUFFER_BYTES: usize = 8 * 1024 * 1024;
pub const VISIBLE_MESSAGES: usize = 200;
pub const MAX_SUBSCRIPTIONS: usize = 32;

#[derive(Clone)]
pub struct Message {
    pub id: String,
    pub time: String,
    pub topic: String,
    pub body: Zeroizing<Vec<u8>>,
    pub qos: u8,
    pub retain: bool,
    pub direction: &'static str,
    pub status: &'static str,
}

pub struct Model {
    pub input_sources: Value,
    pub page: String,
    pub status: &'static str,
    pub notice: Option<&'static str>,
    pub subscriptions: BTreeMap<String, u8>,
    pub subscription: String,
    pub sub_qos: u8,
    pub selected_subscription: String,
    pub messages: VecDeque<Message>,
    pub paused: Option<Vec<Message>>,
    pub selected: String,
    pub topic_filter: String,
    pub keyword: String,
    pub detail_format: String,
    pub publish_topic: String,
    pub body: Zeroizing<String>,
    pub encoding: String,
    pub publish_qos: u8,
    pub retain: bool,
    pub received: u64,
    pub sent: u64,
    pub evicted: u64,
    sequence: u64,
    buffer_bytes: usize,
}

impl Default for Model {
    fn default() -> Self {
        let mut model = Self {
            input_sources: json!({}),
            page: "messages".into(),
            status: "connecting",
            notice: None,
            subscriptions: BTreeMap::new(),
            subscription: String::new(),
            sub_qos: 0,
            selected_subscription: String::new(),
            messages: VecDeque::new(),
            paused: None,
            selected: String::new(),
            topic_filter: String::new(),
            keyword: String::new(),
            detail_format: "text".into(),
            publish_topic: String::new(),
            body: Zeroizing::new(String::new()),
            encoding: "text".into(),
            publish_qos: 0,
            retain: false,
            received: 0,
            sent: 0,
            evicted: 0,
            sequence: 0,
            buffer_bytes: 0,
        };
        model.restore_input_sources();
        model
    }
}

impl Model {
    pub fn restore_input_sources(&mut self) {
        crate::protocol::erase(&mut self.input_sources);
        self.input_sources = json!({
            "subscriptions/filter": self.subscription,
            "subscriptions/qos": self.sub_qos.to_string(),
            "messages/topic_filter": self.topic_filter,
            "messages/keyword": self.keyword,
            "messages/format": self.detail_format,
        });
        self.restore_publisher_sources();
    }

    pub fn restore_publisher_sources(&mut self) {
        for (key, value) in [
            ("publish/topic", json!(self.publish_topic)),
            ("publish/body", json!(self.body.as_str())),
            ("publish/qos", json!(self.publish_qos.to_string())),
            ("publish/retain", json!(self.retain)),
            ("publish/encoding", json!(self.encoding)),
        ] {
            crate::protocol::erase(&mut self.input_sources[key]);
            self.input_sources[key] = value;
        }
    }

    pub fn record(
        &mut self,
        topic: String,
        body: Vec<u8>,
        qos: u8,
        retain: bool,
        incoming: bool,
    ) -> String {
        self.sequence += 1;
        let id = self.sequence.to_string();
        if incoming {
            self.received += 1;
        } else {
            self.sent += 1;
        }
        self.buffer_bytes += body.len() + topic.len();
        self.messages.push_back(Message {
            id: id.clone(),
            time: Local::now().to_rfc3339_opts(SecondsFormat::Millis, false),
            topic,
            body: Zeroizing::new(body),
            qos,
            retain,
            direction: if incoming { "←" } else { "→" },
            status: if incoming { "received" } else { "queued" },
        });
        while self.messages.len() > MAX_MESSAGES || self.buffer_bytes > MAX_BUFFER_BYTES {
            let message = self.messages.pop_front().unwrap();
            self.buffer_bytes -= message.body.len() + message.topic.len();
            self.evicted += 1;
        }
        id
    }

    pub fn visible(&self) -> Vec<&Message> {
        let messages: Vec<_> = if let Some(frozen) = &self.paused {
            frozen.iter().collect()
        } else {
            self.messages.iter().collect()
        };
        messages
            .into_iter()
            .rev()
            .filter(|m| {
                m.topic.contains(&self.topic_filter)
                    && String::from_utf8_lossy(&m.body).contains(&self.keyword)
            })
            .take(VISIBLE_MESSAGES)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect()
    }

    pub fn selected_message(&self) -> Option<&Message> {
        if let Some(frozen) = &self.paused {
            frozen.iter().find(|m| m.id == self.selected)
        } else {
            self.messages.iter().find(|m| m.id == self.selected)
        }
    }

    pub fn update_status(&mut self, id: &str, status: &'static str) {
        if let Some(message) = self.messages.iter_mut().find(|m| m.id == id) {
            message.status = status;
        }
    }

    pub fn clear(&mut self) {
        self.messages.clear();
        self.buffer_bytes = 0;
        self.evicted = 0;
        self.selected.clear();
        if let Some(frozen) = &mut self.paused {
            frozen.clear();
        }
    }
}

impl Drop for Model {
    fn drop(&mut self) {
        crate::protocol::erase(&mut self.input_sources);
    }
}

pub fn hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn decode(text: &str, encoding: &str) -> Result<Zeroizing<Vec<u8>>, &'static str> {
    let bytes = match encoding {
        "text" => text.as_bytes().to_vec(),
        "json" => {
            let mut value: Value = serde_json::from_str(text).map_err(|_| "invalid_json")?;
            crate::protocol::erase(&mut value);
            text.as_bytes().to_vec()
        }
        "hex" => {
            let compact: Vec<_> = text.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
            if compact.len() % 2 != 0 {
                return Err("invalid_hex");
            }
            compact
                .chunks(2)
                .map(|pair| {
                    let hi = (pair[0] as char).to_digit(16).ok_or("invalid_hex")?;
                    let lo = (pair[1] as char).to_digit(16).ok_or("invalid_hex")?;
                    Ok((hi * 16 + lo) as u8)
                })
                .collect::<Result<Vec<_>, &'static str>>()?
        }
        _ => return Err("invalid_config"),
    };
    let bytes = Zeroizing::new(bytes);
    if bytes.len() > crate::config::MAX_PAYLOAD {
        return Err("payload_limit");
    }
    Ok(bytes)
}

pub fn row(message: &Message) -> Value {
    json!({"id":message.id,"direction":message.direction,"time":message.time,
        "topic":message.topic.chars().take(256).collect::<String>(),"qos":message.qos,"retain":if message.retain {"✓"}else{""},
        "size":message.body.len(),"status":format!("@mqtt.{}",message.status),
        "preview":String::from_utf8_lossy(&message.body).chars().take(100).collect::<String>()})
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retention_pause_and_payload_formats_keep_meaning() {
        assert_eq!(&*decode("00 ff 41", "hex").unwrap(), &[0, 255, 65]);
        assert!(matches!(decode("0g", "hex"), Err("invalid_hex")));
        assert!(matches!(decode("{", "json"), Err("invalid_json")));
        assert_eq!(&*decode("", "text").unwrap(), b"");
        let mut model = Model::default();
        model.record("first".into(), b"before".to_vec(), 1, true, true);
        model.paused = Some(model.visible().into_iter().cloned().collect());
        model.selected = "1".into();
        for _ in 0..MAX_MESSAGES {
            model.record("next".into(), vec![1], 0, false, true);
        }
        assert_eq!(model.evicted, 1);
        assert_eq!(model.messages.front().unwrap().topic, "next");
        assert_eq!(model.selected_message().unwrap().body.as_slice(), b"before");
        model.paused = None;
        assert!(model.selected_message().is_none());
        model.clear();
        assert_eq!(model.buffer_bytes, 0);
        assert_eq!(model.received, 1001);
    }
}
