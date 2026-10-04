# 插件发布与更新指南

**简体中文** | [English](PUBLISHING.en.md)

本文面向希望将插件发布到 OxideTerm 插件市场的作者。插件源码和 Release 资产由作者自己的仓库维护；OxideTerm 插件目录只保存用于发现、校验和安装的元数据。

本仓库不接受 Pull Request。首次收录、版本更新和展示信息修改都通过 [Plugin listing request](https://github.com/AnalyseDeCircuit/oxideterm-plugins/issues/new?template=plugin-submission.yml) Issue 提交，目录由维护者审核并直接更新。

## 首次发布

### 1. 固定插件身份

- 选择长期稳定的反向域名 ID，例如 `com.example.server-inspector`。
- 安装包中的标识、名称和发布版本必须与 `plugin.json` 一致；目录顶层版本保留为旧客户端的兼容记录。
- 后续更新不得通过更换 ID 规避权限复核或替代已有插件。

### 2. 准备安装包

安装包使用 ZIP。包根目录应包含 `plugin.json`，并包含清单声明的运行时入口和所需资源。允许只有一个外层目录，但直接把清单放在根目录更容易检查。

安装包不得包含：

- 符号链接；
- 指向包外的绝对路径或 `..` 逃逸路径；
- 凭据、令牌、私钥或开发环境配置；
- 未获得分发权的依赖或资源。

每个安装包最大 50 MiB。进程插件应按平台发布入口真实可运行的包；仅有 Unix shebang 的脚本不能声明为跨平台 `any`。

### 3. 创建不可变 Release

推荐使用 `v<version>` 标签，例如 `v1.2.0`。模板仓库的 Release 工作流会为 Unix 和 Windows 生成独立 ZIP，并输出摘要。

不要提交分支源码压缩包、`latest.zip` 或会被覆盖的地址。已经用于市场目录的旧 Release 和资产应继续可用。

如需手工计算摘要与大小：

```bash
# macOS
shasum -a 256 my-plugin-1.2.0.zip
stat -f '%z' my-plugin-1.2.0.zip

# Linux
sha256sum my-plugin-1.2.0.zip
stat -c '%s' my-plugin-1.2.0.zip
```

PowerShell：

```powershell
(Get-FileHash -Algorithm SHA256 .\my-plugin-1.2.0.zip).Hash.ToLowerInvariant()
(Get-Item .\my-plugin-1.2.0.zip).Length
```

### 4. 实际验证

在准备声明支持的每个平台上：

1. 从 Release 下载最终资产，而不是使用本地源码目录；
2. 通过 OxideTerm 插件管理器安装；
3. 审阅并批准权限；
4. 启用插件并验证主要界面和操作；
5. 重启 OxideTerm，确认插件仍能发现和启动；
6. 卸载插件，确认没有依赖开发目录中的文件。

只声明实际验证过的平台。

### 5. 申请收录

Issue 需要提供：

- 插件 ID、展示名称、作者、客观的一句话描述；
- 源码仓库、主页和许可证；
- 插件版本，以及 `plugin.json` 中声明的宿主兼容范围（`engines.oxideterm`）；
- 每个平台的 target、不可变下载地址、SHA-256 和准确字节数；
- `plugin.json` 申请的全部能力；
- 已实际验证的平台；
- 用于搜索的标签和用户可见能力摘要。

提交 Issue 不代表自动收录。维护者会检查插件身份、许可证、包结构、下载地址、摘要、权限声明和基本可安装性。

## 发布新版本

代码、运行时、权限或安装包发生变化时：

1. 保持插件 ID 不变；
2. 按语义化版本提升 `plugin.json` 版本；
3. 创建新标签和新 Release，禁止替换旧资产；
4. 为每个平台重新生成包、SHA-256 和字节数；
5. 安装 Release 中的最终资产并验证；
6. 提交新的 Plugin listing request，选择“版本更新”；
7. 说明功能变化、权限变化、兼容性变化和测试平台。

支持版本历史的客户端会选择当前宿主兼容且有当前平台安装包的最高语义化版本，优先使用精确平台包，其次使用 `any` 包。只有该版本高于已安装版本时才提供更新。若更高版本要求不同的宿主版本，市场会单独说明要求，并保留当前插件，不会自动降级插件。

### 版本历史与宿主兼容范围

插件版本与主应用版本独立递增。新发布的安装包必须在 `plugin.json` 中声明宿主兼容范围，目录中对应的发布记录必须填写同一范围：

```json
{ "engines": { "oxideterm": ">=2.3.0, <3.0.0" } }
```

这只是格式示例，不代表实际兼容承诺。使用明确的比较符和完整版本，多个条件用逗号分隔，表示必须同时满足。不支持 npm 的 `||` 或连字符范围写法。应验证声明的兼容边界；宿主版本范围不能替代语法解析器的二进制接口或插件接口兼容检查。

每次发布都向 `releases` 添加包含 `version`、`engines` 和 `packages` 的记录，保留原始声明及资产。兼容性纠错通过追加记录完成，并填写原因和时间。现有条目的顶层 `version`、`minOxideTermVersion` 和 `packages` 保留为旧客户端读取的版本记录，同一安装包记录也应纳入历史。不要随着新版发布覆盖顶层记录。

主应用会在安装和启动时检查兼容性，应用升级和降级后同样生效。启动时限时刷新官方目录，再激活运行时；离线时使用上次有效的缓存。根据插件标识和版本精确匹配到的最新纠错声明优先于安装包声明，但不会改写磁盘上的安装包。不兼容插件保留文件、设置和启用偏好。手动刷新市场也会保存目录，供下次启动使用。未被目录收录且未声明范围的旧插件仍允许使用。

### 自动准备发布

目录工具需要 Node.js 22，首次使用先在本仓库运行 `npm ci --ignore-scripts`。

- 首次创建默认读取主程序最新正式版；使用 `--host-repo /path/to/OxideTerm` 可通过 Cargo 元数据读取本地源码版本，使用 `--host-range` 可指定经过验证的范围。
- 普通更新继承最近发布版本的范围，包括后续纠错；清单中明确改动的范围会被保留。
- 使用了新版宿主能力时，明确传入 `--requires-current-app` 或修改范围。工具不会根据发布时间推断旧插件的版本上限。

```sh
node scripts/release-plugin.mjs prepare ../my-plugin
node scripts/release-plugin.mjs prepare ../my-plugin --requires-current-app --host-repo ../OxideTerm
```

应在打包前执行准备步骤。工具将 `engines.oxideterm` 写入源码清单，不会修改已生成的 ZIP。打包后，从实际安装包生成市场记录：

```sh
node scripts/release-plugin.mjs record ../my-plugin \
  --release-url https://github.com/example/my-plugin/releases/download/v1.1.0 \
  --package any=../my-plugin/dist/my-plugin-1.1.0.zip
```

多个平台包重复填写 `--package target=path`。工具核对包内标识、版本和兼容范围，计算校验值及大小，然后追加发布记录，保留历史版本。`--catalog path` 可以指定其他目录文件。

三套模板的发布流水线均已接入打包前准备，并将自动生成的 `catalog-entry.json` 附加到发布资产。作者提交该文件申请收录，正式目录仍由维护者审核发布。进程插件模板默认列出流水线实际构建的 x86-64 Linux 和 Windows 安装包，其他平台应验证后再添加。

纠正已发布版本的兼容声明：

```sh
node scripts/release-plugin.mjs correct com.example.my-plugin \
  --version 1.0.0 --host-range ">=2.2.0, <3.0.0" \
  --reason "主程序 3.0 已移除旧接口"
```

此命令追加 `compatibilityCorrections`，保留原始范围、安装包及此前纠错记录。客户端采用最后一条纠错声明；持续集成拒绝改写或删除旧纠错记录。

旧客户端继续读取顶层记录，不会因此获得版本历史选择或运行时检查能力。部分旧原生客户端还存在字段名大小写不一致、未读取 `minOxideTermVersion` 的问题。不能只靠该字段向旧客户端隐藏新插件类型；发布新的语言插件前，须确认对应的目录发布方案。

## 只更新市场文案

如果代码和安装包没有改变，更新名称、描述、主页、标签或能力摘要时无需虚构插件版本。提交 Plugin listing request，选择“仅更新展示信息”，列出要修改的字段和原因。维护者会保留版本和包数据，只更新确认后的元数据与 `updatedAt`。

描述应说明插件解决的问题和主要能力，避免广告口号、比较级承诺以及未经验证的安全或兼容性声明。

## 平台 target

| `target` | 平台 |
| --- | --- |
| `any` | 真正跨平台的 WASM、Manifest-only 或可移植安装包 |
| `aarch64-apple-darwin` | Apple 芯片 macOS |
| `x86_64-apple-darwin` | Intel macOS |
| `aarch64-unknown-linux-gnu` | ARM64 Linux |
| `x86_64-unknown-linux-gnu` | x86-64 Linux |
| `aarch64-pc-windows-msvc` | ARM64 Windows |
| `x86_64-pc-windows-msvc` | x86-64 Windows |

同一版本可以让多个 target 引用同一个包，但前提是该包的运行时入口和依赖在这些平台上确实可用。同一条目不能重复声明同一个 target。

## 目录字段

- `downloadUrl` 必须使用 HTTPS 并指向不可变版本资产。
- `checksum` 是 64 位十六进制 SHA-256，可带 `sha256:` 前缀。
- `size` 是安装包的准确字节数。
- `minOxideTermVersion` 是顶层兼容记录的最低宿主版本，使用完整语义化版本。
- `releases[].engines.oxideterm` 声明该发布版本的宿主兼容范围。
- `releases[].packages` 保存该版本各平台的下载地址、校验值和大小。
- `description`、`tags` 和 `capabilitiesSummary` 是应用内展示信息。

完整结构见 [JSON Schema](../schema/registry-v1.schema.json) 和 [条目示例](../examples/plugin-entry.json)。

## 维护者审核流程

维护者会下载 Release 资产并独立复算摘要与大小，检查清单、入口、路径和权限变化，运行目录校验，然后直接提交 `registry/v1/index.json`。第三方插件源码不会为了市场收录而复制到本仓库。

核对下载包清单中的版本和宿主范围与发布记录一致。运行 `npm ci --ignore-scripts`、`npm test` 和 `npm run check`。如需对照历史提交，运行 `node scripts/validate-registry.mjs` 时将环境变量 `REGISTRY_BASE_REF` 设为基准提交的完整标识；持续集成会自动与推送前的提交比较，拒绝删除或修改已发布记录、覆盖旧客户端的顶层版本记录。
