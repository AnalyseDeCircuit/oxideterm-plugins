# Toolbox

An independently updated local text utility plugin with six groups:

- Encoding: Base64, URL components, UTF-8 text and hexadecimal.
- JSON: formatting, compaction, validation and field extraction.
- Time: explicit seconds/milliseconds, offset-qualified dates and named time zones.
- Text: stable deduplication, ascending/descending sorting, ANSI removal and regex extraction.
- Digests: SHA-256 and SHA-512 of the original UTF-8 text.
- Generation: UUID v4, and length-controlled alphanumeric, hexadecimal or numeric random strings.

Open its tab or select terminal text and choose **Process in Toolbox…**. Native editors provide selection, scrolling and input-method support. Results are read-only and can be copied, cleared or reused as input. Narrow windows stack the editors. Drafts belong to the open tab and are released when it closes. No processing history is persisted and results are never sent to the terminal automatically.

- Base64 rejects invalid characters, padding, lengths and decoded non-UTF-8 data. Spaces and original line endings are preserved.
- JSON retains large integers and decimal precision. Errors include line and column. Successful validation returns the original input unchanged.
- Extraction uses JSON Pointer, e.g. `/items/0/name`. An empty pointer selects the document. Escape `~` as `~0` and `/` as `~1` in field names.
- Processing limits: 256 KiB input, 4 KiB path, 2 MiB output. Errors preserve input and the previous result.
- Dates require an explicit ISO offset, e.g. `2026-10-05T12:00:00+08:00`. Time zones use names such as `Asia/Shanghai` or `UTC`. Timestamp units and fractional precision are never guessed or silently discarded.
- Line tools use the first separator style and preserve the final newline. Sorting is case-sensitive. Regex extraction returns complete non-overlapping matches, up to 10,000, and supports explicit flags such as `(?i)` and `(?m)`.
- Random string lengths range from 1 to 4096. System secure randomness and rejection sampling avoid biased character selection; entropy failure is reported directly.

Rust WASM with native host UI; one package for all six supported platforms. No Node.js runtime, filesystem, network or clipboard-read permission is needed. The host writes to the clipboard only on an explicit Copy action. All 11 locales ship with the plugin.

## Build and verify

Install the Rust `wasm32-wasip1` target and Node.js 22, then run from the marketplace checkout:

```sh
cargo test --manifest-path plugins/toolbox/Cargo.toml --locked
node scripts/release-plugin.mjs prepare plugins/toolbox
node plugins/toolbox/scripts/package.mjs --local
```

Packaging verifies the actual WASM registration, terminal entry, chained transformations and locale key parity. Omit `--local` for a release package.
Official compatibility is `>2.2.0`. Local packages support freshly rebuilt hosts still labeled 2.2.0; they must not be published.

This plugin processes text only and does not read or modify files.
