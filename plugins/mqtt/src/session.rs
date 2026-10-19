use crate::{
    config,
    model::{self, Model},
    protocol, ui,
};
use rumqttc::{AsyncClient, ConnectionError, Event, Incoming, MqttOptions, Outgoing, QoS};
use serde_json::Value;
use std::collections::{BTreeMap, VecDeque};
use std::time::Duration;
use tokio::{
    sync::{mpsc, oneshot},
    task::JoinHandle,
    time::{Instant, MissedTickBehavior},
};
use zeroize::Zeroizing;

pub struct Session {
    pub commands: mpsc::Sender<UiEvent>,
    stop: oneshot::Sender<()>,
    task: JoinHandle<()>,
}

pub struct UiEvent(pub Value);
impl Drop for UiEvent {
    fn drop(&mut self) {
        protocol::erase(&mut self.0);
    }
}

pub struct Update {
    pub instance: String,
    pub schema: Value,
}
impl Drop for Update {
    fn drop(&mut self) {
        protocol::erase(&mut self.schema);
    }
}

impl Session {
    pub fn start(instance: String, options: MqttOptions, updates: mpsc::Sender<Update>) -> Self {
        let (commands, input) = mpsc::channel(64);
        let (stop, stopped) = oneshot::channel();
        let task = tokio::spawn(run(instance, options, input, updates, stopped));
        Self {
            commands,
            task,
            stop,
        }
    }

    pub async fn close(mut self) {
        let _ = self.stop.send(());
        drop(self.commands);
        if tokio::time::timeout(Duration::from_secs(1), &mut self.task)
            .await
            .is_err()
        {
            self.task.abort();
            let _ = self.task.await;
        }
    }
}

fn qos(value: u8) -> QoS {
    match value {
        1 => QoS::AtLeastOnce,
        2 => QoS::ExactlyOnce,
        _ => QoS::AtMostOnce,
    }
}

async fn run(
    instance: String,
    options: MqttOptions,
    mut input: mpsc::Receiver<UiEvent>,
    updates: mpsc::Sender<Update>,
    mut stopped: oneshot::Receiver<()>,
) {
    let (client, mut eventloop) = AsyncClient::new(options, 128);
    eventloop.network_options.set_connection_timeout(10);
    let mut model = Model::default();
    let mut waiting = VecDeque::<String>::new();
    let mut pending = BTreeMap::<u16, String>::new();
    let mut retry_at = Instant::now();
    let mut backoff = 1;
    let mut network_enabled = true;
    let mut dirty = true;
    let mut refresh = tokio::time::interval(Duration::from_millis(125));
    refresh.set_missed_tick_behavior(MissedTickBehavior::Skip);
    loop {
        tokio::select! {
            _ = &mut stopped => { break; }
            command = input.recv() => {
                let Some(mut command) = command else { break; };
                if command.0["sectionId"] == "session" && command.0["controlId"] == "retry" {
                    network_enabled = true;
                    retry_at = Instant::now();
                    backoff = 1;
                    model.notice = None;
                } else if let Err(error) = handle_ui(&mut model, &client, &mut waiting, &command.0) {
                    model.notice = Some(error);
                }
                protocol::erase(&mut command.0);
                dirty = true;
            }
            event = async {
                tokio::time::sleep_until(retry_at).await;
                eventloop.poll().await
            }, if network_enabled => {
                match event {
                    Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                        model.status = "connected";
                        model.notice = None;
                        backoff = 1;
                        // SUBSCRIBE replaces an existing filter, so this also restores sessions
                        // where the broker no longer has the previous subscription state.
                        for (topic, level) in &model.subscriptions {
                            if client.try_subscribe(topic, qos(*level)).is_err() { model.notice = Some("queue_full"); }
                        }
                    }
                    Ok(Event::Incoming(Incoming::Publish(packet))) => {
                        if packet.payload.len() <= config::MAX_PAYLOAD {
                            model.record(packet.topic, packet.payload.to_vec(), packet.qos as u8, packet.retain, true);
                        } else {
                            model.evicted += 1;
                            model.notice = Some("payload_limit");
                        }
                    }
                    Ok(Event::Outgoing(Outgoing::Publish(packet_id))) => {
                        if !pending.contains_key(&packet_id) {
                            if let Some(id) = waiting.pop_front() {
                                model.update_status(&id, if packet_id==0 {"sent"} else {"awaiting_ack"});
                                if packet_id != 0 { pending.insert(packet_id, id); }
                            }
                        }
                    }
                    Ok(Event::Incoming(Incoming::PubAck(ack))) => {
                        if let Some(id) = pending.remove(&ack.pkid) { model.update_status(&id, "acknowledged"); }
                    }
                    Ok(Event::Incoming(Incoming::PubComp(ack))) => {
                        if let Some(id) = pending.remove(&ack.pkid) { model.update_status(&id, "acknowledged"); }
                    }
                    Ok(Event::Incoming(Incoming::SubAck(ack))) => {
                        if ack.return_codes.iter().any(|code| matches!(code, rumqttc::SubscribeReasonCode::Failure)) {
                            model.notice = Some("subscription_rejected");
                        }
                    }
                    Err(error) => {
                        // Broker errors can contain credentials or payloads. Retain only a category.
                        model.notice = Some(match error {
                            ConnectionError::ConnectionRefused(_) => { network_enabled = false; "connection_refused" },
                            ConnectionError::Tls(_) => { network_enabled = false; "tls_failed" },
                            _ => "network_failed",
                        });
                        model.status = if network_enabled {"reconnecting"} else {"failed"};
                        retry_at = Instant::now() + Duration::from_secs(backoff);
                        backoff = (backoff * 2).min(30);
                    }
                    _ => continue,
                }
                dirty = true;
            }
            _ = refresh.tick(), if dirty => {
                let update = Update { instance: instance.clone(), schema: ui::schema(&model) };
                // Network progress never waits for the UI or stdout. Retry with the latest view.
                if updates.try_send(update).is_ok() { dirty = false; }
            }
        }
    }
    if model.status == "connected" {
        let _ = client.try_disconnect();
        let _ = tokio::time::timeout(Duration::from_millis(300), async {
            loop {
                if matches!(
                    eventloop.poll().await,
                    Ok(Event::Outgoing(Outgoing::Disconnect)) | Err(_)
                ) {
                    break;
                }
            }
        })
        .await;
    }
}

fn handle_ui(
    model: &mut Model,
    client: &AsyncClient,
    waiting: &mut VecDeque<String>,
    event: &Value,
) -> Result<(), &'static str> {
    let section = event["sectionId"].as_str().unwrap_or("");
    let control = event["controlId"].as_str().unwrap_or("");
    let value = &event["value"];
    let text = value.as_str().unwrap_or("");
    let level = || {
        text.parse::<u8>()
            .ok()
            .filter(|n| *n <= 2)
            .ok_or("invalid_config")
    };
    match (section, control, event["type"].as_str().unwrap_or("")) {
        ("session", "page", "change") if matches!(text, "messages" | "subscriptions") => {
            model.page = text.into();
            model.restore_input_sources();
        }
        ("subscriptions", "filter", "input") => model.subscription = text.into(),
        ("subscriptions", "qos", "change") => model.sub_qos = level()?,
        ("subscriptions", "list", "change") => model.selected_subscription = text.into(),
        ("subscriptions", "subscribe", "click") => {
            if model.status != "connected" {
                return Err("not_connected");
            }
            if !config::valid_topic(&model.subscription, true) {
                return Err("invalid_topic");
            }
            if model.subscriptions.len() >= model::MAX_SUBSCRIPTIONS
                && !model.subscriptions.contains_key(&model.subscription)
            {
                return Err("subscription_limit");
            }
            client
                .try_subscribe(&model.subscription, qos(model.sub_qos))
                .map_err(|_| "queue_full")?;
            model
                .subscriptions
                .insert(model.subscription.clone(), model.sub_qos);
            model.notice = None;
        }
        ("subscriptions", "unsubscribe", "click") => {
            if model.status != "connected" {
                return Err("not_connected");
            }
            if model
                .subscriptions
                .contains_key(&model.selected_subscription)
            {
                client
                    .try_unsubscribe(&model.selected_subscription)
                    .map_err(|_| "queue_full")?;
                model.subscriptions.remove(&model.selected_subscription);
                model.selected_subscription.clear();
            }
        }
        ("messages", "topic_filter", "input") => {
            model.topic_filter = text.chars().take(1024).collect()
        }
        ("messages", "keyword", "input") => model.keyword = text.chars().take(1024).collect(),
        ("messages", "list", "change") => model.selected = text.into(),
        ("messages", "format", "change") => model.detail_format = text.into(),
        ("messages", "pause", "click") => {
            model.paused = if model.paused.is_some() {
                None
            } else {
                Some(model.visible().into_iter().cloned().collect())
            }
        }
        ("messages", "clear", "click") => model.clear(),
        ("messages", "reuse", "click") => {
            if let Some(message) = model.selected_message().cloned() {
                model.publish_topic = message.topic;
                model.publish_qos = message.qos;
                model.retain = message.retain;
                if let Ok(text) = std::str::from_utf8(&message.body) {
                    model.body = Zeroizing::new(text.to_string());
                    model.encoding = "text".into();
                } else {
                    model.body = Zeroizing::new(model::hex(&message.body));
                    model.encoding = "hex".into();
                }
                model.restore_publisher_sources();
            }
        }
        ("publish", "topic", "input") => model.publish_topic = text.into(),
        ("publish", "body", "input") => {
            if text.len() > config::MAX_PAYLOAD * 3 {
                return Err("payload_limit");
            }
            model.body = Zeroizing::new(text.into());
        }
        ("publish", "qos", "change") => model.publish_qos = level()?,
        ("publish", "retain", "change") => model.retain = value.as_bool().unwrap_or(false),
        ("publish", "encoding", "change") => model.encoding = text.into(),
        ("publish", "send", "click") => {
            if model.status != "connected" {
                return Err("not_connected");
            }
            if !config::valid_topic(&model.publish_topic, false) {
                return Err("invalid_topic");
            }
            let bytes = model::decode(&model.body, &model.encoding)?;
            client
                .try_publish(
                    &model.publish_topic,
                    qos(model.publish_qos),
                    model.retain,
                    bytes.to_vec(),
                )
                .map_err(|_| "queue_full")?;
            let id = model.record(
                model.publish_topic.clone(),
                bytes.to_vec(),
                model.publish_qos,
                model.retain,
                false,
            );
            waiting.push_back(id);
            model.notice = None;
        }
        _ => (),
    }
    Ok(())
}
