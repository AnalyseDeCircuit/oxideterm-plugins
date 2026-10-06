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

## Catalog sources and automatic publication

Maintain `registry/plugins/<id>/metadata.json`, immutable
`releases/<version>.json`, and append-only `corrections/<version>/<sequence>.json`.
Register functional categories in `registry/categories.json`. Do not edit the
generated v2 catalogs or content-addressed histories by hand. `record` and
`correct` update the authoritative sources and generate only v2. v1 is permanently
frozen: preserve its original URL, exact bytes, and referenced assets. Do not add
plugins, releases, metadata changes, or compatibility corrections to v1.

For a CI producer, use `entry <plugin-directory> --release-url URL
--packages-dir DIRECTORY --output catalog-entry.json`. Upload this record with
all verified ZIPs to the same immutable Release. The maintained publisher
reconciles published first-party Releases, verifies the actual asset manifests,
sizes and SHA-256 values, merges each version, and commits the generated v2 catalog
under one serialized job. Third-party submissions still require maintainer review.
Use `node scripts/sync-catalog.mjs --repository OWNER/NAME --dry-run` to verify
reconciliation without registering releases or publishing an index.

Keep the historical top-level snapshot and every published release unchanged.
v2 roots contain display summaries and checksum-bound history references; clients
load histories only for installed plugins and the current marketplace page. Keep
old content-addressed histories served for cached roots. Run `catalog.mjs generate`
and `catalog.mjs check` after source edits. Both commands verify the frozen v1
checksum; CI also requires its exact bytes to match the previous commit. Validate
release immutability against the previous v2 histories, using original v1 for the
initial migration only. The v2 summary limit is 2 MiB and each history limit is
8 MiB. Include `docs/catalog-upgrade-notice.md` in new plugin release notes:
existing clients see no subsequent plugins or updates until they upgrade to a
host supporting v2. Do not set an expiration date for the retained v1 catalog.

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
  `remote-connections` category. Keep the native viewer, credentials, SSH tunnels and
  process ownership in the host; use the existing direct binary stdio transport.
  Declare `contributes.remoteDesktop` with its protocol and protocol version.
  Hosts through 2.2.1 do not support this runtime. Pin shared host dependencies
  to a published commit and retain the tested Cargo locks. Build and verify each
  native package with `build-remote-desktop.mjs` and `verify-remote-desktop.mjs`;
  `.github/workflows/remote-desktop.yml` covers all six platforms.
- Mosh uses `runtime.kind: "terminal-transport"`, `contributes.terminalTransport`
  and the same `remote-connections` category. It requires OxideTerm 2.2.2 or later.
  Use `build-remote-desktop.mjs mosh` and `verify-mosh.mjs`; the same workflow
  builds all six platforms. Keep the pipe protocol version synchronized with the
  host and verify real UDP with the host's `plugin_process` test before publishing.
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
