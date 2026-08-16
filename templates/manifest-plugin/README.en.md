# OxideTerm Manifest-only Plugin Starter

[简体中文](README.md) | **English**

This starter demonstrates an OxideTerm plugin that executes no code. It declares host-managed settings through `plugin.json` and is suitable for configuration packs, static metadata, and product contributions that do not need a runtime.

## Start developing

From the catalog repository, run:

```bash
node scripts/create-plugin.mjs ../my-manifest-plugin \
  --type manifest \
  --id com.example.my-manifest-plugin \
  --name "My Manifest Plugin" \
  --author "Your Name"
```

Then enter the generated directory and run:

```bash
npm run check
```

When copying the starter manually, edit the identity, version, author, and `contributes` fields in `plugin.json`. A manifest-only plugin must omit both `runtime` and the legacy `main` field.

## What it can declare

The starter uses `contributes.settings` to demonstrate string and boolean settings. You may also declare static tool metadata supported by the host, but do not declare commands, event handlers, or dynamic interfaces that require runtime code.

OxideTerm renders and persists settings. Do not put secret values in defaults, names, descriptions, or plugin packages.

See the [OxideTerm plugin development guide](https://github.com/AnalyseDeCircuit/oxideterm/blob/main/docs/user-guide/en/plugin-development.md#minimal-manifest-only-plugin) for all manifest fields.

## Validate locally

1. run `oxideterm paths --json` to locate the configuration directory;
2. copy the complete directory into `<config-dir>/plugins/<plugin-id>`;
3. restart OxideTerm;
4. inspect the plugin state and settings in Plugin Manager.

A manifest-only plugin starts no process and does not require `runtime.process.trusted`.

## Package and release

On macOS or Linux:

```bash
npm run package:unix
```

On Windows:

```powershell
npm run package:windows
```

Both scripts create the same portable ZIP shape and report its SHA-256 and byte size. Because it contains no platform-specific runtime, you may submit it as an `any` target after testing the final package.

After increasing the version in `plugin.json`, push a matching `v<version>` tag. The starter workflow creates the GitHub Release. See the [publishing and update guide](https://github.com/AnalyseDeCircuit/oxideterm-plugins/blob/main/docs/PUBLISHING.en.md) for marketplace submission.
