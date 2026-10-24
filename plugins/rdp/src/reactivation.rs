// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

use super::*;
use ironrdp::connector::{Sequence as _, connection_activation::ConnectionActivationSequence};
use ironrdp::pdu::{
    Action,
    mcs::{McsMessage, SendDataIndicationCtx},
    rdp::headers::{ShareControlPdu, ShareDataPdu},
    x224::X224,
};

fn is_header_only_deactivation(data: &[u8]) -> bool {
    // xrdp 0.9.x (xrdp_rdp_send_deactivate) and Windows XP omit the entire
    // Deactivate All body, including shareId. IronRDP's body-level tolerance
    // runs too late: ShareControlHeader already requires that shareId.
    // Accept only the exact six-byte, version-1 Deactivate All header; other
    // truncated PDUs must still fail normal decoding.
    data.len() == 6 && data[..4] == [6, 0, 0x16, 0]
}

pub(super) fn process_server_frame(
    stage: &mut ActiveStage,
    image: &mut DecodedImage,
    action: Action,
    payload: &[u8],
    io_channel_id: u16,
) -> SessionResult<Vec<ActiveStageOutput>> {
    if action == Action::X224 {
        match ironrdp_core::decode::<X224<McsMessage<'_>>>(payload)
            .map_err(session::SessionError::decode)?
            .0
        {
            McsMessage::SendDataIndication(data)
                if data.channel_id == io_channel_id
                    && is_header_only_deactivation(&data.user_data) =>
            {
                return Ok(vec![ActiveStageOutput::DeactivateAll]);
            }
            McsMessage::DisconnectProviderUltimatum(disconnect) => {
                let reason = match disconnect.reason {
                    ironrdp::pdu::mcs::DisconnectReason::ProviderInitiated => {
                        GracefulDisconnectReason::ServerInitiated
                    }
                    ironrdp::pdu::mcs::DisconnectReason::UserRequested => {
                        GracefulDisconnectReason::UserInitiated
                    }
                    other => GracefulDisconnectReason::Other(other.description().to_owned()),
                };
                return Ok(vec![ActiveStageOutput::Terminate(reason)]);
            }
            _ => {}
        }
    }
    stage.process(image, action, payload)
}

/// A resize handshake shares the existing stream and channel processors. It must
/// not use read_by_hint, which drops Fast-Path packets and treats every X224
/// packet as handshake data regardless of its MCS channel.
pub(super) struct RdpReactivation {
    sequence: ConnectionActivationSequence,
    enable_server_pointer: bool,
    pointer_software_rendering: bool,
    pub(super) negotiated: bool,
    received_graphics: bool,
}

impl RdpReactivation {
    pub(super) fn new(
        sequence: ConnectionActivationSequence,
        enable_server_pointer: bool,
        pointer_software_rendering: bool,
    ) -> Self {
        Self {
            sequence,
            enable_server_pointer,
            pointer_software_rendering,
            negotiated: false,
            received_graphics: false,
        }
    }

    pub(super) fn finished(&self) -> bool {
        matches!(
            self.sequence.connection_activation_state(),
            ConnectionActivationState::Finalized { .. }
        )
    }

    pub(super) fn process(
        &mut self,
        stage: &mut ActiveStage,
        image: &mut DecodedImage,
        action: Action,
        payload: &[u8],
    ) -> SessionResult<Vec<ActiveStageOutput>> {
        let io_channel_id = self.sequence.io_channel_id();
        let handshake = if action == Action::X224 {
            let message = ironrdp_core::decode::<X224<McsMessage<'_>>>(payload)
                .map_err(session::SessionError::decode)?
                .0;
            if let McsMessage::SendDataIndication(data) = message {
                if data.channel_id != io_channel_id {
                    false
                } else if is_header_only_deactivation(&data.user_data) {
                    // A second deactivation starts a fresh exchange in the session owner.
                    return Ok(vec![ActiveStageOutput::DeactivateAll]);
                } else {
                    let control =
                        ironrdp::pdu::rdp::headers::decode_share_control(SendDataIndicationCtx {
                            initiator_id: data.initiator_id,
                            channel_id: data.channel_id,
                            user_data: &data.user_data,
                        })
                        .map_err(session::SessionError::decode)?;
                    match control.pdu {
                        ShareControlPdu::Data(header) => match header.share_data_pdu {
                            // This is an informational topology notification, not a
                            // finalization response. Bitmap capabilities own canvas size.
                            ShareDataPdu::MonitorLayout(_) => return Ok(Vec::new()),
                            ShareDataPdu::Synchronize(_)
                            | ShareDataPdu::Control(_)
                            | ShareDataPdu::FontMap(_)
                            | ShareDataPdu::ServerSetErrorInfo(_) => true,
                            _ => false,
                        },
                        ShareControlPdu::ServerDeactivateAll(_) => {
                            return Ok(vec![ActiveStageOutput::DeactivateAll]);
                        }
                        _ => true,
                    }
                }
            } else {
                false
            }
        } else {
            false
        };

        if !handshake {
            let outputs = process_server_frame(stage, image, action, payload, io_channel_id)?;
            // Decode in stream order to retain compression history. Pixels from
            // the old activation are never published; new pixels are retained
            // in the negotiated canvas until the Font Map completes activation.
            return Ok(outputs
                .into_iter()
                .filter(|output| match output {
                    ActiveStageOutput::GraphicsUpdate(_) => {
                        self.received_graphics |= self.negotiated;
                        false
                    }
                    ActiveStageOutput::PointerPosition { .. }
                    | ActiveStageOutput::PointerDefault
                    | ActiveStageOutput::PointerHidden
                    | ActiveStageOutput::PointerBitmap(_) => self.negotiated,
                    _ => true,
                })
                .collect());
        }

        let mut buffer = WriteBuf::new();
        self.sequence
            .step(payload, &mut buffer)
            .map_err(|error| session::custom_err!("display reactivation handshake", error))?;
        let mut outputs = response_frame_output(buffer.filled().to_vec())?;
        if !self.negotiated
            && let ConnectionActivationState::ConnectionFinalization {
                desktop_size,
                share_id,
                ..
            } = self.sequence.connection_activation_state()
        {
            if desktop_size.width == 0
                || desktop_size.height == 0
                || u32::from(desktop_size.width) > RemoteDesktopSize::MAX_DIMENSION
                || u32::from(desktop_size.height) > RemoteDesktopSize::MAX_DIMENSION
            {
                return Err(session::general_err!(
                    "display reactivation negotiated unsupported dimensions"
                ));
            }
            // Prepare before Font List permits the server to send graphics,
            // not after Font Map when early new-size pixels would be erased.
            *image = DecodedImage::new(
                RDP_DECODED_FRAME_PIXEL_FORMAT,
                desktop_size.width,
                desktop_size.height,
            );
            stage.reactivate(
                io_channel_id,
                self.sequence.user_channel_id(),
                share_id,
                self.enable_server_pointer,
                self.pointer_software_rendering,
            );
            self.negotiated = true;
        }
        while !self.finished() && self.sequence.next_pdu_hint().is_none() {
            buffer.clear();
            self.sequence
                .step_no_input(&mut buffer)
                .map_err(|error| session::custom_err!("display reactivation handshake", error))?;
            outputs.extend(response_frame_output(buffer.filled().to_vec())?);
        }
        if self.finished() && self.received_graphics {
            outputs.push(ActiveStageOutput::GraphicsUpdate(InclusiveRectangle {
                left: 0,
                top: 0,
                right: image.width() - 1,
                bottom: image.height() - 1,
            }));
        }
        Ok(outputs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ironrdp::connector::connection_activation::ConnectionActivationFactory;
    use ironrdp::pdu::{
        bitmap::{BitmapData, BitmapUpdateData, Compression},
        fast_path::{
            EncryptionFlags, FastPathHeader, FastPathUpdatePdu, Fragmentation, UpdateCode,
        },
        mcs::{DisconnectProviderUltimatum, DisconnectReason, SendDataIndication},
        rdp::{
            capability_sets::{
                Bitmap, BitmapDrawingFlags, CapabilitySet, DemandActive, InputFlags,
                ServerDemandActive,
            },
            finalization_messages::{FontPdu, MonitorLayoutPdu},
            headers::{CompressionFlags, ShareControlHeader, ShareDataHeader, StreamPriority},
        },
    };
    use ironrdp::svc::StaticChannelSet;
    use ironrdp_core::encode_vec;
    use std::{any::TypeId, borrow::Cow};
    use tokio::io::AsyncWriteExt as _;

    const IO: u16 = 1003;
    const USER: u16 = 1001;
    const DVC: u16 = 1004;

    fn connection() -> ConnectionResult {
        let config = build_client_rdp_config(&RdpWorkerConfig {
            endpoint: RemoteDesktopEndpoint::new("example.test", 3389),
            transport_endpoint: None,
            socks_proxy: None,
            size: RemoteDesktopSize {
                width: 320,
                height: 200,
            },
            scale_factor: 100,
            graphics_epoch: 0,
            read_only: false,
            session_options: RemoteDesktopSessionOptions::default(),
            monitor_layout: RemoteDesktopMonitorLayout::default(),
        })
        .unwrap()
        .connector;
        let mut channels = StaticChannelSet::new();
        channels.insert(DrdynvcClient::new());
        channels.attach_channel_id(TypeId::of::<DrdynvcClient>(), DVC);
        ConnectionResult {
            io_channel_id: IO,
            user_channel_id: USER,
            message_channel_id: None,
            share_id: 1,
            static_channels: channels,
            desktop_size: connector::DesktopSize {
                width: 320,
                height: 200,
            },
            input_flags: InputFlags::empty(),
            enable_server_pointer: true,
            pointer_software_rendering: false,
            refresh_rect_support: false,
            suppress_output_support: false,
            activation_factory: ConnectionActivationFactory::new(config, IO, USER),
            compression_type: Some(CompressionType::Rdp61),
        }
    }

    fn stage() -> ActiveStage {
        let c = connection();
        ActiveStageBuilder {
            static_channels: c.static_channels,
            user_channel_id: USER,
            io_channel_id: IO,
            message_channel_id: None,
            share_id: 1,
            compression_type: c.compression_type,
            enable_server_pointer: true,
            pointer_software_rendering: false,
        }
        .build()
    }

    fn server_data(channel: u16, data: &[u8]) -> Vec<u8> {
        encode_vec(&X224(SendDataIndication {
            initiator_id: USER,
            channel_id: channel,
            user_data: Cow::Borrowed(data),
        }))
        .unwrap()
    }

    fn control(pdu: ShareControlPdu) -> Vec<u8> {
        server_data(
            IO,
            &encode_vec(&ShareControlHeader {
                share_control_pdu: pdu,
                pdu_source: USER,
                share_id: 2,
            })
            .unwrap(),
        )
    }

    fn share_data(pdu: ShareDataPdu) -> Vec<u8> {
        control(ShareControlPdu::Data(ShareDataHeader {
            share_data_pdu: pdu,
            stream_priority: StreamPriority::Medium,
            compression_flags: CompressionFlags::empty(),
            compression_type: CompressionType::K8,
        }))
    }

    fn demand_active() -> Vec<u8> {
        control(ShareControlPdu::ServerDemandActive(ServerDemandActive {
            pdu: DemandActive {
                source_descriptor: "test".into(),
                capability_sets: vec![CapabilitySet::Bitmap(Bitmap {
                    pref_bits_per_pix: 32,
                    desktop_width: 640,
                    desktop_height: 240,
                    desktop_resize_flag: true,
                    drawing_flags: BitmapDrawingFlags::empty(),
                })],
            },
        }))
    }

    fn bitmap(x: u16, y: u16, bgr: [u8; 3]) -> Vec<u8> {
        encode_vec(&BitmapUpdateData {
            rectangles: vec![BitmapData {
                rectangle: InclusiveRectangle {
                    left: x,
                    top: y,
                    right: x,
                    bottom: y,
                },
                width: 1,
                height: 1,
                bits_per_pixel: 24,
                compression_flags: Compression::empty(),
                compressed_data_header: None,
                bitmap_data: &[bgr[0], bgr[1], bgr[2], 0],
            }],
        })
        .unwrap()
    }

    fn fastpath(data: &[u8], fragmentation: Fragmentation) -> Vec<u8> {
        let update = encode_vec(&FastPathUpdatePdu {
            fragmentation,
            update_code: UpdateCode::Bitmap,
            compression_flags: None,
            compression_type: None,
            data,
        })
        .unwrap();
        let mut packet =
            encode_vec(&FastPathHeader::new(EncryptionFlags::empty(), update.len())).unwrap();
        packet.extend(update);
        packet
    }

    #[test]
    fn short_xrdp_deactivation_is_recognized_without_accepting_truncated_data() {
        let mut stage = stage();
        let mut image = DecodedImage::new(RDP_DECODED_FRAME_PIXEL_FORMAT, 320, 200);
        // Wire header emitted by xrdp 0.9.24: totalLength=6, pduType=0x16, source=1001.
        let short = server_data(IO, &[6, 0, 0x16, 0, 0xe9, 3]);
        let full = control(ShareControlPdu::ServerDeactivateAll(
            ironrdp::pdu::rdp::headers::ServerDeactivateAll,
        ));
        for packet in [short, full] {
            assert!(matches!(
                process_server_frame(&mut stage, &mut image, Action::X224, &packet, IO)
                    .unwrap()
                    .as_slice(),
                [ActiveStageOutput::DeactivateAll]
            ));
        }
        for (channel, bytes) in [
            (IO, vec![6, 0, 0x17, 0, 0xe9, 3]), // Truncated Share Data, not Deactivate All.
            (IO, vec![13, 0, 0x16, 0, 0xe9, 3]), // Body promised by the header is missing.
            (IO, vec![6, 0, 0x26, 0, 0xe9, 3]), // Invalid protocol version.
            (DVC, vec![6, 0, 0x16, 0, 0xe9, 3]), // Same bytes on a different channel.
        ] {
            assert!(
                process_server_frame(
                    &mut stage,
                    &mut image,
                    Action::X224,
                    &server_data(channel, &bytes),
                    IO
                )
                .is_err()
            );
        }
    }

    #[tokio::test]
    async fn resize_routes_channels_and_preserves_new_pixels_and_fragments_across_font_map() {
        let (client, mut server) = tokio::io::duplex(65536);
        let (input_tx, mut input_rx) = tokio_mpsc::unbounded_channel();
        let (output_tx, output_rx) = client_rdp_output_channel(32);
        let display = Arc::new(Mutex::new(
            RdpDisplayState::new(
                RemoteDesktopSize {
                    width: 320,
                    height: 200,
                },
                100,
                false,
                &RemoteDesktopMonitorLayout::default(),
            )
            .unwrap(),
        ));
        let mut epoch = 0;
        let mut wire = fastpath(&bitmap(1, 1, [90, 80, 70]), Fragmentation::Single);
        wire.extend(server_data(IO, &[6, 0, 0x16, 0, 0xe9, 3]));
        // An incomplete old frame must not be joined to a new-size fragment.
        wire.extend(fastpath(&[1, 0, 1, 0], Fragmentation::First));
        wire.extend(demand_active());
        // A real DRDYNVC capabilities request must receive its normal channel response,
        // not be decoded as a Share Control/activation header.
        wire.extend(server_data(DVC, &[4, 0, 0, 0, 3, 0, 0, 0, 0x50, 0, 1, 0]));
        wire.extend(share_data(ShareDataPdu::MonitorLayout(MonitorLayoutPdu {
            monitors: vec![ironrdp::pdu::gcc::Monitor {
                left: 0,
                top: 0,
                right: 639,
                bottom: 239,
                flags: ironrdp::pdu::gcc::MonitorFlags::PRIMARY,
            }],
        })));
        // The server may draw after Font List but before Font Map. This pixel is
        // outside the old canvas and must be present in the first new base frame.
        wire.extend(fastpath(
            &bitmap(638, 239, [11, 22, 33]),
            Fragmentation::Single,
        ));
        let mut fragmented = bitmap(639, 239, [44, 55, 66]);
        fragmented[2..4].copy_from_slice(&2_u16.to_le_bytes());
        fragmented.extend_from_slice(&bitmap(0, 0, [77, 88, 99])[4..]);
        wire.extend(fastpath(&fragmented[..8], Fragmentation::First));
        wire.extend(share_data(ShareDataPdu::FontMap(FontPdu::default())));
        wire.extend(fastpath(&fragmented[8..], Fragmentation::Last));
        wire.extend(
            encode_vec(&X224(McsMessage::DisconnectProviderUltimatum(
                DisconnectProviderUltimatum::from_reason(DisconnectReason::ProviderInitiated),
            )))
            .unwrap(),
        );
        server.write_all(&wire).await.unwrap();
        let result = tokio::time::timeout(
            Duration::from_secs(5),
            run_native_rdp_active_session(
                ironrdp_tokio::TokioFramed::new(Box::new(client)),
                connection(),
                &mut epoch,
                &mut input_rx,
                &output_tx,
                &EgfxSessionBridge::disabled(),
                &display,
            ),
        )
        .await
        .expect("reactivation stalled")
        .unwrap();
        assert!(matches!(
            result,
            ClientRdpControlFlow::TerminatedGracefully(GracefulDisconnectReason::ServerInitiated)
        ));
        assert_eq!(epoch, 1);
        drop(input_tx);
        let control_events: Vec<_> = output_rx.control_rx.try_iter().collect();
        assert!(control_events.iter().any(|e| matches!(
            e,
            ClientRdpOutput::Event(RemoteDesktopHelperEvent::FrameStreamReset {
                graphics_epoch: 1
            })
        )));
        let frames: Vec<_> = std::iter::from_fn(|| output_rx.graphics_rx.try_recv().ok())
            .filter_map(|e| match e {
                ClientRdpOutput::Event(RemoteDesktopHelperEvent::Frame { frame })
                    if frame.graphics_epoch == 1 =>
                {
                    Some(frame)
                }
                _ => None,
            })
            .collect();
        let first = frames.first().expect("new-size base frame missing");
        assert_eq!(
            first.size,
            RemoteDesktopSize {
                width: 640,
                height: 240
            }
        );
        assert_eq!(&first.bytes[(239 * 640 + 638) * 4..][..3], &[11, 22, 33]);
        assert_eq!(
            &first.bytes[(640 + 1) * 4..][..3],
            &[0, 0, 0],
            "old-size pixels leaked into new activation"
        );
        let last = frames.last().unwrap();
        assert_eq!(
            &last.bytes[(239 * 640 + 639) * 4..][..3],
            &[44, 55, 66],
            "fragment crossing Font Map was lost"
        );
        assert_eq!(&last.bytes[..3], &[77, 88, 99]);
        let mut server = ironrdp_tokio::TokioFramed::new(server);
        let mut dvc_response = None;
        for _ in 0..6 {
            let (_, bytes) = tokio::time::timeout(Duration::from_secs(1), server.read_pdu())
                .await
                .unwrap()
                .unwrap();
            let pdu = ironrdp_core::decode::<X224<McsMessage<'_>>>(&bytes).unwrap();
            if let McsMessage::SendDataRequest(data) = pdu.0
                && data.channel_id == DVC
            {
                dvc_response = Some(data.user_data.into_owned());
            }
        }
        assert_eq!(
            dvc_response.unwrap(),
            vec![4, 0, 0, 0, 3, 0, 0, 0, 0x50, 0, 1, 0]
        );
    }

    #[tokio::test]
    async fn close_interrupts_a_stalled_reactivation_without_sending_queued_input() {
        let (client, mut server) = tokio::io::duplex(4096);
        let (input_tx, mut input_rx) = tokio_mpsc::unbounded_channel();
        let (output_tx, output_rx) = client_rdp_output_channel(8);
        let display = Arc::new(Mutex::new(
            RdpDisplayState::new(
                RemoteDesktopSize {
                    width: 320,
                    height: 200,
                },
                100,
                false,
                &RemoteDesktopMonitorLayout::default(),
            )
            .unwrap(),
        ));
        let mut epoch = 0;
        server
            .write_all(&server_data(IO, &[6, 0, 0x16, 0, 0xe9, 3]))
            .await
            .unwrap();
        // Wait on the real reset event so Close cannot win before deactivation.
        let driver = tokio::task::spawn_blocking(move || {
            loop {
                if let ClientRdpOutput::Event(RemoteDesktopHelperEvent::FrameStreamReset {
                    ..
                }) = output_rx
                    .control_rx
                    .recv_timeout(Duration::from_secs(5))
                    .unwrap()
                {
                    break;
                }
            }
            input_tx
                .send(RdpInputEvent::FastPath(smallvec::smallvec![
                    rdp_synchronize_event(false, false, false, false,)
                ]))
                .unwrap();
            input_tx.send(RdpInputEvent::Close).unwrap();
            // Keep the output receivers alive until the worker drops its senders.
            while output_rx
                .control_rx
                .recv_timeout(Duration::from_secs(5))
                .is_ok()
            {}
        });
        let (join, result) = tokio::join!(driver, async {
            let result = tokio::time::timeout(
                Duration::from_secs(5),
                run_native_rdp_active_session(
                    ironrdp_tokio::TokioFramed::new(Box::new(client)),
                    connection(),
                    &mut epoch,
                    &mut input_rx,
                    &output_tx,
                    &EgfxSessionBridge::disabled(),
                    &display,
                ),
            )
            .await
            .expect("Close was blocked by the handshake")
            .unwrap();
            drop(output_tx);
            result
        });
        join.unwrap();
        assert!(matches!(
            result,
            ClientRdpControlFlow::TerminatedGracefully(GracefulDisconnectReason::UserInitiated)
        ));
        use tokio::io::AsyncReadExt as _;
        let mut bytes = Vec::new();
        server.read_to_end(&mut bytes).await.unwrap();
        assert!(
            bytes.is_empty(),
            "input was sent while the input handler was disabled"
        );
    }
}
