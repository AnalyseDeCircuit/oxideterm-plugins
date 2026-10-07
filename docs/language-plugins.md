# 编辑器语言插件

[English](language-plugins.en.md)

`plugins/language-<标识>/` 独立维护语言插件：C、C++、C#、CSS、Common Lisp、Elixir、Go、HTML、Java、
JavaScript、Objective-C、Perl、PHP、R、Ruby、Rust、Scala、Swift、TypeScript、TSX 和 Zig。
另有 Nginx、Terraform/HCL 和 Protobuf，分别识别 Nginx 专用文件名及 `.nginx`、`.tf/.tfvars/.hcl` 和 `.proto`。
通用 `.conf` 不会自动识别为 Nginx，`.tf.json` 和 `.tfvars.json` 仍按 JSON 处理。
已有语言包仍兼容原来的文件识别规则。自 2.2.2 起，新语言可以在插件清单中声明文件关联，
无需向主程序增加语言枚举或扩展名。Markdown 的现有实现保持内置。
TypeScript 和 TSX 使用同一固定版本的源码，分别编译和打包。PHP 使用包含 PHP 标签的语法。
每个目录都有独立的 `plugin.json`、`grammar.json`、`LICENSE` 和 `NOTICE`；自有高亮规则也放在对应插件目录内。

新增的独立插件包括 XML、DTD、INI、Kotlin、Dart、Nix、Julia、Vue、Svelte 和 Slint。
文件关联由各自清单声明：`.xml/.xsd/.xsl/.xslt/.rng`、`.dtd`、`.ini` 及 `.editorconfig/.gitconfig`、
`.kt/.kts`、`.dart`、`.nix`、`.jl`、`.vue`、`.svelte` 和 `.slint`。
通用 `.conf`、`.cfg` 不会被自动归为 INI；SVG 图片预览仍保留现有入口。

Vue、Svelte 包内包含 TypeScript 和 CSS 解析器；TypeScript 解析器同时处理 JavaScript。
脚本、样式、模板表达式按原文件字节坐标解析，无须用户另装对应语言包。
TypeScript 的基础 JavaScript 规则和框架的 HTML 规则会一并打包。

另有 AWK、jq、Justfile、Groovy、Clojure／ClojureScript、Erlang、OCaml 和 Typst。
OCaml 的 `.ml` 实现与 `.mli` 接口使用不同解析器，分别维护 `ocaml`、`ocaml-interface` 两个包。
Justfile 识别 `.just`、`justfile`、`.justfile`；Groovy 识别 `.groovy/.gvy/.gy/.gsh/.gradle` 和 `Jenkinsfile`，
`.gradle.kts` 继续使用 Kotlin。Clojure 识别 `.clj/.cljs/.cljc/.edn/.bb`。
Erlang 识别 `.erl/.hrl/.app/.app.src/.escript` 及 `rebar.config`、`rebar.config.script`；
通用 `.config` 不会被自动归为 Erlang。AWK、jq、Typst 分别识别 `.awk`、`.jq`、`.typ`。
各包的着色样例同时检查查询命中和原生编辑器实际采用的颜色，避免通用名称规则盖住函数或类型。

## 构建与验证

在 `contributes.language` 中声明语言元数据，例如：

```json
{
  "id": "ocaml-interface",
  "displayName": "OCaml Interface",
  "grammarName": "ocaml_interface",
  "extensions": ["mli"],
  "fileNames": []
}
```

`id` 是稳定的语言标识；`grammarName` 是解析器导出名称，不含 `tree_sitter_` 前缀，
省略时使用语言标识并将连字符换成下划线。扩展名不带点，可声明复合扩展名；
文件名是字面值，不能使用路径或通配符。匹配忽略 ASCII 大小写。
构建脚本继续写入 `highlights`、`parserSha256`、`highlightsSha256`，不需要人工维护索引中的对应字段。

发布工具从实际安装包提取元数据，写入 v2 的摘要与版本历史。
安装前，客户端从兼容的索引条目识别文件并提供对应插件的安装入口；安装后优先使用本地清单。
精确文件名优先于扩展名，较长扩展名优先于较短扩展名；同等匹配按插件 ID 排序。
内置语言保留现有扩展名优先级，例如 `.tf.json` 仍使用内置 JSON。
安装、更新、禁用及索引刷新会重新识别已打开的文件，并保留文本与撤销历史。

新声明要求宿主 `>=2.2.2`。现有语言增加这些字段时，准备发布使用
`--requires-current-app --host-repo <主程序源码目录>` 或明确的 `--host-range '>=2.2.2'`；
发布工具会拒绝仍包含旧宿主的范围。旧语言包无需重新发布。
v1 索引保持冻结，所有新增语言与更新只写入 v2。

混合语言插件在 `grammar.json` 中声明 `injections`，每项指定 `language` 和本地选择查询 `query`，
可用 `highlightsInclude` 合并基础高亮规则。查询用 `@injection.content` 选择原文区域。
构建脚本将子解析器、查询、许可证和校验值放进同一个安装包。
宿主校验所有资源，再为每种嵌入语言建立一个文档解析器；编辑和取消沿用文档自己的任务生命周期。

没有合适的 crate 归档时，可在配方中使用固定提交的 `archiveUrl`、`archiveRoot`。
归档地址必须对应 `repository` 和 `revision`，并填写实际下载内容的 SHA-256。

需要 Node.js 22、目标主程序源码和 Tree-sitter CLI 0.27.0。
配方固定语法源码版本和归档校验值；编译器首次使用会准备其 WebAssembly 工具链。

```sh
npm ci --ignore-scripts
npm install --prefix .language-tools tree-sitter-cli@0.27.0
node scripts/build-language-plugins.mjs all --host-repo ../OxideTerm --tree-sitter ./.language-tools/node_modules/.bin/tree-sitter
```

也可以把 `all` 换成单个语言标识。产物位于 `dist/languages/`：
每个语言有独立 ZIP，以及可供本地验证的解压目录。安装包包含
`plugin.json`、`parser.wasm`、`highlights.scm`、Apache-2.0 `LICENSE`、`LICENSE-grammar` 和 `NOTICE`。
插件自身及 Common Lisp、JavaScript 自有查询采用 Apache-2.0；上游语法许可证和版权声明单独保留。
使用 GPL 上游语法的包还包含 `SOURCE-grammar.tar.gz` 和 `SOURCE-grammar.json`，
提供对应的固定版本源码、归档校验值和构建命令；jq 的解析器采用 GPL-3.0-or-later。

在主程序仓库逐个验证实际解析器、语法接口，以及指定文本的高亮类别：

```sh
cargo run -p oxideterm-editor-syntax --example check_language_plugin -- ../oxideterm-plugins/dist/languages/elixir
```

识别、安装、更新与禁用的回归用例在主仓库的语法、编辑器及插件注册表测试中。
构建产物仅是候选包，执行构建不会修改用户的插件目录或官方市场索引。

## 独立发布与更新

只修改对应目录中的 `plugin.json` 版本，运行 `Build language plugin` 工作流，
选择语言标识和包含语言加载能力的目标宿主引用。默认只构建和验证该插件。
开启发布后生成 `language-<标识>-v<版本>` Release，其中只有该语言的 ZIP。
各语言独立升级，不使用共享版本或组合 Release；市场记录使用现有发布脚本从实际 ZIP 生成。
资产可在新宿主正式发布前准备并上架，但兼容范围必须排除不支持语言加载的旧版本。
正式市场收录仍使用现有审核流程。

首次创建时，宿主范围从所选源码读取；语言运行时的兼容边界为严格高于 `2.2.0`。
源码仍为 `2.2.0` 或更早时，自动生成 `>2.2.0`；源码版本更高时，以该版本作为下限。
普通插件更新继承已发布的兼容范围，不随主程序版本自动抬高下限。
发布前须用目标主程序的 `check_language_plugin` 验证实际解析器、语法接口和高亮。
新语言条目使用旧原生客户端能够读取的 `minOxidetermVersion` 拼写，
`>2.2.0` 对应此字段的值为 `2.2.1`，阻止旧版本安装。不要同时输出它与 `minOxideTermVersion`。

语法插件的 `runtime.kind` 为 `language`，没有通用 WASI 插件的宿主调用能力。
安装时验证资源校验值，首次使用时验证语法接口并编译查询。
文件识别不依赖安装状态；未安装或禁用时保持文本可编辑。

源码、查询与许可证来自配方指定的上游及 OxideTerm；没有引入 Navop 的源码或资产。
