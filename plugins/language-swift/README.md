# Swift Language Support

Tree-sitter syntax support for Swift. Requires OxideTerm `>2.2.0`.

- `plugin.json`: plugin identity, version, and host compatibility.
- `grammar.json`: pinned upstream source, license, and verification sample.
- Build: `node scripts/build-language-plugins.mjs swift --host-repo ../OxideTerm` from the repository root.
- Release tag: `language-swift-v<plugin version>`.

Build and release instructions: [English](../../docs/language-plugins.en.md) · [简体中文](../../docs/language-plugins.md).

## License

Plugin files: [Apache-2.0](LICENSE). Upstream grammar licensing and attribution
are retained separately; see [NOTICE](NOTICE).
