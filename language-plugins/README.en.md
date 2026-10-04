# Editor language plugins

[简体中文](README.md)

This directory maintains 21 language plugin recipes: C, C++, C#, CSS, Common Lisp,
Elixir, Go, HTML, Java, JavaScript, Objective-C, Perl, PHP, R, Ruby, Rust, Scala,
Swift, TypeScript, TSX, and Zig. The host retains file-type recognition; plugins supply parsers
and highlight queries. Existing Markdown support stays built in.
TypeScript and TSX use the same pinned source release but are built and packaged
separately. PHP uses the grammar that accepts PHP tags.

## Build and verify

Use Node.js 22, the target host checkout, and Tree-sitter CLI 0.27.0.
Recipes pin grammar source versions and archive digests. On first use, the
compiler prepares its WebAssembly toolchain.

```sh
npm ci --ignore-scripts
npm install --prefix .language-tools tree-sitter-cli@0.27.0
node scripts/build-language-plugins.mjs all --host-repo ../OxideTerm --tree-sitter ./.language-tools/node_modules/.bin/tree-sitter
```

Replace `all` with a language ID to build one package. Each language has a ZIP
and an unpacked verification directory under `dist/languages/`. Packages
contain the manifest, parser, highlight queries, licenses, and provenance.
Common Lisp and JavaScript retain OxideTerm's own queries, with their license
included separately.

From the host repository, verify the actual parser, ABI, queries, and expected
text capture and highlight scope:

```sh
cargo run -p oxideterm-editor-syntax --example check_language_plugin -- ../oxideterm-plugins/dist/languages/elixir
```

Host syntax, editor, and registry tests cover recognition, installation,
updates, and disabling. Building candidate packages does not change the
user's plugin directory or the official catalog.

## Release with a supporting host

Run the `Build language plugins` workflow with the target host ref and plugin
version. By default it builds, validates, and uploads candidate artifacts.
Publishing additionally requires an already published host release tag.
The workflow creates immutable plugin assets and catalog records; official
listing follows the existing review process.

Initial host requirements come from the selected checkout, with a language-runtime
boundary strictly above `2.2.0`. Checkouts at `2.2.0` or earlier produce `>2.2.0`;
newer checkouts use their own version as the minimum. Ordinary plugin updates
inherit the published range instead of automatically raising its lower bound.
Development builds still require a published supporting host tag before release.
New language entries use the historical `minOxidetermVersion` spelling understood
by older native clients. For `>2.2.0`, this field is `2.2.1`, blocking older hosts.
Never emit it alongside `minOxideTermVersion`.

Language plugins use `runtime.kind: "language"` without general WASI plugin
host calls. Installation verifies asset digests; first use checks the grammar
ABI and compiles queries. Recognition works without installation, and text
remains editable when support is absent or disabled.

Grammar sources, queries, and licenses come from the pinned upstream projects
and OxideTerm. No Navop source or assets are included.
