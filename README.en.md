# OxideTerm Plugins

[简体中文](README.md) | **English**

[![Validate plugin registry](https://github.com/AnalyseDeCircuit/oxideterm-plugins/actions/workflows/validate.yml/badge.svg)](https://github.com/AnalyseDeCircuit/oxideterm-plugins/actions/workflows/validate.yml)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)

Build, publish, and discover native plugins for OxideTerm.

Plugins can add host-rendered tabs and sidebars, work with approved session state, and extend terminal, SFTP, Host Tools, IDE, AI, and sync workflows. OxideTerm owns themes, focus, permissions, and sensitive-data boundaries; plugins declare their capabilities through a manifest and a typed protocol.

[Start building](#create-a-plugin-in-five-minutes) · [Browse the catalog](registry/v2/index.json) · [Developer guide](https://github.com/AnalyseDeCircuit/oxideterm/blob/main/docs/user-guide/en/plugin-development.md) · [Request a listing](https://github.com/AnalyseDeCircuit/oxideterm-plugins/issues/new?template=plugin-submission.yml)

The v1 marketplace catalog is frozen. Its original URL, exact contents, and referenced packages remain available. All subsequent plugins, releases, and compatibility corrections are published only to v2. Existing clients can keep using the frozen catalog but will not see new plugins or updates; upgrade OxideTerm to a version supporting the v2 catalog to receive them.

## What you can build

| Area | Examples |
| --- | --- |
| Native UI | Tabs, sidebars, activity actions, settings, and status panels |
| Connection workflows | Read connection and session summaries, control lifecycle through the host |
| Terminal and files | Approved terminal interaction, SFTP, transfers, and IDE operations |
| Host operations | Typed Host Tools data, controlled actions, and custom monitors |
| Product extensions | Quick commands, notifications, themes, AI, sync, and plugin-scoped storage |

OxideTerm provides a packageable and releasable starter for each native plugin shape:

| Shape | Best for | Starter |
| --- | --- | --- |
| Manifest-only | Settings, tool metadata, or other static contributions that execute no code | [`templates/manifest-plugin`](templates/manifest-plugin) |
| Process | Host calls, dynamic interfaces, and complete workflows over JSON Lines | [`templates/process-plugin`](templates/process-plugin) |
| WASM | Portable logic running inside the host-managed WASI runtime | [`templates/wasm-plugin`](templates/wasm-plugin) |

## Create a plugin in five minutes

Git and Node.js 22 or later are required.

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

The generated Process plugin registers an interactive native tab. Edit [`plugin.json`](templates/process-plugin/plugin.json) to change capabilities and contributions, then implement behavior in [`bin/plugin.js`](templates/process-plugin/bin/plugin.js).

Creation sets the minimum host version from the latest stable release; use `--host-repo /path/to/OxideTerm` to read a local checkout instead. Release workflows inherit compatibility, verify packages, and generate catalog records with digests automatically. See the [publishing guide](docs/PUBLISHING.en.md#automated-release-preparation) for explicit range changes and corrections.

Change `--type process` to `manifest` or `wasm` to generate the other starters. The WASM starter also requires Rust and the `wasm32-wasip1` target.

On macOS or Linux:

```bash
npm run check
npm run package:unix
```

On Windows:

```powershell
npm run check
npm run package:windows
```

All three starters include bilingual instructions, standalone validation, package scripts, an MIT license, and a version-tagged GitHub Release workflow. The Process starter adds cross-platform launchers, the WASM starter provides a complete Rust implementation of Guest ABI v1, and the Manifest-only starter produces a portable package suitable for an `any` target.

You can also copy any starter directory directly. Each README covers installation, debugging, and release steps for that plugin shape.

## Install a marketplace plugin

Open **Plugin Manager → Plugin Marketplace** in OxideTerm. The application selects a package for the current platform and OxideTerm version, verifies its SHA-256 digest and plugin identity, and then displays the permissions requested by the plugin.

A marketplace listing is not a comprehensive security audit. Process plugins run as the current operating-system user, so verify the publisher and requested permissions before enabling one.

## Publish to the marketplace

Plugin source and Release assets stay in the author's own repository. This repository does not accept Pull Requests; the maintainer reviews Issues and updates the official catalog directly.

To publish:

1. increase the version in `plugin.json` and create a `v<version>` tag;
2. let the template workflow create immutable GitHub Release packages;
3. install and verify every platform you intend to claim;
4. open a [Plugin listing request](https://github.com/AnalyseDeCircuit/oxideterm-plugins/issues/new?template=plugin-submission.yml) with versions, targets, digests, permissions, and release notes;
5. repeat the same flow for later versions without replacing old Release assets.

Name, description, homepage, or tag changes do not require an invented plugin version. Choose “Metadata-only update” instead. See the [publishing and update guide](docs/PUBLISHING.en.md) for the complete rules.

## Example plugin

| Plugin | Demonstrates | Source |
| --- | --- | --- |
| Workspace Dashboard | Recent work, active tasks, workspace issues and pinned shortcuts | [`plugins/host-tools-dashboard`](plugins/host-tools-dashboard) |
| PDF Preview | Native PDF previews, page navigation and zoom for local files and SFTP | [`plugins/pdf-preview`](plugins/pdf-preview) |
| Certificate Viewer | Multiple certificates, validity dates, domains, purposes and fingerprints | [`plugins/certificate-preview`](plugins/certificate-preview) |
| Binary Inspector | ELF, Mach-O and PE metadata, section offsets and hex preview | [`plugins/binary-preview`](plugins/binary-preview) |
| SQLite Preview | Read-only database tables and paginated data previews | [`plugins/sqlite-preview`](plugins/sqlite-preview) |
| Toolbox | Encoding, JSON, time, text cleanup, digests and random generation | [`plugins/toolbox`](plugins/toolbox) |
| Tailscale Hosts | Device discovery and native connection drafts | [`plugins/tailscale-hosts`](plugins/tailscale-hosts) |
| Ansible Inventory | SSH host discovery from an Ansible inventory | [`plugins/ansible-inventory`](plugins/ansible-inventory) |
| GitHub Copilot CLI | Launch the installed official Copilot CLI for ACP chat | [`plugins/copilot-acp`](plugins/copilot-acp) |
| Qwen Code | Launch the installed Qwen Code CLI for ACP chat | [`plugins/qwen-code-acp`](plugins/qwen-code-acp) |
| Kimi CLI | Launch the installed Kimi CLI using its existing authentication | [`plugins/kimi-acp`](plugins/kimi-acp) |
| 24 language plugins | On-demand Tree-sitter parsing, highlighting, and folding | [`plugins/language-*`](plugins), [build and release guide](docs/language-plugins.en.md) |

Examples demonstrate real host capabilities and protocol boundaries. First-party plugins must still produce immutable release packages and pass platform verification before entering the official catalog.

## Repository layout

```text
registry/plugins/<id>/      per-plugin metadata, releases, and corrections
registry/categories.json    registered marketplace categories
registry/v1/index.json      frozen catalog for existing clients
registry/v1/index.sha256    checksum of the frozen contents
registry/v2/                generated summary catalog and individual histories
schema/                      marketplace catalog format
plugins/                     first-party plugins maintained by OxideTerm
templates/process-plugin/    standalone process plugin starter
templates/manifest-plugin/   manifest-only plugin starter
templates/wasm-plugin/       Rust WASM plugin starter
scripts/                     creation, validation, and release helpers
docs/                        publishing and catalog-maintenance guides
```

Maintainers validate catalog or first-party changes with:

```bash
npm ci --ignore-scripts
npm test
npm run check
```

## License

Language plugin files under `plugins/language-*/` use the Apache-2.0 license included in each directory, with upstream grammar licenses and copyright notices retained separately. Other first-party source uses [GNU GPL v3](LICENSE). Each starter under `templates/` includes its own MIT License. Third-party plugins retain the license declared by their authors.
