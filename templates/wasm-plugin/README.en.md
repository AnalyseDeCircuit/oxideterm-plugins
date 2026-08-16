# OxideTerm WASM Plugin Starter

[简体中文](README.md) | **English**

This starter uses Rust to build a portable OxideTerm WASM plugin. It implements OxideTerm WASM Guest ABI v1, registers a host-rendered tab, and updates state after a button interaction.

The module runs in OxideTerm's managed WASI Preview 1 runtime. It does not start an unsandboxed local process like a Process plugin.

## Start developing

Node.js 18, Rust, and the `wasm32-wasip1` target are required:

```bash
rustup target add wasm32-wasip1
node scripts/create-plugin.mjs ../my-wasm-plugin \
  --type wasm \
  --id com.example.my-wasm-plugin \
  --name "My WASM Plugin" \
  --author "Your Name"
cd ../my-wasm-plugin
npm run check
```

The scaffolder updates `plugin.json`. At compile time, `build.rs` reads the manifest ID, so the Rust source does not maintain a second plugin identity.

## Starter layout

```text
plugin.json                    identity, WASM entry, permissions, and tab
Cargo.toml                     Rust cdylib project
build.rs                       passes the manifest ID into the build
src/lib.rs                     ABI exports, request handling, and native UI data
scripts/check.mjs              manifest and Cargo version validation
scripts/package.sh             Unix build and package script
scripts/package.ps1            Windows build and package script
.github/workflows/release.yml  tag-driven release workflow
```

`src/lib.rs` implements the `_start`, allocation, command, event, and outbound-message exports required by the host. Edit `registration_message()` to design the interface and the command or event handlers to implement behavior.

The ABI exchanges JSON values, but its pointer-and-length packing must remain unchanged. See the [OxideTerm plugin development guide](https://github.com/AnalyseDeCircuit/oxideterm/blob/main/docs/user-guide/en/plugin-development.md#protocol-interfaces) for the complete contract.

## Build and debug locally

```bash
npm run check
npm run package:unix
```

On Windows:

```powershell
npm run check
npm run package:windows
```

The packaging scripts:

1. validate manifest and Cargo versions;
2. check Rust formatting;
3. compile `wasm32-wasip1` in release mode;
4. copy the generated `plugin.wasm`;
5. create a ZIP and report its SHA-256 and exact byte size.

Then run `oxideterm paths --json`, copy the directory containing `plugin.json` and `plugin.wasm` into `<config-dir>/plugins/<plugin-id>`, restart OxideTerm, and enable the plugin with its `ui.write` permission in Plugin Manager.

## Release

The WASM package contains no native platform binary and may use the `any` target after testing. Keep the versions in `plugin.json` and `Cargo.toml` synchronized.

Push a matching version tag to build a Release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow installs the WASM target, compiles the module, creates the package, and publishes a GitHub Release. Then follow the [publishing and update guide](https://github.com/AnalyseDeCircuit/oxideterm-plugins/blob/main/docs/PUBLISHING.en.md) to request a marketplace listing.
