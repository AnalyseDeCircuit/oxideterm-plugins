# Plugin Publishing and Update Guide

[简体中文](PUBLISHING.md) | **English**

This guide is for authors who want to publish a plugin in the OxideTerm marketplace. Authors maintain source and Release assets in their own repositories. The OxideTerm catalog stores only the metadata needed for discovery, verification, and installation.

This repository does not accept Pull Requests. Submit new listings, package updates, and metadata changes through a [Plugin listing request](https://github.com/AnalyseDeCircuit/oxideterm-plugins/issues/new?template=plugin-submission.yml) Issue. The maintainer reviews the request and updates the catalog directly.

## First release

### Marketplace categories

Catalog `tags` supply the category buttons in the marketplace and installed list. Choose one or two broad functional categories per plugin. Keep language names, file extensions, example markers and search keywords out of these categories; describe specific functionality in the searchable plugin name and description.

| Category | Purpose |
| --- | --- |
| `language` | Language support |
| `preview` | File previews |
| `host-sources` | Host discovery and sources |
| `workspace` | Workspaces and work overview |
| `utilities` | Text processing and other utilities |
| `host-tools` | Host administration, when applicable |
| `acp` | ACP agent integrations |
| `remote-connections` | RDP, VNC, and Mosh connections |

For a new listing, `record` uses `plugin.json`'s `tags` when provided. Otherwise, language and file-preview plugins receive `language` and `preview` respectively. Other plugin types should declare a category explicitly, for example `"tags": ["utilities"]`. Updates preserve the existing catalog categories. Maintainers may introduce a new functional category in the catalog; clients build their buttons from the data without an application-side allowlist.

### 1. Establish a stable identity

- Choose a stable reverse-domain ID such as `com.example.server-inspector`.
- The package ID, name, and release version must match `plugin.json`. The catalog's top-level version is a compatibility snapshot for older clients.
- Do not change the ID in a later release to bypass permission review or replace another plugin.

Declare the plugin's own license in `plugin.json`, for example `"license": "MIT"`. The optional `licenseUrl` supplies an HTTPS link to the license text. First-listing automation copies both fields into the catalog; maintain display metadata for existing listings in their `metadata.json`. Missing declarations appear as “Not declared”. The installed page opens the packaged `LICENSE` file when available and offers a separate link to packaged third-party notices. An ACP integration's license is distinct from that of the official program installed separately by the user.

### 2. Prepare packages

Packages use ZIP. Put `plugin.json` at the package root together with the declared runtime entry and required resources. A single enclosing directory is accepted, but a root manifest is easier to inspect.

A package must not contain:

- symbolic links;
- absolute paths or `..` entries that escape the package;
- credentials, tokens, private keys, or development configuration;
- dependencies or resources you are not authorized to distribute.

Packages are limited to 50 MiB. A process plugin should publish packages whose entry points really run on each declared platform. A script with only a Unix shebang is not an `any` package.

### 3. Create an immutable Release

Use a `v<version>` tag such as `v1.2.0`. The starter workflow builds separate Unix and Windows ZIPs and reports their digests.

Do not submit branch archives, `latest.zip`, or replaceable URLs. Keep old Releases and assets available after they have been added to the marketplace.

To calculate digest and size manually:

```bash
# macOS
shasum -a 256 my-plugin-1.2.0.zip
stat -f '%z' my-plugin-1.2.0.zip

# Linux
sha256sum my-plugin-1.2.0.zip
stat -c '%s' my-plugin-1.2.0.zip
```

PowerShell:

```powershell
(Get-FileHash -Algorithm SHA256 .\my-plugin-1.2.0.zip).Hash.ToLowerInvariant()
(Get-Item .\my-plugin-1.2.0.zip).Length
```

### 4. Test the released assets

For every platform you intend to claim:

1. download the final asset from the Release instead of using the source directory;
2. install it through the OxideTerm Plugin Manager;
3. review and approve its permissions;
4. enable it and verify its primary interface and operations;
5. restart OxideTerm and confirm that discovery and activation still work;
6. uninstall it and confirm that it does not depend on files from the development checkout.

List only platforms that you actually tested.

### 5. Request a listing

The Issue must include:

- plugin ID, display name, author, and a concise factual description;
- source repository, homepage, and license;
- plugin version and the supported OxideTerm range from `plugin.json` (`engines.oxideterm`);
- target, immutable download URL, SHA-256, and exact byte size for every platform package;
- every capability requested by `plugin.json`;
- platforms that were actually tested;
- search tags and user-facing capability summaries.

Opening an Issue does not guarantee acceptance. The maintainer reviews identity, licensing, package shape, download URLs, digests, permissions, and basic installability.

## Publish a new version

When code, runtime behavior, permissions, or packages change:

1. keep the plugin ID unchanged;
2. increase the version in `plugin.json` according to Semantic Versioning;
3. create a new tag and Release without replacing old assets;
4. regenerate each platform package, SHA-256, and byte size;
5. install and test the final Release assets;
6. open another Plugin listing request and choose “Version update”;
7. describe feature, permission, compatibility, and tested-platform changes.

Clients with release-history support select the highest compatible semantic version that has a package for the current platform. Exact platform packages take precedence over `any`. An update is offered only when that version is newer than the installed plugin. If a higher release needs a different host version, the marketplace shows its requirement without replacing the installed plugin. Plugins are never automatically downgraded.

### Release history and host compatibility

Plugin versions advance independently of OxideTerm versions. Each new package must declare its supported host range in `plugin.json`, and its catalog release must repeat that range:

```json
{ "engines": { "oxideterm": ">=2.3.0, <3.0.0" } }
```

This is an example, not a compatibility claim. Use explicit comparators with complete versions, separated by commas for intersection. npm-style `||` and hyphen ranges are not supported. Test the claimed boundaries; a host range does not replace Tree-sitter grammar ABI or plugin API compatibility checks.

Append each published version to `releases` with its `version`, `engines`, and `packages`. Keep the original declaration and assets unchanged. Compatibility corrections are appended separately with a reason and timestamp. For an existing listing, retain the top-level `version`, `minOxideTermVersion`, and `packages` as the legacy snapshot and include that same package record in the history. Do not overwrite the snapshot with each new release.

OxideTerm checks compatibility during installation and startup, including after app upgrades and downgrades. Startup refreshes the official catalog with a bounded wait before runtime activation; offline startup uses the last valid cached catalog. The latest correction for an exact plugin ID and version takes precedence over the packaged declaration without changing the package on disk. Incompatible plugins retain their files, settings, and enable preference. Manual marketplace refreshes also save the catalog for the next startup. Unlisted legacy packages without a declared range remain permitted.

### Automated release preparation

The catalog tools require Node.js 22. Run `npm ci --ignore-scripts` once in this repository.

- Creation defaults to the latest stable OxideTerm version. Pass `--host-repo /path/to/OxideTerm` to read a local checkout through Cargo metadata, or `--host-range` for an explicitly tested range.
- Ordinary updates inherit the last published range, including corrections. An explicitly changed manifest range is respected.
- Using a new host capability requires an explicit `--requires-current-app` flag or range change. No upper bound is inferred from publication dates.

```sh
node scripts/release-plugin.mjs prepare ../my-plugin
node scripts/release-plugin.mjs prepare ../my-plugin --requires-current-app --host-repo ../OxideTerm
```

Prepare before packaging. The tool writes `engines.oxideterm` to the source manifest; it never rewrites an existing ZIP. After packaging, generate the marketplace record from the actual archives:

```sh
node scripts/release-plugin.mjs record ../my-plugin \
  --release-url https://github.com/example/my-plugin/releases/download/v1.1.0 \
  --package any=../my-plugin/dist/my-plugin-1.1.0.zip
```

Repeat `--package target=path` for platform packages. The tool checks the archived identity, version, and host range, calculates SHA-256 and size, and appends the release without replacing history. `--catalog path` selects another catalog file.

All three starter release workflows run preparation before packaging and attach `catalog-entry.json` to the GitHub Release. Authors submit that generated entry for listing; maintainers still review and publish the official catalog. The process starter lists the x86-64 Linux and Windows packages built by its workflow; add other targets only after testing them.

To correct a published compatibility statement:

```sh
node scripts/release-plugin.mjs correct com.example.my-plugin \
  --version 1.0.0 --host-range ">=2.2.0, <3.0.0" \
  --reason "The old API was removed in host 3.0"
```

This appends `compatibilityCorrections`; it does not edit the original range, assets, or earlier corrections. Clients select the last correction. CI rejects rewriting or deleting earlier correction records.

Older clients keep reading the top-level snapshot and do not gain history selection or runtime checks. Some older native clients also failed to read `minOxideTermVersion` because of a field-name mismatch. Do not rely on that field alone to hide new-only plugin types from those clients; confirm the publication strategy before listing new language packages.

## Update marketplace text only

Do not invent a package version when code and packages are unchanged. To change the name, description, homepage, tags, or capability summary, open a Plugin listing request and choose “Metadata-only update.” List the fields and reasons. The maintainer keeps the existing version and package data while changing confirmed metadata and `updatedAt`.

Describe the problem solved and the plugin's primary capabilities. Avoid slogans, comparative claims, and unverified security or compatibility promises.

## Platform targets

| `target` | Platform |
| --- | --- |
| `any` | Genuinely portable WASM, manifest-only, or cross-platform package |
| `aarch64-apple-darwin` | Apple silicon macOS |
| `x86_64-apple-darwin` | Intel macOS |
| `aarch64-unknown-linux-gnu` | ARM64 Linux |
| `x86_64-unknown-linux-gnu` | x86-64 Linux |
| `aarch64-pc-windows-msvc` | ARM64 Windows |
| `x86_64-pc-windows-msvc` | x86-64 Windows |

Several targets may reference the same package only when its runtime entry and dependencies work on all of them. A catalog entry cannot declare the same target twice.

## Catalog fields

- `downloadUrl` must use HTTPS and point to an immutable versioned asset.
- `checksum` is a 64-digit hexadecimal SHA-256, optionally prefixed with `sha256:`.
- `size` is the exact package size in bytes.
- `minOxideTermVersion` is the legacy snapshot's minimum complete semantic version.
- `releases[].engines.oxideterm` is the release's supported host range.
- `releases[].packages` contains that version's platform packages, URLs, digests, and sizes.
- `description`, `tags`, and `capabilitiesSummary` are shown inside OxideTerm.
- In v2, `listedAt` records initial listing and stays unchanged after registration;
  existing entries are backfilled from catalog commit history.
- In v2, `latestReleaseAt` records publication of the highest semantic version.
  Automation uses GitHub's published timestamp. Description edits and later
  publication of older versions do not change it; `updatedAt` remains metadata edit time.

See the [JSON Schema](../schema/registry-v1.schema.json) and [example entry](../examples/plugin-entry.json) for the complete structure.

## Maintainer review

The maintainer downloads Release assets, independently verifies digests and sizes, inspects the manifest, entry, paths, and permission changes, runs catalog validation, and registers per-plugin source records. Third-party source is not copied into this repository for marketplace listing.

### Per-plugin sources and automatic publication

Authoritative records are split by plugin; generated indexes are not edited by hand:

```text
registry/categories.json                         marketplace categories
registry/plugins/<id>/metadata.json               display metadata and frozen legacy snapshot
registry/plugins/<id>/releases/<version>.json      immutable release record
registry/plugins/<id>/corrections/<version>/000001.json  append-only correction sequence
registry/v1/index.json                            frozen original catalog; no updates
registry/v1/index.sha256                          checksum of the frozen contents
registry/v2/index.json                            generated summaries and history references
registry/v2/plugins/<id>/<sha256>.json             generated complete history for one plugin
```

`record` and `correct` update the sources and generate only v2 by default.
Edit the corresponding `metadata.json` for display changes and register category
IDs in `categories.json`. Do not edit generated files or remove older history
artifacts. Each reference binds the exact history size and SHA-256; clients load
histories for installed plugins and the current page, including exact-version
compatibility corrections during offline startup.

The original v1 URL, exact contents, and referenced packages remain available.
v1 no longer receives plugins, releases, metadata changes, or compatibility
corrections. Existing clients retain the frozen catalog but cannot discover new
plugins or updates; users must upgrade to a host supporting v2. Never replace or
delete Release assets referenced by the frozen catalog.

First-party CI producers generate an entry and upload it with the final ZIPs to
the same Release:

```sh
node scripts/release-plugin.mjs entry plugins/my-plugin \
  --release-url https://github.com/example/plugins/releases/download/my-plugin-v1.1.0 \
  --packages-dir dist/packages --output dist/catalog-entry.json
```

Generating this record does not register a plugin before its assets are available.
`Publish plugin catalog` runs after publication, source changes, or manual dispatch.
It verifies actual remote manifests, sizes, and digests, merges new versions, and
commits the v2 catalog. A single publisher serializes registration, catches up in
publication order, and safely repeats without losing later releases to stale
producer snapshots. Third-party submissions still require listing review.
Release workflows include the shared [catalog upgrade notice](catalog-upgrade-notice.md).

Ordinary pushes validate catalogs and scripts without starting multi-platform
plugin builds. Build native plugins with their release tags or a manual workflow
run; Dashboard, PDF and language plugins retain their manual publication entry.
Push release tags separately, with no more than three tags per push; use a manual
workflow run on the corresponding tag when needed.

```sh
node scripts/catalog.mjs generate
node scripts/catalog.mjs check
node scripts/catalog.mjs import /path/to/reviewed-catalog-entry.json
node scripts/sync-catalog.mjs --repository AnalyseDeCircuit/oxideterm-plugins --dry-run
```

Generation and validation check the exact v1 bytes against the freeze checksum.
CI also compares v1 with the previous commit, so changing both the catalog and
checksum cannot lift the freeze. v1 is no longer generated, and later history
growth is independent of the old full-index size limit. The v2 summary index has
a 2 MiB limit, and individual histories have an 8 MiB limit. Keep old remote
histories available so references in cached root catalogs continue to work.

Compare the downloaded manifest's version and host range with the submitted release record. Run `npm ci --ignore-scripts`, `npm test`, and `npm run check`. To verify history against a previous commit, set `REGISTRY_BASE_REF` to its full SHA when running `node scripts/validate-registry.mjs`; CI compares with the previous v2 history. Removed or modified releases, deleted published history files, and changes to frozen v1 fail validation. The initial migration uses the original v1 releases as its history baseline.
