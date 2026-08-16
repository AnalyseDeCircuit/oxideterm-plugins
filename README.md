# OxideTerm Plugins

**简体中文** | [English](README.en.md)

[![Validate plugin registry](https://github.com/AnalyseDeCircuit/oxideterm-plugins/actions/workflows/validate.yml/badge.svg)](https://github.com/AnalyseDeCircuit/oxideterm-plugins/actions/workflows/validate.yml)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)

为 OxideTerm 构建、发布和发现原生插件。

插件可以添加由 OxideTerm 原生渲染的标签页和侧边栏，读取经过授权的会话状态，扩展终端、SFTP、Host Tools、IDE、AI 与同步工作流。宿主负责主题、焦点、权限和敏感数据边界；插件通过清单和类型化协议声明能力。

[开始开发](#五分钟创建插件) · [浏览市场目录](registry/v1/index.json) · [插件开发文档](https://github.com/AnalyseDeCircuit/oxideterm/blob/main/docs/user-guide/zh-Hans/plugin-development.md) · [申请收录](https://github.com/AnalyseDeCircuit/oxideterm-plugins/issues/new?template=plugin-submission.yml)

## 你可以构建什么

| 方向 | 示例 |
| --- | --- |
| 原生界面 | 标签页、侧边栏、活动栏操作、设置和状态面板 |
| 连接工作流 | 读取连接与会话摘要，通过宿主控制连接生命周期 |
| 终端与文件 | 经过授权的终端交互、SFTP、传输和 IDE 操作 |
| 主机运维 | 类型化 Host Tools 数据、受控操作和自定义监控 |
| 产品扩展 | 快速命令、通知、主题、AI、同步与插件私有存储 |

OxideTerm 为三种原生插件形态分别提供可打包和发布的模板：

| 形态 | 适用场景 | 模板 |
| --- | --- | --- |
| Manifest-only | 设置、工具元数据或其他不运行代码的静态贡献 | [`templates/manifest-plugin`](templates/manifest-plugin) |
| Process | 通过 JSON Lines 完成宿主调用、动态界面和完整工作流 | [`templates/process-plugin`](templates/process-plugin) |
| WASM | 在宿主管理的 WASI 运行时中执行可移植逻辑 | [`templates/wasm-plugin`](templates/wasm-plugin) |

## 五分钟创建插件

需要 Git 和 Node.js 18 或更新版本。

```bash
git clone https://github.com/AnalyseDeCircuit/oxideterm-plugins.git
cd oxideterm-plugins
node scripts/create-plugin.mjs ../my-oxideterm-plugin \
  --type process \
  --id com.example.my-plugin \
  --name "My Plugin" \
  --author "Your Name"
cd ../my-oxideterm-plugin
npm run check
```

生成的 Process 插件会注册一个可交互的原生标签页。打开 [`plugin.json`](templates/process-plugin/plugin.json) 修改能力和贡献，在 [`bin/plugin.js`](templates/process-plugin/bin/plugin.js) 中实现行为。

将 `--type process` 改成 `manifest` 或 `wasm` 即可生成另外两种模板。WASM 模板还需要 Rust 和 `wasm32-wasip1` target。

开发时运行：

```bash
npm run check
npm run package:unix
```

Windows 使用：

```powershell
npm run check
npm run package:windows
```

三套模板都包含双语说明、独立校验、安装包脚本、MIT 许可证和基于版本标签的 GitHub Release 工作流。Process 模板额外提供双平台启动器；WASM 模板提供完整 Guest ABI v1 Rust 实现；Manifest-only 模板会生成可作为 `any` target 发布的纯清单包。

也可以直接复制任一模板目录。每个模板的 README 都包含对应的本地安装、调试和发布步骤。

## 安装市场插件

在 OxideTerm 中打开 **插件管理器 → 插件市场**。应用会根据当前平台和 OxideTerm 版本选择安装包，校验 SHA-256 与插件身份，然后展示插件申请的权限。

市场条目不是对插件的全面安全审计。进程插件会以当前用户身份运行，启用前应确认发布者和权限声明可信。

## 发布到插件市场

插件源码和 Release 资产保留在作者自己的仓库。本仓库不接受 Pull Request；维护者根据 Issue 审核并直接更新正式目录。

发布流程：

1. 为 `plugin.json` 提升版本并创建 `v<version>` 标签；
2. 等待模板工作流生成不可变的 GitHub Release 安装包；
3. 实际安装并验证要声明支持的平台；
4. 提交 [Plugin listing request](https://github.com/AnalyseDeCircuit/oxideterm-plugins/issues/new?template=plugin-submission.yml)，附上版本、平台、摘要、权限和更新说明；
5. 后续版本重复同一流程，旧 Release 资产不得覆盖。

名称、描述、主页或标签变化不需要虚构插件版本，可以选择“仅更新展示信息”。完整规则见 [插件发布与更新指南](docs/PUBLISHING.md)。

## 示例插件

| 插件 | 展示内容 | 源码 |
| --- | --- | --- |
| Host Tools Dashboard | 原生标签页、活动栏、设置、受控远端监控 | [`plugins/host-tools-dashboard`](plugins/host-tools-dashboard) |

示例用于展示真实的宿主能力和协议边界。第一方插件也必须先生成不可变发布包并完成平台验证，才能加入正式市场目录。

## 仓库结构

```text
registry/v1/index.json       应用读取的正式市场目录
schema/                      市场目录格式
plugins/                     OxideTerm 维护的一方插件
templates/process-plugin/    可独立使用的进程插件模板
templates/manifest-plugin/   不运行代码的清单插件模板
templates/wasm-plugin/       Rust WASM 插件模板
scripts/                     创建、校验和发布辅助脚本
docs/                        插件发布与目录维护说明
```

维护者在修改目录或一方插件时运行：

```bash
node scripts/validate-registry.mjs
node scripts/validate-plugins.mjs
```

## 许可证

`plugins/` 中的一方插件源码使用 [GNU GPL v3](LICENSE)；`templates/` 中的三套模板使用各自附带的 MIT 许可证。第三方插件使用作者仓库声明的许可证。
