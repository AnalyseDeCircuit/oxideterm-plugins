// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

mod engine;
mod wire;
use fernomade_crypto::SessionKey;
use wire::{Event, Request};

#[derive(Clone, Copy, Debug, serde::Serialize, serde::Deserialize)]
pub enum MoshIpFamily {
    Auto,
    Ipv4,
    Ipv6,
}

#[tokio::main]
async fn main() {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    let result = if arguments == ["--stdio"] {
        run(false).await
    } else if arguments == ["--verify-stdio"] {
        run(true).await
    } else {
        Err(std::io::Error::other("Expected --stdio"))
    };
    if result.is_err() {
        std::process::exit(1);
    }
}

async fn run(verify: bool) -> std::io::Result<()> {
    let mut input = tokio::io::stdin();
    let mut output = tokio::io::stdout();
    let Request::Start {
        version: wire::PROTOCOL_VERSION,
        host,
        port,
        family,
        columns,
        rows,
        key,
    } = wire::read_frame(&mut input).await?
    else {
        return Err(std::io::Error::other("Unsupported Mosh handshake"));
    };
    if verify {
        drop(key);
        wire::write_frame(
            &mut output,
            &Event::Ready {
                version: wire::PROTOCOL_VERSION,
            },
        )
        .await?;
        loop {
            match wire::read_frame::<_, Request>(&mut input).await? {
                Request::Input {
                    prediction_id,
                    bytes,
                } => {
                    wire::write_frame(&mut output, &Event::Output(bytes)).await?;
                    wire::write_frame(&mut output, &Event::PredictionAcknowledged(prediction_id))
                        .await?;
                }
                Request::Resize { columns, rows } => {
                    wire::write_frame(&mut output, &Event::RemoteResize { columns, rows }).await?
                }
                Request::Shutdown => {
                    wire::write_frame(
                        &mut output,
                        &Event::Closed(wire::ShutdownOutcome::Acknowledged),
                    )
                    .await?;
                    return Ok(());
                }
                Request::Start { .. } => return Err(std::io::Error::other("Repeated start")),
            }
        }
    }
    let decoded =
        SessionKey::decode(&key).map_err(|_| std::io::Error::other("Invalid Mosh key"))?;
    drop(key);
    let (client, owner) = engine::start_mosh_session(engine::MoshSessionConfig {
        remote_host: host,
        remote_port: port,
        ip_family: family,
        columns,
        rows,
        key: decoded,
    })
    .await
    .map_err(|_| std::io::Error::other("Mosh engine could not start"))?;
    wire::write_frame(
        &mut output,
        &Event::Ready {
            version: wire::PROTOCOL_VERSION,
        },
    )
    .await?;
    relay(input, output, client, owner).await
}

async fn relay(
    mut input: impl tokio::io::AsyncRead + Unpin,
    mut output: impl tokio::io::AsyncWrite + Unpin,
    mut client: engine::MoshSessionClient,
    owner: engine::MoshSessionOwner,
) -> std::io::Result<()> {
    let commands = client.command_sender();
    let requests = async {
        loop {
            let request = wire::read_frame::<_, Request>(&mut input).await?;
            let closing = matches!(request, Request::Shutdown);
            let command = match request {
                Request::Input {
                    prediction_id,
                    bytes,
                } => engine::MoshSessionCommand::Input {
                    prediction_id,
                    bytes: bytes.to_vec(),
                },
                Request::Resize { columns, rows } => {
                    engine::MoshSessionCommand::Resize { columns, rows }
                }
                Request::Shutdown => engine::MoshSessionCommand::Shutdown,
                Request::Start { .. } => return Err(std::io::Error::other("Repeated start")),
            };
            commands
                .send(command)
                .await
                .map_err(|_| std::io::Error::other("Mosh input closed"))?;
            if closing {
                return Ok::<(), std::io::Error>(());
            }
        }
    };
    let events = async {
        while let Some(event) = client.next_event().await {
            let event = convert(event);
            let ended = matches!(event, Event::Closed(_) | Event::Failed);
            wire::write_frame(&mut output, &event).await?;
            if ended {
                return Ok::<(), std::io::Error>(());
            }
        }
        Ok(())
    };
    // Poll the two pipe directions independently. A slow display must not hold
    // input, resize or shutdown behind a blocked stdout write.
    tokio::pin!(requests, events);
    let result = tokio::select! {
        result = &mut requests => { result?; events.await },
        result = &mut events => result,
    };
    drop(owner);
    result
}

fn convert(event: engine::MoshSessionEvent) -> Event {
    use engine::MoshSessionEvent as E;
    match event {
        E::Output(bytes) => Event::Output(zeroize::Zeroizing::new(bytes)),
        E::RemoteResize { columns, rows } => Event::RemoteResize { columns, rows },
        E::ConnectionStateChanged(state) => Event::ConnectionStateChanged(match state {
            fernomade_runtime::ConnectionState::Connecting => wire::ConnectionState::Connecting,
            fernomade_runtime::ConnectionState::Connected => wire::ConnectionState::Connected,
            fernomade_runtime::ConnectionState::Interrupted => wire::ConnectionState::Interrupted,
        }),
        E::RoundTripEstimate(value) => Event::RoundTripEstimate(value),
        E::PredictionAcknowledged(value) => Event::PredictionAcknowledged(value),
        E::RemoteStateAdvanced(value) => Event::RemoteStateAdvanced(value),
        E::Closed(outcome) => Event::Closed(match outcome {
            fernomade_runtime::ShutdownOutcome::Acknowledged => wire::ShutdownOutcome::Acknowledged,
            fernomade_runtime::ShutdownOutcome::PeerRequested => {
                wire::ShutdownOutcome::PeerRequested
            }
            fernomade_runtime::ShutdownOutcome::TimedOut => wire::ShutdownOutcome::TimedOut,
        }),
        E::Failed(_) => Event::Failed,
    }
}
