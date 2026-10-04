# 编辑器语言插件

[English](README.en.md)

本目录维护 21 个语言插件的构建配方：C、C++、C#、CSS、Common Lisp、Elixir、Go、HTML、Java、
JavaScript、Objective-C、Perl、PHP、R、Ruby、Rust、Scala、Swift、TypeScript、TSX 和 Zig。
主程序保留文件类型识别，解析器与高亮查询随插件分发。Markdown 的现有实现保持内置。
TypeScript 和 TSX 使用同一固定版本的源码，分别编译和打包。PHP 使用包含 PHP 标签的语法。

## 构建与验证

需要 Node.js 22、目标主程序源码和 Tree-sitter CLI 0.27.0。
配方固定语法源码版本和归档校验值；编译器首次使用会准备其 WebAssembly 工具链。

```sh
npm ci --ignore-scripts
npm install --prefix .language-tools tree-sitter-cli@0.27.0
node scripts/build-language-plugins.mjs all --host-repo ../OxideTerm --tree-sitter ./.language-tools/node_modules/.bin/tree-sitter
```

也可以把 `all` 换成单个语言标识。产物位于 `dist/languages/`：
每个语言有独立 ZIP，以及可供本地验证的解压目录。安装包包含
`plugin.json`、`parser.wasm`、`highlights.scm`、许可证和来源说明。
Common Lisp 和 JavaScript 查询沿用 OxideTerm 自有规则，其许可证单独随包保留。

在主程序仓库逐个验证实际解析器、语法接口，以及指定文本的高亮类别：

```sh
cargo run -p oxideterm-editor-syntax --example check_language_plugin -- ../oxideterm-plugins/dist/languages/elixir
```

识别、安装、更新与禁用的回归用例在主仓库的语法、编辑器及插件注册表测试中。
构建产物仅是候选包，执行构建不会修改用户的插件目录或官方市场索引。

## 随支持该能力的宿主发布

运行 `Build language plugins` 工作流，选择目标宿主引用和插件版本。
默认只构建、验证并上传候选资产。开启发布时，工作流还会确认目标引用是
已经公开发布的宿主标签，然后创建不可变的插件发布资产与目录记录。
正式市场收录仍使用现有审核流程。

首次创建时，宿主范围从所选源码读取；语言运行时的兼容边界为严格高于 `2.2.0`。
源码仍为 `2.2.0` 或更早时，自动生成 `>2.2.0`；源码版本更高时，以该版本作为下限。
普通插件更新继承已发布的兼容范围，不随主程序版本自动抬高下限。
开发构建仍须通过正式宿主标签验证后才能发布。
新语言条目使用旧原生客户端能够读取的 `minOxidetermVersion` 拼写，
`>2.2.0` 对应此字段的值为 `2.2.1`，阻止旧版本安装。不要同时输出它与 `minOxideTermVersion`。

语法插件的 `runtime.kind` 为 `language`，没有通用 WASI 插件的宿主调用能力。
安装时验证资源校验值，首次使用时验证语法接口并编译查询。
文件识别不依赖安装状态；未安装或禁用时保持文本可编辑。

源码、查询与许可证来自配方指定的上游及 OxideTerm；没有引入 Navop 的源码或资产。
