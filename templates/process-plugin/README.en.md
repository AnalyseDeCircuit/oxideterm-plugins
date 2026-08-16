# OxideTerm Process Plugin Starter

[简体中文](README.md) | **English**

This is a runnable, packageable, and releasable native process plugin for OxideTerm. It registers a host-rendered tab and handles button events without requiring GPUI, HTML, or CSS code.

The starter requires Node.js 18 or later. Generated plugin source is MIT-licensed and can be used and modified in your own repository.

## Run it now

From the catalog repository root, run:

```bash
node scripts/create-plugin.mjs ../my-process-plugin \
  --type process \
  --id com.example.my-process-plugin \
  --name "My Process Plugin" \
  --author "Your Name"
```

Then enter the generated plugin directory and run:

```bash
npm run check
```

If you copied this starter manually, first edit:

- the `id`, name, version, description, and author in `plugin.json`;
- the capabilities under `permissions.capabilities`;
- the tabs, settings, or other contributions under `contributes`.

The runtime reads its plugin ID from `plugin.json`, so JavaScript does not maintain a second identity value.

## Develop the plugin

Important files:

```text
plugin.json                    identity, permissions, and contributions
bin/plugin.js                  process protocol and plugin behavior
bin/plugin                     macOS and Linux launcher
bin/plugin.cmd                 Windows launcher
scripts/check.mjs              manifest, entry, and JavaScript validation
scripts/package.sh             Unix package builder
scripts/package.ps1            Windows package builder
.github/workflows/release.yml  tag-driven release workflow
```

Edit [`starterTabSchema()`](bin/plugin.js) to define the host-rendered interface and [`handleUiEvent()`](bin/plugin.js) to handle interaction. Standard output is reserved for protocol frames. Send diagnostics to standard error without including credentials, request bodies, or remote data.

See the [OxideTerm plugin development guide](https://github.com/AnalyseDeCircuit/oxideterm/blob/main/docs/user-guide/en/plugin-development.md) for the complete manifest, protocol, UI components, permissions, and Host API.

## Debug inside OxideTerm

1. run `oxideterm paths --json` to locate the active configuration directory;
2. copy the plugin into `<config-dir>/plugins/<plugin-id>`;
3. on macOS or Linux, confirm that `bin/plugin` is executable;
4. restart OxideTerm;
5. enable the plugin in Plugin Manager and approve its permissions;
6. after editing, copy the directory again and reload the plugin.

A process plugin implicitly requests `runtime.process.trusted` because it runs as the current operating-system user. OxideTerm adds this permission from the runtime type; do not add it manually to `permissions.capabilities`.

## Package

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

Packages are written to `dist/`. The scripts print the SHA-256 digest and exact byte size required by the marketplace. The Unix package uses `bin/plugin`; the Windows builder changes the staged manifest entry to `bin/plugin.cmd` without modifying the source manifest.

Do not mark a Unix package as Windows-compatible, and do not mark a process package as `any`. Submit only targets on which you installed and tested the final package.

## Release

1. change the version in `plugin.json`;
2. commit and push the source;
3. create a tag matching the manifest version, such as `v0.1.0`;
4. push the tag;
5. wait for the **Release plugin** workflow.

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow verifies the tag against the manifest, builds Unix and Windows ZIPs, and creates a GitHub Release. Download and install the final Release assets before requesting a listing through the [publishing and update guide](https://github.com/AnalyseDeCircuit/oxideterm-plugins/blob/main/docs/PUBLISHING.en.md).

Do not replace published Release assets. Increase the version and create a new tag for each update.
