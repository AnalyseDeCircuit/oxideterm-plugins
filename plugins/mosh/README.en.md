# Mosh

Mosh remote connections using OxideTerm's native terminal, saved profiles and local input prediction. The remote host needs `mosh-server` and reachable UDP.

The plugin owns UDP, encryption, state synchronization and network recovery. The host retains SSH authentication, server bootstrap, recording and UI. No additional tab or sidebar entry is registered.

Requires OxideTerm 2.2.2 or later. The runtime is `terminal-transport`, using private binary pipe protocol version 1. Keys travel through the pipe, never command-line arguments or environment variables. Updating, disabling or removing the plugin stops its active Mosh sessions.

From the marketplace root:

```sh
node scripts/build-remote-desktop.mjs mosh
node scripts/verify-mosh.mjs
```

Builds pin the Fernomade engine commit and Cargo.lock. `src/wire.rs` carries pipe protocol version 1 and matches the host's `oxideterm-mosh/src/wire.rs`. Change both endpoints and advance the protocol version when changing this contract.

`.github/workflows/remote-desktop.yml` builds six native platforms and verifies the executable from each archive, binary input/output, prediction acknowledgement, resize and shutdown. The host's `oxideterm-mosh/tests/plugin_process.rs` tests real UDP through a local `mosh-server`.

Plugin code is GPL-3.0-only. Fernomade dependencies are Apache-2.0; dependency license notices are included in each package.
