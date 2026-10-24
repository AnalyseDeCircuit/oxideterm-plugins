# RDP

An independently updated remote desktop engine. Install and enable it, then use the existing connection form. OxideTerm owns the native viewer, input, credentials and SSH gateway.

Requires OxideTerm >2.2.1. Native x64 and ARM64 packages for macOS, Linux and Windows.

## 0.1.1

- Resize the desktop and update monitor layouts over the existing connection instead of forcing a reconnect, addressing cropped desktop edges and missing panels after xrdp session reconnection.
- Keep the current desktop visible until the server confirms a change, including when a resize is ignored.
- Preserve graphics epoch ordering when manually reconnecting after dynamic display changes.

From the repository root with Rust 1.97.0, run node scripts/build-remote-desktop.mjs rdp followed by node scripts/verify-remote-desktop.mjs rdp.

Shared models are pinned to host commit 570c541393ad7c7f01e85ba3441c9dab29ac3556. The existing wire format is unchanged; manifests declare protocol version 1. Shared model updates require host compatibility verification.

License: GPL-3.0-only.
