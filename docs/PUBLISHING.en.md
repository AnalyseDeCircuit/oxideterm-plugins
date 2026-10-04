# Plugin Publishing and Update Guide

[简体中文](PUBLISHING.md) | **English**

This guide is for authors who want to publish a plugin in the OxideTerm marketplace. Authors maintain source and Release assets in their own repositories. The OxideTerm catalog stores only the metadata needed for discovery, verification, and installation.

This repository does not accept Pull Requests. Submit new listings, package updates, and metadata changes through a [Plugin listing request](https://github.com/AnalyseDeCircuit/oxideterm-plugins/issues/new?template=plugin-submission.yml) Issue. The maintainer reviews the request and updates the catalog directly.

## First release

### 1. Establish a stable identity

- Choose a stable reverse-domain ID such as `com.example.server-inspector`.
- The package ID, name, and release version must match `plugin.json`. The catalog's top-level version is a compatibility snapshot for older clients.
- Do not change the ID in a later release to bypass permission review or replace another plugin.

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

See the [JSON Schema](../schema/registry-v1.schema.json) and [example entry](../examples/plugin-entry.json) for the complete structure.

## Maintainer review

The maintainer downloads Release assets, independently verifies digests and sizes, inspects the manifest, entry, paths, and permission changes, runs catalog validation, and then commits `registry/v1/index.json` directly. Third-party source is not copied into this repository for marketplace listing.

Compare the downloaded manifest's version and host range with the submitted release record. Run `npm ci --ignore-scripts`, `npm test`, and `npm run check`. To verify history against a previous commit, set `REGISTRY_BASE_REF` to its full SHA when running `node scripts/validate-registry.mjs`; CI performs this comparison against the commit preceding a push. Removed or modified releases and changed legacy snapshots fail validation.
