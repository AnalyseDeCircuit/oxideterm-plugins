// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

use super::*;
use ironrdp_core::DecodeErrorKind;
use std::error::Error;

pub(super) fn session_failure(
    error: &session::SessionError,
) -> (String, RemoteDesktopErrorCategory) {
    let mut category = if error.context().starts_with("DisplayControl") {
        RemoteDesktopErrorCategory::Configuration
    } else if error.context().starts_with("display reactivation")
        || matches!(
            error.kind(),
            session::SessionErrorKind::Decode(_)
                | session::SessionErrorKind::Encode(_)
                | session::SessionErrorKind::Pdu(_)
                | session::SessionErrorKind::FastPathBulkDecompression(_)
                | session::SessionErrorKind::InvalidBitmapSourceLength
        )
    {
        RemoteDesktopErrorCategory::Protocol
    } else {
        remote_desktop_error_category_from_message(error.context())
    };
    let kind = match error.kind() {
        session::SessionErrorKind::Decode(_) => "decode error",
        session::SessionErrorKind::Encode(_) => "encode error",
        session::SessionErrorKind::Pdu(_) => "protocol error",
        session::SessionErrorKind::FastPathBulkDecompression(_) => "bulk decompression error",
        session::SessionErrorKind::InvalidBitmapSourceLength => "invalid bitmap source length",
        _ => "session error",
    };
    let mut message = format!("RDP session ended: {}: {kind}", error.context());
    // Only static operation/field labels and lengths cross this boundary. Display/report
    // on arbitrary sources can include peer data, credentials, or local source paths.
    let mut source: Option<&(dyn Error + 'static)> = Some(error);
    for _ in 0..8 {
        let Some(current) = source else {
            break;
        };
        if let Some(decode) = current.downcast_ref::<ironrdp_core::DecodeError>() {
            let detail = match decode.kind() {
                DecodeErrorKind::NotEnoughBytes { received, expected } => {
                    format!("truncated payload (received {received}, expected {expected})")
                }
                DecodeErrorKind::InvalidField { field, reason } => {
                    format!("invalid {field}: {reason}")
                }
                DecodeErrorKind::UnsupportedValue { name, .. } => format!("unsupported {name}"),
                DecodeErrorKind::UnexpectedMessageType { .. } => "unexpected message type".into(),
                DecodeErrorKind::UnsupportedVersion { .. } => "unsupported version".into(),
                DecodeErrorKind::Other { description } => (*description).into(),
                _ => "invalid encoded data".into(),
            };
            message.push_str(&format!("; {}: {detail}", decode.context()));
            break;
        }
        if let Some(pdu) = current.downcast_ref::<ironrdp::pdu::PduError>() {
            if pdu.context().starts_with("DisplayControl") {
                category = RemoteDesktopErrorCategory::Configuration;
            }
            message.push_str(&format!("; {}", pdu.context()));
            if let ironrdp::pdu::PduErrorKind::Other { description } = pdu.kind() {
                message.push_str(&format!(": {description}"));
            }
        }
        source = current.source();
    }
    if error.context() == "DisplayControl limits"
        && let session::SessionErrorKind::Reason(reason) = error.kind()
        && matches!(
            reason.as_str(),
            "requested monitor count exceeds server limit"
                | "requested monitor area exceeds server limit"
        )
    {
        message.push_str(&format!("; {reason}"));
    }
    (message, category)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ironrdp::connector::ConnectorErrorExt as _;

    #[test]
    fn decode_failure_keeps_stage_and_lengths_without_payload_or_source_paths() {
        let decode = ironrdp_core::DecodeError::new(
            "BitmapUpdate",
            DecodeErrorKind::NotEnoughBytes {
                received: 12,
                expected: 24,
            },
        );
        let mut error = session::SessionError::decode(decode);
        error.set_context("Fast-Path frame after display reactivation");
        assert_eq!(
            session_failure(&error).0,
            "RDP session ended: Fast-Path frame after display reactivation: decode error; BitmapUpdate: truncated payload (received 12, expected 24)"
        );
        let decode = ironrdp_core::DecodeError::new(
            "ServerData",
            DecodeErrorKind::UnsupportedValue {
                name: "value",
                value: "synthetic-private-payload".into(),
            },
        );
        let error = session::SessionError::decode(decode);
        assert_eq!(
            session_failure(&error),
            (
                "RDP session ended: decode error: decode error; ServerData: unsupported value"
                    .to_string(),
                RemoteDesktopErrorCategory::Protocol
            )
        );
        let error = error.with_source(std::io::Error::other(
            r"C:\private\synthetic-private-payload",
        ));
        let (message, _) = session_failure(&error);
        assert_eq!(
            message,
            "RDP session ended: decode error: decode error; ServerData: unsupported value"
        );
        let error = session::SessionError::custom(
            "read RDP frame",
            std::io::Error::other(r"C:\private\synthetic-private-payload"),
        );
        assert_eq!(
            session_failure(&error).0,
            "RDP session ended: read RDP frame: session error"
        );
        let error = session::SessionError::pdu(ironrdp::pdu::pdu_other_err!(
            "DisplayControl limits",
            "requested monitor count exceeds server limit"
        ));
        assert_eq!(
            session_failure(&error).1,
            RemoteDesktopErrorCategory::Configuration
        );
        let error = session::SessionError::custom(
            "display reactivation handshake",
            connector::ConnectorError::decode(ironrdp_core::DecodeError::new(
                "ServerDemandActive",
                DecodeErrorKind::NotEnoughBytes {
                    received: 2,
                    expected: 4,
                },
            )),
        );
        assert_eq!(session_failure(&error), (
            "RDP session ended: display reactivation handshake: session error; ServerDemandActive: truncated payload (received 2, expected 4)".to_string(),
            RemoteDesktopErrorCategory::Protocol,
        ));
    }
}
