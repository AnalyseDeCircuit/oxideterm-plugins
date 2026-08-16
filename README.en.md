# OxideTerm Plugins

[简体中文](README.md) | **English**

[![Validate plugin registry](https://github.com/AnalyseDeCircuit/oxideterm-plugins/actions/workflows/validate.yml/badge.svg)](https://github.com/AnalyseDeCircuit/oxideterm-plugins/actions/workflows/validate.yml)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)

Build, publish, and discover native plugins for OxideTerm.

Plugins can add host-rendered tabs and sidebars, work with approved session state, and extend terminal, SFTP, Host Tools, IDE, AI, and sync workflows. OxideTerm owns themes, focus, permissions, and sensitive-data boundaries; plugins declare their capabilities through a manifest and a typed protocol.

[Start building](#create-a-plugin-in-five-minutes) · [Browse the catalog](registry/v1/index.json) · [Developer guide](https://github.com/AnalyseDeCircuit/oxideterm/blob/main/docs/user-guide/en/plugin-development.md) · [Request a listing](https://github.com/AnalyseDeCircuit/oxideterm-plugins/issues/new?template=plugin-submission.yml)

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

Git and Node.js 18 or later are required.

```bash
git clone https://github.com/AnalyseDeCircuit/oxideterm-plugins.git
cd oxideterm-plugins
node scripts/create-plugin.mjs ../my-oxideterm-plugin \
  --type process \
  --id com.example.my-plugin \
  --name "My Plugin" \
  --author "Your Name"
cd ../my-oxideterm-plugin
npm run check
```

The generated Process plugin registers an interactive native tab. Edit [`plugin.json`](templates/process-plugin/plugin.json) to change capabilities and contributions, then implement behavior in [`bin/plugin.js`](templates/process-plugin/bin/plugin.js).

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
| Host Tools Dashboard | Native tab, activity bar, settings, controlled remote monitor | [`plugins/host-tools-dashboard`](plugins/host-tools-dashboard) |

Examples demonstrate real host capabilities and protocol boundaries. First-party plugins must still produce immutable release packages and pass platform verification before entering the official catalog.

## Repository layout

```text
registry/v1/index.json       marketplace catalog consumed by OxideTerm
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
node scripts/validate-registry.mjs
node scripts/validate-plugins.mjs
```

## License

First-party source under `plugins/` is licensed under [GNU GPL v3](LICENSE). Each starter under `templates/` includes its own MIT License. Third-party plugins retain the license declared by their authors.
