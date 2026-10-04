# Editor language plugins

[简体中文](language-plugins.md)

The individual `plugins/language-<id>/` directories maintain 21 plugins: C, C++, C#, CSS, Common Lisp,
Elixir, Go, HTML, Java, JavaScript, Objective-C, Perl, PHP, R, Ruby, Rust, Scala,
Swift, TypeScript, TSX, and Zig. The host retains file-type recognition; plugins supply parsers
and highlight queries. Existing Markdown support stays built in.
TypeScript and TSX use the same pinned source release but are built and packaged
separately. PHP uses the grammar that accepts PHP tags.
Each directory owns its `plugin.json`, `grammar.json`, `LICENSE`, and `NOTICE`,
along with any OxideTerm highlight queries used by that plugin.

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
contain the manifest, parser, highlight queries, Apache-2.0 `LICENSE`,
`LICENSE-grammar`, and `NOTICE`. Plugin files and OxideTerm's own Common Lisp
and JavaScript queries use Apache-2.0; upstream grammar licenses and copyright
notices are retained separately.

From the host repository, verify the actual parser, ABI, queries, and expected
text capture and highlight scope:

```sh
cargo run -p oxideterm-editor-syntax --example check_language_plugin -- ../oxideterm-plugins/dist/languages/elixir
```

Host syntax, editor, and registry tests cover recognition, installation,
updates, and disabling. Building candidate packages does not change the
user's plugin directory or the official catalog.

## Independent releases and updates

Bump only the selected plugin's `plugin.json` version and run `Build language
plugin` with its language ID and a host ref that includes the language loader.
By default it builds and verifies that plugin. Publishing creates
`language-<id>-v<version>` with one ZIP for that language. Languages advance
independently, without a shared release version. Catalog records are generated
from the actual ZIP through the existing release tool. Assets may be listed
before the next host release, provided their compatibility range excludes
unsupported hosts. Official listing follows the existing review process.

Initial host requirements come from the selected checkout, with a language-runtime
boundary strictly above `2.2.0`. Checkouts at `2.2.0` or earlier produce `>2.2.0`;
newer checkouts use their own version as the minimum. Ordinary plugin updates
inherit the published range instead of automatically raising its lower bound.
Before publication, verify the actual parser, ABI, and highlighting with the
target host's `check_language_plugin`.
New language entries use the historical `minOxidetermVersion` spelling understood
by older native clients. For `>2.2.0`, this field is `2.2.1`, blocking older hosts.
Never emit it alongside `minOxideTermVersion`.

Language plugins use `runtime.kind: "language"` without general WASI plugin
host calls. Installation verifies asset digests; first use checks the grammar
ABI and compiles queries. Recognition works without installation, and text
remains editable when support is absent or disabled.

Grammar sources, queries, and licenses come from the pinned upstream projects
and OxideTerm. No Navop source or assets are included.
