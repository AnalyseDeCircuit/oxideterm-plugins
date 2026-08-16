# 插件发布与更新指南

**简体中文** | [English](PUBLISHING.en.md)

本文面向希望将插件发布到 OxideTerm 插件市场的作者。插件源码和 Release 资产由作者自己的仓库维护；OxideTerm 插件目录只保存用于发现、校验和安装的元数据。

本仓库不接受 Pull Request。首次收录、版本更新和展示信息修改都通过 [Plugin listing request](https://github.com/AnalyseDeCircuit/oxideterm-plugins/issues/new?template=plugin-submission.yml) Issue 提交，目录由维护者审核并直接更新。

## 首次发布

### 1. 固定插件身份

- 选择长期稳定的反向域名 ID，例如 `com.example.server-inspector`。
- 安装包和目录条目的 `id`、`name`、`version` 必须与 `plugin.json` 一致。
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
- 插件版本与最低 OxideTerm 版本；
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

OxideTerm 只会在目录版本高于已安装版本，并且当前平台与最低版本要求都满足时显示更新。

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
- `minOxideTermVersion` 使用完整语义化版本。
- `description`、`tags` 和 `capabilitiesSummary` 是应用内展示信息。

完整结构见 [JSON Schema](../schema/registry-v1.schema.json) 和 [条目示例](../examples/plugin-entry.json)。

## 维护者审核流程

维护者会下载 Release 资产并独立复算摘要与大小，检查清单、入口、路径和权限变化，运行目录校验，然后直接提交 `registry/v1/index.json`。第三方插件源码不会为了市场收录而复制到本仓库。
