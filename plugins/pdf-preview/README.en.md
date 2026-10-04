# PDF Preview

View PDF files in OxideTerm's local file browser and SFTP preview window.
The plugin contributes a file renderer only, without tabs, sidebar panels or host monitors.

Supports page navigation, jumping through the page slider, zoom and fit-to-width.
Only the current page is rendered. The initial version uses the host's 10 MiB
document preview limit. Password entry, text selection, search and editing are not supported.

The Rust executable ships with PDFium. Node.js, Python and a system PDF library
are not runtime dependencies. The host reads the selected file and owns remote
temporary copies. The plugin never opens SSH connections. Closing the preview
cancels the renderer. Enable the native process through the plugin manager's trust review.

## Build and package

Development requires Rust, Node.js 22 and tar. Run `npm ci --ignore-scripts` in the
marketplace root, then run these commands in this directory:

```sh
npm run build
npm test
npm run package
npm run test:package
```

The builder downloads the current platform's pinned engine from `pdfium.json`
and verifies its SHA-256. Packages include the native executable, shared library
and all upstream license notices. List only platforms tested with the final
package. Generate release records with the marketplace's `scripts/release-plugin.mjs`.

The new `filePreviews` host capability requires OxideTerm `>2.2.0` in the release
manifest. Local development copies for a source checkout still reporting 2.2.0
may use a separate range; never weaken the published package's requirement.

## Six-platform CI

The marketplace's `Build PDF preview plugin` workflow runs natively on ARM64 and
x86_64 for macOS, Linux and Windows. Rust is pinned to 1.94.1; `pdfium.json` pins
the engine revision and digests. Build and package steps verify that the runner,
Rust toolchain and package target agree.

Relevant pushes to main trigger validation, or the workflow can be dispatched
manually. Each runner extracts the final ZIP and starts the packaged executable
with its bundled engine to check page count, pixel colors, zoom dimensions and
error handling. Only after all six pass does the canonical release script generate
one `catalog-entry.json` with six platform URLs, checksums and sizes, preserving
existing history. Released versions are immutable; bump the version before updates.

The default run uploads CI artifacts only. Dispatch on main with `publish` enabled
to create `pdf-preview-v<version>` with all six ZIPs and the catalog entry in one
Release. It remains a draft until the assets finish uploading. The catalog index
still follows the repository's review and publication process; CI does not commit it.
