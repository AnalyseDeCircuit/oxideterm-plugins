# Editor language plugins

[简体中文](language-plugins.md)

The individual `plugins/language-<id>/` directories independently maintain plugins: C, C++, C#, CSS, Common Lisp,
Elixir, Go, HTML, Java, JavaScript, Objective-C, Perl, PHP, R, Ruby, Rust, Scala,
Swift, TypeScript, TSX, and Zig. Existing packages retain their legacy file associations.
From 2.2.2, new languages declare associations in their manifests without adding
host enum variants or extension mappings. Existing Markdown support stays built in.
Nginx, Terraform/HCL, and Protobuf add recognition for Nginx-specific filenames
and `.nginx`, `.tf/.tfvars/.hcl`, and `.proto`, respectively. Generic `.conf` files
are not classified as Nginx; `.tf.json` and `.tfvars.json` remain JSON.
TypeScript and TSX use the same pinned source release but are built and packaged
separately. PHP uses the grammar that accepts PHP tags.
Each directory owns its `plugin.json`, `grammar.json`, `LICENSE`, and `NOTICE`,
along with any OxideTerm highlight queries used by that plugin.

Additional plugins cover XML, DTD, INI, Kotlin, Dart, Nix, Julia, Vue, Svelte and Slint.
Their manifests declare `.xml/.xsd/.xsl/.xslt/.rng`, `.dtd`, `.ini` and `.editorconfig/.gitconfig`,
`.kt/.kts`, `.dart`, `.nix`, `.jl`, `.vue`, `.svelte`, and `.slint`, respectively.
Generic `.conf` and `.cfg` files are not classified as INI; SVG keeps its existing image preview.

Vue and Svelte packages bundle TypeScript and CSS parsers; TypeScript also parses JavaScript.
Scripts, styles and template expressions use the original document's byte coordinates,
without requiring separate language installations. Base JavaScript and HTML highlight
queries are included alongside their derived language rules.

## Build and verify

Declare language metadata in `contributes.language`, for example:

```json
{
  "id": "ocaml-interface",
  "displayName": "OCaml Interface",
  "grammarName": "ocaml_interface",
  "extensions": ["mli"],
  "fileNames": []
}
```

`id` is the stable language identifier. `grammarName` is the exported grammar name,
without the `tree_sitter_` prefix; by default it uses the ID with hyphens replaced
by underscores. Extensions have no leading dot and can be compound extensions.
File names are literals, without paths or wildcards. Matching ignores ASCII case.
The builder still supplies `highlights`, `parserSha256`, and `highlightsSha256`.

Release tools extract metadata from actual archives into the v2 summary and history.
Before installation, compatible catalog declarations identify files and link to
the owning plugin; installed manifests take precedence. Exact file names outrank
extensions, longer extensions outrank shorter ones, and equal matches use plugin
ID order. Built-in grammars retain their extension defaults, so `.tf.json` stays JSON.
Installation, updates, disabling and catalog refresh re-detect open files while
preserving text and undo history.

These declarations require host `>=2.2.2`. When adding them to an existing plugin,
prepare with `--requires-current-app --host-repo <host-checkout>` or an explicit
`--host-range '>=2.2.2'`; recording rejects ranges that include older hosts.
Existing packages do not need republication. Frozen v1 stays unchanged; new
languages and updates are published only in v2.

Mixed-language recipes declare `injections` with a `language` and a local selector
`query`; `highlightsInclude` can supply base highlight rules. Select source regions
with `@injection.content`. The builder packages embedded parsers, queries, licenses
and digests together. The host verifies every asset and owns one document parser
per embedded language, using the document's existing edit and cancellation lifecycle.

For grammars without a suitable crate archive, recipes can supply a pinned
`archiveUrl` and `archiveRoot`. The URL must match `repository` and `revision`,
and the recipe must include the actual downloaded archive's SHA-256.

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
