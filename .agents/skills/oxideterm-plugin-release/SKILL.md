---
name: oxideterm-plugin-release
description: Create, update, package, or prepare OxideTerm marketplace plugins using the release automation, or correct published host compatibility. Use for plugin manifests, catalog releases, and publishing workflows; not for unrelated plugin UI styling or main-app version bumps.
---

# OxideTerm Plugin Releases

Run commands from the plugin marketplace repository. The maintained workflow is in
[PUBLISHING.md](../../../docs/PUBLISHING.md) and
[PUBLISHING.en.md](../../../docs/PUBLISHING.en.md); read the relevant creation,
release, or correction section. Use the existing scripts rather than manually
calculating compatibility, checksums, sizes, or release records.

## Choose the operation

For editor language plugins, follow [language-plugins.md](../../../docs/language-plugins.md).
Use the pinned grammar builder and the target host's `check_language_plugin`
verifier; these packages use the language runtime, not the general WASI template.
Each language belongs in `plugins/language-<id>/` with its own manifest, recipe,
license, and notices. Publish one ZIP per `language-<id>-v<version>` Release;
languages advance independently. Language plugin files use Apache-2.0 while
upstream grammar licenses and attribution remain intact. Assets may precede a
host release when explicitly requested, after validation against the loader and
with compatibility excluding unsupported hosts (`>2.2.0` for this capability).

- **Create:** use `scripts/create-plugin.mjs`. It defaults to the latest stable
  host version. For work requiring an unreleased host capability, use
  `--host-repo <actual-host-checkout>`; do not silently use the published version.
  Use `--host-range` only for a range supported by evidence.
- **Update:** bump the plugin's own version and run
  `node scripts/release-plugin.mjs prepare <plugin-directory>` before packaging.
  Ordinary updates inherit the last published range, including corrections.
  The tool respects an explicitly changed manifest range, so inspect that change.
- **Require a newer host:** establish which newly used capability requires it,
  then prepare with `--requires-current-app` and, when needed, `--host-repo`.
  An explicit tested range can instead be supplied with `--host-range`.
- **Record a release:** run `record <plugin-directory> --release-url <immutable-asset-directory>
  --package <target>=<zip-path>`, repeating the package argument for each tested
  platform. It verifies the actual archived manifest and calculates digests and
  sizes. The starter workflows perform preparation and recording automatically,
  attaching `catalog-entry.json` to the Release.
- **Correct a published range:** use `correct <plugin-id> --version <plugin-version>
  --host-range <range> --reason <reason>`. This appends a timestamped
  `compatibilityCorrections` record without rewriting previous declarations.

The last three operations are subcommands of `scripts/release-plugin.mjs`.
Inspect the generated diff before using the result in a publication.

## Preserve compatibility

- Plugin and host versions advance independently. A new plugin release does not
  imply that older plugin releases need a host upper bound.
- The current host version is a creation default or an explicit new-capability
  requirement, not evidence for arbitrary upper bounds or older-host support.
- Use Cargo-compatible explicit comparators, such as `>=2.3.0, <3.0.0`;
  npm OR and hyphen syntax are not supported.
- Keep all published release records, immutable assets, and the top-level legacy
  snapshot. Add releases and correction records; do not overwrite prior entries.
- New plugin types and Tree-sitter grammars also need host loader/API/grammar ABI
  checks. A version range alone does not make an older client understand them.
- ACP agent packages use `runtime.kind: "acp"` and the `acp` category. Their
  executable speaks ACP stdio directly to the host ACP owner, never the ordinary
  plugin lifecycle protocol. Hosts through 2.2.1 do not support this runtime;
  preparation automatically excludes them when reading such a development host.
- Remote desktop engine packages use `runtime.kind: "remote-desktop"` and the
  `remote-desktop` category. Keep the native viewer, credentials, SSH tunnels and
  process ownership in the host; use the existing direct binary stdio transport.
  Declare `contributes.remoteDesktop` with its protocol and protocol version.
  Hosts through 2.2.1 do not support this runtime. Pin shared host dependencies
  to a published commit and retain the tested Cargo locks. Build and verify each
  native package with `build-remote-desktop.mjs` and `verify-remote-desktop.mjs`;
  `.github/workflows/remote-desktop.yml` covers all six platforms.
- Old clients do not gain history selection, cached corrections, or startup
  checks retroactively. Check the actual old-client path before claiming a new
  catalog field prevents installation.

## Validate the affected workflow

Use Node.js 22 and `npm ci --ignore-scripts` for setup. Run `npm test` and
`npm run check` for release-tool or catalog changes. Set `REGISTRY_BASE_REF`
to the full pre-change commit SHA when validating history with
`node scripts/validate-registry.mjs`. For packaging changes, exercise the
affected template's package and record steps against temporary outputs.

Do not invoke publication merely to validate preparation. Commits, pushes,
tags, Releases, and listing messages need corresponding user authorization;
reuse authorization already given for the same scope.
