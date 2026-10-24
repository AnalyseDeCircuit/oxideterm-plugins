// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

use super::*;
use ironrdp::displaycontrol::pdu::DisplayControlCapabilities;

/// The channel callback and active session share one pending layout and one set of limits.
/// This state has no task of its own and is dropped with the connection.
#[derive(Debug)]
pub(super) struct RdpDisplayState {
    viewport: DisplayControlMonitorLayout,
    monitors: Option<DisplayControlMonitorLayout>,
    use_all_monitors: bool,
    limits: Option<(u32, u64)>,
    sent: Option<DisplayControlMonitorLayout>,
}

impl RdpDisplayState {
    pub(super) fn new(
        size: RemoteDesktopSize,
        scale: u32,
        all: bool,
        layout: &RemoteDesktopMonitorLayout,
    ) -> ironrdp_core::EncodeResult<Self> {
        let viewport = DisplayControlMonitorLayout::new_single_primary_monitor(
            size.width,
            size.height,
            Some(rdp_displaycontrol_scale_factor(Some(scale))),
            None,
        )?;
        let monitors = if all && layout.monitors.len() > 1 {
            Some(build_display_control_layout(layout)?)
        } else {
            None
        };
        Ok(Self {
            viewport,
            monitors,
            use_all_monitors: all,
            limits: None,
            sent: None,
        })
    }

    pub(super) fn resize(
        &mut self,
        width: u32,
        height: u32,
        scale: u32,
        physical: Option<(u32, u32)>,
    ) -> ironrdp_core::EncodeResult<()> {
        // Remember the latest viewport, but never let it replace an active multi-monitor layout.
        self.viewport = DisplayControlMonitorLayout::new_single_primary_monitor(
            width,
            height,
            Some(scale),
            physical,
        )?;
        Ok(())
    }

    pub(super) fn update_monitors(
        &mut self,
        layout: &RemoteDesktopMonitorLayout,
    ) -> ironrdp_core::EncodeResult<()> {
        if !self.use_all_monitors || layout.monitors.is_empty() {
            return Ok(());
        }
        let layout = build_display_control_layout(layout)?;
        if layout.monitors().len() > 1 {
            self.monitors = Some(layout);
        } else {
            // On return to one display the host supplies its current viewport in this layout.
            self.viewport = layout;
            self.monitors = None;
        }
        Ok(())
    }

    pub(super) fn capabilities(
        &mut self,
        caps: DisplayControlCapabilities,
    ) -> ironrdp::pdu::PduResult<Vec<ironrdp::dvc::DvcMessage>> {
        // The pinned public API exposes area only. MaxNumMonitors is the first u32 in
        // the documented DISPLAYCONTROL_CAPS payload; read the public wire encoding.
        let bytes = ironrdp_core::encode_vec(&caps).map_err(|e| ironrdp::pdu::encode_err!(e))?;
        let count = ironrdp_core::ReadCursor::new(&bytes).read_u32();
        self.limits = Some((count, caps.max_monitor_area()));
        self.sent = None;
        let update = self
            .take_update()
            .map_err(|reason| ironrdp::pdu::pdu_other_err!("DisplayControl limits", reason))?;
        Ok(update
            .into_iter()
            .map(|pdu| Box::new(pdu) as ironrdp::dvc::DvcMessage)
            .collect())
    }

    pub(super) fn take_update(&mut self) -> Result<Option<DisplayControlPdu>, &'static str> {
        let Some((count, max_area)) = self.limits else {
            return Ok(None);
        };
        let layout = self.monitors.as_ref().unwrap_or(&self.viewport);
        let area: u64 = layout
            .monitors()
            .iter()
            .map(|m| {
                let (w, h) = m.dimensions();
                u64::from(w) * u64::from(h)
            })
            .sum();
        if layout.monitors().len() > count as usize {
            return Err("requested monitor count exceeds server limit");
        }
        if area > max_area {
            return Err("requested monitor area exceeds server limit");
        }
        if self.sent.as_ref() == Some(layout) {
            return Ok(None);
        }
        self.sent = Some(layout.clone());
        Ok(Some(DisplayControlPdu::from(layout.clone())))
    }
}

pub(super) fn monitor_desktop_size(
    layout: &RemoteDesktopMonitorLayout,
) -> ironrdp_core::EncodeResult<RemoteDesktopSize> {
    if layout.monitors.is_empty() {
        return Err(ironrdp_core::invalid_field_err!(
            "MonitorLayout",
            "no active monitors"
        ));
    }
    let left = layout
        .monitors
        .iter()
        .map(|m| i64::from(m.left))
        .min()
        .unwrap_or(0);
    let top = layout
        .monitors
        .iter()
        .map(|m| i64::from(m.top))
        .min()
        .unwrap_or(0);
    let right = layout
        .monitors
        .iter()
        .map(|m| i64::from(m.left) + i64::from(m.width))
        .max()
        .unwrap_or(0);
    let bottom = layout
        .monitors
        .iter()
        .map(|m| i64::from(m.top) + i64::from(m.height))
        .max()
        .unwrap_or(0);
    let width = right - left;
    let height = bottom - top;
    if width > i64::from(RemoteDesktopSize::MAX_DIMENSION)
        || height > i64::from(RemoteDesktopSize::MAX_DIMENSION)
    {
        return Err(ironrdp_core::invalid_field_err!(
            "MonitorLayout",
            "combined desktop exceeds supported dimensions"
        ));
    }
    Ok(RemoteDesktopSize {
        width: width as u32,
        height: height as u32,
    })
}

pub(super) fn encode_pending_display_layout(
    active: &mut ActiveStage,
    display: &Arc<Mutex<RdpDisplayState>>,
) -> SessionResult<Vec<ActiveStageOutput>> {
    let Some(channel) = active.get_dvc::<DisplayControlClient>() else {
        return Ok(Vec::new());
    };
    if !channel.processor().ready() {
        return Ok(Vec::new());
    }
    let id = channel.channel_id();
    let update = display
        .lock()
        .map_err(|_| session::general_err!("DisplayControl state unavailable"))?
        .take_update()
        .map_err(|reason| session::reason_err!("DisplayControl limits", "{reason}"))?;
    let Some(update) = update else {
        return Ok(Vec::new());
    };
    let messages = encode_dvc_messages(id, vec![Box::new(update)], ChannelFlags::empty())
        .map_err(session::SessionError::encode)?;
    active
        .process_svc_processor_messages(SvcProcessorMessages::<DrdynvcClient>::new(messages))
        .and_then(response_frame_output)
}

pub(super) fn build_display_control_layout(
    layout: &RemoteDesktopMonitorLayout,
) -> ironrdp_core::EncodeResult<DisplayControlMonitorLayout> {
    monitor_desktop_size(layout)?;
    for (index, monitor) in layout.monitors.iter().enumerate() {
        if monitor.primary && (monitor.left != 0 || monitor.top != 0) {
            return Err(ironrdp_core::invalid_field_err!(
                "PrimaryMonitor",
                "primary monitor must start at the origin"
            ));
        }
        for other in &layout.monitors[..index] {
            if i64::from(monitor.left) < i64::from(other.left) + i64::from(other.width)
                && i64::from(other.left) < i64::from(monitor.left) + i64::from(monitor.width)
                && i64::from(monitor.top) < i64::from(other.top) + i64::from(other.height)
                && i64::from(other.top) < i64::from(monitor.top) + i64::from(monitor.height)
            {
                return Err(ironrdp_core::invalid_field_err!(
                    "MonitorLayout",
                    "active monitors overlap"
                ));
            }
        }
    }
    let monitors = layout
        .monitors
        .iter()
        .map(|monitor| {
            let mut entry = if monitor.primary {
                MonitorLayoutEntry::new_primary(monitor.width, monitor.height)?
            } else {
                MonitorLayoutEntry::new_secondary(monitor.width, monitor.height)?
                    .with_position(monitor.left, monitor.top)?
            };
            entry = entry
                .with_orientation(match monitor.orientation {
                    oxideterm_remote_desktop::RemoteDesktopMonitorOrientation::Landscape => {
                        MonitorOrientation::Landscape
                    }
                    oxideterm_remote_desktop::RemoteDesktopMonitorOrientation::Portrait => {
                        MonitorOrientation::Portrait
                    }
                    oxideterm_remote_desktop::RemoteDesktopMonitorOrientation::LandscapeFlipped => {
                        MonitorOrientation::LandscapeFlipped
                    }
                    oxideterm_remote_desktop::RemoteDesktopMonitorOrientation::PortraitFlipped => {
                        MonitorOrientation::PortraitFlipped
                    }
                })
                .with_desktop_scale_factor(monitor.desktop_scale_factor)?
                .with_device_scale_factor(match monitor.device_scale_factor {
                    100 => DeviceScaleFactor::Scale100Percent,
                    140 => DeviceScaleFactor::Scale140Percent,
                    180 => DeviceScaleFactor::Scale180Percent,
                    _ => {
                        return Err(ironrdp_core::invalid_field_err!(
                            "DeviceScaleFactor",
                            "unsupported device scale factor"
                        ));
                    }
                });
            if let (Some(width), Some(height)) =
                (monitor.physical_width_mm, monitor.physical_height_mm)
            {
                entry = entry.with_physical_dimensions(width, height)?;
            }
            Ok(entry)
        })
        .collect::<ironrdp_core::EncodeResult<Vec<_>>>()?;
    DisplayControlMonitorLayout::new(&monitors)
}

#[cfg(test)]
mod tests {
    use super::*;
    use oxideterm_remote_desktop::{RemoteDesktopMonitor, RemoteDesktopMonitorOrientation};

    fn topology() -> RemoteDesktopMonitorLayout {
        let primary = RemoteDesktopMonitor {
            stable_id: "external".into(),
            left: 0,
            top: 0,
            width: 3840,
            height: 2160,
            primary: true,
            desktop_scale_factor: 150,
            device_scale_factor: 140,
            physical_width_mm: None,
            physical_height_mm: None,
            orientation: RemoteDesktopMonitorOrientation::Landscape,
        };
        let secondary = RemoteDesktopMonitor {
            stable_id: "left".into(),
            left: -1920,
            width: 1920,
            height: 1080,
            primary: false,
            desktop_scale_factor: 100,
            device_scale_factor: 100,
            ..primary.clone()
        };
        RemoteDesktopMonitorLayout {
            monitors: vec![primary, secondary],
        }
    }

    fn decode_layout(messages: &[ironrdp::dvc::DvcMessage]) -> DisplayControlMonitorLayout {
        assert_eq!(messages.len(), 1);
        let bytes = ironrdp_core::encode_vec(messages[0].as_ref()).unwrap();
        match ironrdp_core::decode::<DisplayControlPdu>(&bytes).unwrap() {
            DisplayControlPdu::MonitorLayout(layout) => layout,
            _ => panic!("expected a monitor layout"),
        }
    }

    #[test]
    fn latest_layout_wins_before_caps_and_multi_monitor_ignores_viewport_resize() {
        let mut topology = topology();
        let mut state = RdpDisplayState::new(
            RemoteDesktopSize {
                width: 1280,
                height: 720,
            },
            100,
            true,
            &topology,
        )
        .unwrap();
        state.resize(1600, 900, 150, None).unwrap();
        topology.monitors[1].top = 400;
        state.update_monitors(&topology).unwrap();
        assert!(state.take_update().unwrap().is_none());
        let messages = state
            .capabilities(DisplayControlCapabilities::new(2, 8192, 8192).unwrap())
            .unwrap();
        let layout = decode_layout(&messages);
        assert_eq!(
            layout
                .monitors()
                .iter()
                .map(|m| (m.position(), m.dimensions(), m.desktop_scale_factor()))
                .collect::<Vec<_>>(),
            vec![
                (Some((0, 0)), (3840, 2160), Some(150)),
                (Some((-1920, 400)), (1920, 1080), Some(100))
            ]
        );
        state.resize(1800, 1000, 150, None).unwrap();
        assert!(
            state.take_update().unwrap().is_none(),
            "viewport must not overwrite multiple monitors"
        );
        topology.monitors.truncate(1);
        topology.monitors[0].width = 1800;
        topology.monitors[0].height = 1000;
        state.update_monitors(&topology).unwrap();
        let Some(DisplayControlPdu::MonitorLayout(single)) = state.take_update().unwrap() else {
            panic!("missing single-monitor transition");
        };
        assert_eq!(single.monitors()[0].dimensions(), (1800, 1000));
        state.resize(1600, 900, 150, None).unwrap();
        let Some(DisplayControlPdu::MonitorLayout(resized)) = state.take_update().unwrap() else {
            panic!("single-monitor resizing did not resume");
        };
        assert_eq!(resized.monitors()[0].dimensions(), (1600, 900));
    }

    #[test]
    fn server_limits_apply_to_initial_and_later_layouts() {
        for (count, factor, reason) in [
            (1, 8192, "requested monitor count exceeds server limit"),
            (2, 1000, "requested monitor area exceeds server limit"),
        ] {
            let mut state = RdpDisplayState::new(
                RemoteDesktopSize {
                    width: 1280,
                    height: 720,
                },
                100,
                true,
                &RemoteDesktopMonitorLayout::default(),
            )
            .unwrap();
            let messages = state
                .capabilities(DisplayControlCapabilities::new(count, factor, factor).unwrap())
                .unwrap();
            assert_eq!(
                decode_layout(&messages).monitors()[0].dimensions(),
                (1280, 720)
            );
            state.update_monitors(&topology()).unwrap();
            assert_eq!(state.take_update(), Err(reason));
            let mut initial = RdpDisplayState::new(
                RemoteDesktopSize {
                    width: 1280,
                    height: 720,
                },
                100,
                true,
                &topology(),
            )
            .unwrap();
            assert!(
                initial
                    .capabilities(DisplayControlCapabilities::new(count, factor, factor).unwrap())
                    .is_err()
            );
        }
    }

    #[test]
    fn topology_keeps_negative_coordinates_and_rejects_invalid_bounds() {
        assert_eq!(
            monitor_desktop_size(&topology()).unwrap(),
            RemoteDesktopSize {
                width: 5760,
                height: 2160
            }
        );
        for case in 0..4 {
            let mut layout = topology();
            match case {
                0 => layout.monitors[0].left = 20,
                1 => layout.monitors[1].left = -100,
                2 => layout.monitors[1].primary = true,
                _ => layout.monitors[1].left = -8000,
            }
            assert!(
                build_display_control_layout(&layout).is_err(),
                "invalid topology case {case}"
            );
        }
    }

    #[test]
    fn reconnect_uses_the_current_topology_and_then_the_restored_single_viewport() {
        let mut worker = RdpWorkerConfig {
            endpoint: RemoteDesktopEndpoint::new("example.test", 3389),
            transport_endpoint: None,
            socks_proxy: None,
            size: RemoteDesktopSize {
                width: 1280,
                height: 720,
            },
            scale_factor: 100,
            graphics_epoch: 0,
            read_only: false,
            session_options: RemoteDesktopSessionOptions::default(),
            monitor_layout: topology(),
        };
        worker.session_options.display.use_all_monitors = true;
        remember_rdp_reconnect_state(
            &RemoteDesktopHelperRequest::Resize {
                size: RemoteDesktopSize {
                    width: 1600,
                    height: 900,
                },
                scale_factor: Some(150),
            },
            &mut worker,
        );
        let connector = build_client_rdp_config(&worker).unwrap().connector;
        assert_eq!(
            (connector.desktop_size.width, connector.desktop_size.height),
            (5760, 2160)
        );
        let mut single = topology();
        single.monitors.truncate(1);
        single.monitors[0].width = 1800;
        single.monitors[0].height = 1000;
        remember_rdp_reconnect_state(
            &RemoteDesktopHelperRequest::UpdateDisplayLayout { layout: single },
            &mut worker,
        );
        let connector = build_client_rdp_config(&worker).unwrap().connector;
        assert_eq!(
            (
                connector.desktop_size.width,
                connector.desktop_size.height,
                connector.desktop_scale_factor
            ),
            (1800, 1000, 150)
        );
    }
}
