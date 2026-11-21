<div align="center">

# ⚡ OxideTerm Plugins

**Official plugin marketplace, developer templates, and first-party extensions for [OxideTerm](https://github.com/AnalyseDeCircuit/oxideterm).**

AI Agents (ACP) · RDP / VNC / Mosh · FIDO2 · File Previews · 43 Languages · 4K Backgrounds

[![Validate plugin registry](https://github.com/AnalyseDeCircuit/oxideterm-plugins/actions/workflows/validate.yml/badge.svg)](https://github.com/AnalyseDeCircuit/oxideterm-plugins/actions/workflows/validate.yml)
[![Marketplace](https://img.shields.io/badge/marketplace-69%20plugins-blue)](#whats-in-the-marketplace)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

[**Browse plugins**](#whats-in-the-marketplace) ·
[**Install**](#install-plugins) ·
[**Create a plugin**](#create-a-plugin-in-5-minutes) ·
[**Submit a plugin**](#publish-to-the-marketplace) ·
[**Developer guide**](https://github.com/AnalyseDeCircuit/oxideterm/blob/main/docs/user-guide/en/plugin-development.md)

**English** | [简体中文](README.zh-CN.md)

<br>

<img src="https://raw.githubusercontent.com/AnalyseDeCircuit/oxideterm/main/docs/screenshots/plugin-manager.png" alt="OxideTerm Plugin Manager" width="900">

</div>

---

## Install plugins

Open **Plugin Manager → Marketplace** inside OxideTerm.

OxideTerm automatically picks the package for your OS, architecture, and host version, verifies the SHA-256 checksum and plugin identity, and displays every requested permission before enabling the plugin.

> [!NOTE]
> Marketplace listing is not a full security audit. Process plugins run as your OS user—review the publisher and requested permissions before enabling third-party plugins.

---

## What's in the marketplace

### AI coding agents (ACP)

Bring your existing CLI coding agents straight into OxideTerm's native ACP chat workspace, reusing your local login and CLI setup:

| Plugin | Description | Source |
| --- | --- | --- |
| **Claude Code** | Connect the local Claude Code CLI through ACP | [`plugins/claude-code-acp`](plugins/claude-code-acp) |
| **Codex** | Connect the local Codex CLI through ACP | [`plugins/codex-acp`](plugins/codex-acp) |
| **Cursor** | Launch the local Cursor Agent CLI through ACP | [`plugins/cursor-acp`](plugins/cursor-acp) |
| **GitHub Copilot CLI** | Launch the official GitHub Copilot CLI through ACP | [`plugins/copilot-acp`](plugins/copilot-acp) |
| **OpenCode** | Launch the installed OpenCode CLI through ACP | [`plugins/opencode-acp`](plugins/opencode-acp) |
| **Antigravity** | Launch the Antigravity ACP agent inside OxideTerm | [`plugins/antigravity-acp`](plugins/antigravity-acp) |
| **Grok Build** | Connect Grok Build through ACP | [`plugins/grok-acp`](plugins/grok-acp) |
| **Qwen Code** | Launch the official Qwen Code CLI through ACP | [`plugins/qwen-code-acp`](plugins/qwen-code-acp) |
| **Kimi CLI** | Launch Kimi CLI through ACP using existing auth | [`plugins/kimi-acp`](plugins/kimi-acp) |

### Protocols & hardware security

| Plugin | Description | Source |
| --- | --- | --- |
| **RDP** | Remote Desktop connections with OxideTerm's native viewer, audio, and clipboard | [`plugins/rdp`](plugins/rdp) |
| **VNC** | VNC remote desktop connections with native viewer and clipboard support | [`plugins/vnc`](plugins/vnc) |
| **Mosh** | Roaming Mosh terminal connections that survive network changes | [`plugins/mosh`](plugins/mosh) |
| **FIDO Security Key** | SSH authentication with `ed25519-sk` and `ecdsa-sk` hardware security keys | [`plugins/fido2`](plugins/fido2) |
| **MQTT Workbench** | Subscribe, inspect, and publish MQTT messages beside your terminals | [`plugins/mqtt`](plugins/mqtt) |

### File & data previews

| Plugin | Description | Source |
| --- | --- | --- |
| **PDF Preview** | Native PDF viewer with page navigation and zoom for local files and SFTP | [`plugins/pdf-preview`](plugins/pdf-preview) |
| **SQLite Preview** | Read-only SQLite table browser and paginated data inspection | [`plugins/sqlite-preview`](plugins/sqlite-preview) |
| **Certificate Viewer** | Inspect PEM/DER certificate chains, validity dates, SANs, usage, and fingerprints | [`plugins/certificate-preview`](plugins/certificate-preview) |
| **Binary Inspector** | Inspect ELF, Mach-O, and PE headers, sections, SHA-256, and hex preview | [`plugins/binary-preview`](plugins/binary-preview) |

### Ops & productivity

| Plugin | Description | Source |
| --- | --- | --- |
| **Workspace Dashboard** | Recent work, active tasks, pending items, and pinned shortcuts | [`plugins/host-tools-dashboard`](plugins/host-tools-dashboard) |
| **Tailscale Hosts** | Discover Tailscale devices and prefill OxideTerm's native connection form | [`plugins/tailscale-hosts`](plugins/tailscale-hosts) |
| **Ansible Inventory** | Import SSH targets from local Ansible inventories | [`plugins/ansible-inventory`](plugins/ansible-inventory) |
| **Toolbox** | Local encoding, JSON formatting, timestamps, text utilities, hashes, and generators | [`plugins/toolbox`](plugins/toolbox) |

### Animated 4K backgrounds

Original looping 4K backgrounds built for OxideTerm's native window surface:

- [**Dawn Mist**](plugins/background-dawn-mist) — warm white and teal tones
- [**Desert Gold**](plugins/background-desert-gold) — layered sand and gold
- [**Night Flow**](plugins/background-night-flow) — deep blue and violet

### Language support (43 languages)

Install Tree-sitter syntax highlighting and code folding on demand for OxideTerm's built-in editor. See [language plugins guide](docs/language-plugins.en.md) for build recipes.

<details>
<summary><b>Browse all 43 language plugins</b></summary>

<br>

[AWK](plugins/language-awk) · [C](plugins/language-c) · [C#](plugins/language-c-sharp) · [C++](plugins/language-cpp) · [Clojure / ClojureScript](plugins/language-clojure) · [Common Lisp](plugins/language-commonlisp) · [CSS](plugins/language-css) · [Dart](plugins/language-dart) · [DTD](plugins/language-dtd) · [Elixir](plugins/language-elixir) · [Erlang](plugins/language-erlang) · [Go](plugins/language-go) · [Groovy](plugins/language-groovy) · [HTML](plugins/language-html) · [INI](plugins/language-ini) · [Java](plugins/language-java) · [JavaScript](plugins/language-javascript) · [jq](plugins/language-jq) · [Julia](plugins/language-julia) · [Justfile](plugins/language-just) · [Kotlin](plugins/language-kotlin) · [Nginx](plugins/language-nginx) · [Nix](plugins/language-nix) · [Objective-C](plugins/language-objc) · [OCaml](plugins/language-ocaml) · [OCaml Interface](plugins/language-ocaml-interface) · [Perl](plugins/language-perl) · [PHP](plugins/language-php) · [Protobuf](plugins/language-proto) · [R](plugins/language-r) · [Ruby](plugins/language-ruby) · [Rust](plugins/language-rust) · [Scala](plugins/language-scala) · [Slint](plugins/language-slint) · [Svelte](plugins/language-svelte) · [Swift](plugins/language-swift) · [Terraform / HCL](plugins/language-hcl) · [TSX](plugins/language-tsx) · [TypeScript](plugins/language-typescript) · [Typst](plugins/language-typst) · [Vue](plugins/language-vue) · [XML](plugins/language-xml) · [Zig](plugins/language-zig)

</details>

### Community plugins

| Plugin | Author | Description |
| --- | --- | --- |
| [**MicroCon Helper**](https://github.com/allegrox/microcon-helper) | `xiaox` | Configure MicroCon UART bridge and monitor status |

---

## Build your own plugin

OxideTerm plugins render natively inside OxideTerm—the host owns themes, focus, permissions, and secret boundaries, while plugins declare capabilities via a manifest and typed protocol.

| Kind | Best for | Template |
| --- | --- | --- |
| **Manifest-only** | Static contributions (settings, themes, grammars, metadata) with no code execution | [`templates/manifest-plugin`](templates/manifest-plugin) |
| **Process** | Interactive native tabs/sidebars, external CLI bridges, full workflows via JSON Lines | [`templates/process-plugin`](templates/process-plugin) |
| **WASM** | Portable, sandboxed logic executed inside OxideTerm's WASI runtime | [`templates/wasm-plugin`](templates/wasm-plugin) |

### Create a plugin in 5 minutes

Requires Git and Node.js 22+. (WASM plugins also need Rust with the `wasm32-wasip1` target.)

```bash
git clone https://github.com/AnalyseDeCircuit/oxideterm-plugins.git
cd oxideterm-plugins
npm ci --ignore-scripts

node scripts/create-plugin.mjs ../my-oxideterm-plugin \
  --type process \
  --id com.example.my-plugin \
  --name "My Plugin" \
  --author "Your Name"

cd ../my-oxideterm-plugin
npm run check
```

Switch `--type process` to `manifest` or `wasm` for the other templates. Edit [`plugin.json`](templates/process-plugin/plugin.json) to declare permissions and UI contributions, and implement behavior in [`bin/plugin.js`](templates/process-plugin/bin/plugin.js).

Package for local testing or release:

```bash
# macOS / Linux
npm run check && npm run package:unix

# Windows (PowerShell)
npm run check; npm run package:windows
```

Every template ships with bilingual docs, standalone validation, packaging scripts, an MIT license, and a tag-triggered GitHub Release workflow. Read the full [Plugin Development Guide](https://github.com/AnalyseDeCircuit/oxideterm/blob/main/docs/user-guide/en/plugin-development.md) for host APIs and UI components.

---

## Publish to the marketplace

Plugin source code and release assets stay in your own repository. This repository publishes listings through issue review rather than direct pull requests:

1. Bump the version in `plugin.json` and push a `v<version>` git tag.
2. Wait for the template workflow to publish immutable GitHub Release archives.
3. Install and verify the release package on each target platform you declare.
4. Submit a [**Plugin listing request**](https://github.com/AnalyseDeCircuit/oxideterm-plugins/issues/new?template=plugin-submission.yml) with version, platforms, SHA-256 digests, permissions, and release notes.

To update display metadata (name, description, homepage, or tags) without cutting a new plugin version, choose **Metadata update only** in the issue form. Full rules and automation commands live in the [Publishing Guide](docs/PUBLISHING.en.md).

---

<details>
<summary><b>Repository layout & maintainer checks</b></summary>

```text
plugins/                   First-party plugins maintained by OxideTerm
templates/                 Starter templates (process, manifest, wasm)
registry/plugins/<id>/     Per-plugin metadata, releases, and compatibility records
registry/categories.json   Marketplace category definitions
registry/v2/               Generated v2 index and per-plugin version history
registry/v1/               Frozen legacy v1 catalog (read-only)
schema/                    JSON schemas for catalog validation
scripts/                   Scaffolding, validation, and release helpers
docs/                      Publishing and language-plugin guides
```

Validate registry or first-party plugin changes locally:

```bash
npm ci --ignore-scripts
npm test
npm run check
```

</details>

<details>
<summary><b>Catalog v1 compatibility note</b></summary>

The legacy `registry/v1/index.json` catalog is frozen and remains available at its original URL so older OxideTerm versions continue working. All new plugins, updates, and compatibility fixes are published exclusively to `registry/v2/`. Upgrade OxideTerm to a v2-capable release to receive new plugins and updates.

</details>

---

## License

- Language plugins under `plugins/language-*/` are licensed under **Apache-2.0** (upstream Tree-sitter grammar licenses and notices are preserved in each directory).
- Other first-party plugin sources in `plugins/` are licensed under [**GNU GPL v3**](LICENSE).
- Starter templates in `templates/` are licensed under **MIT**.
- Third-party community plugins use the licenses declared in their own repositories.
