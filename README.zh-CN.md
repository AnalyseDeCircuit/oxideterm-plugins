<div align="center">

# ⚡ OxideTerm Plugins

**[OxideTerm](https://github.com/AnalyseDeCircuit/oxideterm) 官方插件市场、开发模板与一方扩展仓库。**

AI 编程 Agent (ACP) · RDP / VNC / Mosh · FIDO2 · 文件预览 · 43 种语言 · 4K 动态背景

[![Validate plugin registry](https://github.com/AnalyseDeCircuit/oxideterm-plugins/actions/workflows/validate.yml/badge.svg)](https://github.com/AnalyseDeCircuit/oxideterm-plugins/actions/workflows/validate.yml)
[![Marketplace](https://img.shields.io/badge/marketplace-69%20plugins-blue)](#插件市场一览)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

[**插件一览**](#插件市场一览) ·
[**安装插件**](#安装插件) ·
[**5 分钟开发**](#五分钟创建插件) ·
[**申请上架**](#发布到插件市场) ·
[**插件开发文档**](https://github.com/AnalyseDeCircuit/oxideterm/blob/main/docs/user-guide/zh-Hans/plugin-development.md)

[English](README.md) | **简体中文**

<br>

<img src="https://raw.githubusercontent.com/AnalyseDeCircuit/oxideterm/main/docs/screenshots/plugin-manager.png" alt="OxideTerm 插件管理器" width="900">

</div>

---

## 安装插件

在 OxideTerm 中打开 **插件管理器 → 插件市场** 即可浏览与安装。

应用会自动匹配当前操作系统、CPU 架构与主程序版本，校验安装包 SHA-256 与插件身份，并在启用前清晰展示插件申请的权限。

> [!NOTE]
> 市场收录不等同于完整安全审计。Process 形态的插件会以当前系统用户身份运行，启用第三方插件前请确认发布者与权限声明可信。

---

## 插件市场一览

### AI 编程 Agent（ACP）

把你本地已经装好的 CLI 编程 Agent 直接接入 OxideTerm 原生 ACP 对话工作区，复用现有登录状态与配置：

| 插件 | 说明 | 源码 |
| --- | --- | --- |
| **Claude Code** | 通过 ACP 接入本地 Claude Code CLI | [`plugins/claude-code-acp`](plugins/claude-code-acp) |
| **Codex** | 通过 ACP 接入本地 Codex CLI | [`plugins/codex-acp`](plugins/codex-acp) |
| **Cursor** | 通过 ACP 启动本地 Cursor Agent CLI | [`plugins/cursor-acp`](plugins/cursor-acp) |
| **GitHub Copilot CLI** | 通过 ACP 启动官方 GitHub Copilot CLI | [`plugins/copilot-acp`](plugins/copilot-acp) |
| **OpenCode** | 通过 ACP 启动已安装的 OpenCode CLI | [`plugins/opencode-acp`](plugins/opencode-acp) |
| **Antigravity** | 在 OxideTerm 中接入 Antigravity ACP Agent | [`plugins/antigravity-acp`](plugins/antigravity-acp) |
| **Grok Build** | 通过 ACP 接入 Grok Build | [`plugins/grok-acp`](plugins/grok-acp) |
| **Qwen Code** | 通过 ACP 启动官方 Qwen Code CLI | [`plugins/qwen-code-acp`](plugins/qwen-code-acp) |
| **Kimi CLI** | 通过 ACP 启动 Kimi CLI，复用已有登录状态 | [`plugins/kimi-acp`](plugins/kimi-acp) |

### 协议与硬件安全

| 插件 | 说明 | 源码 |
| --- | --- | --- |
| **RDP** | 使用 OxideTerm 原生桌面视图、音频与剪贴板连接 RDP 远程桌面 | [`plugins/rdp`](plugins/rdp) |
| **VNC** | 使用原生桌面视图与剪贴板支持连接 VNC | [`plugins/vnc`](plugins/vnc) |
| **Mosh** | 支持网络切换漫游的 Mosh 原生终端连接 | [`plugins/mosh`](plugins/mosh) |
| **FIDO Security Key** | 使用 `ed25519-sk` 与 `ecdsa-sk` 硬件安全密钥进行 SSH 认证 | [`plugins/fido2`](plugins/fido2) |
| **MQTT Workbench** | 在终端旁订阅、检查与发布 MQTT 消息 | [`plugins/mqtt`](plugins/mqtt) |

### 文件与数据预览

| 插件 | 说明 | 源码 |
| --- | --- | --- |
| **PDF Preview** | 本地文件与 SFTP 原生 PDF 预览，支持翻页与缩放 | [`plugins/pdf-preview`](plugins/pdf-preview) |
| **SQLite Preview** | 只读浏览 SQLite 数据表与分页数据 | [`plugins/sqlite-preview`](plugins/sqlite-preview) |
| **Certificate Viewer** | 检查 PEM / DER 证书链、有效期、域名、用途与指纹 | [`plugins/certificate-preview`](plugins/certificate-preview) |
| **Binary Inspector** | 解析 ELF、Mach-O、PE 元信息、节区、SHA-256 与十六进制预览 | [`plugins/binary-preview`](plugins/binary-preview) |

### 运维与效率工具

| 插件 | 说明 | 源码 |
| --- | --- | --- |
| **Workspace Dashboard** | 汇总最近工作、活动任务、待处理项与常用固定入口 | [`plugins/host-tools-dashboard`](plugins/host-tools-dashboard) |
| **Tailscale Hosts** | 发现本地 Tailscale 设备并一键填入原生连接表单 | [`plugins/tailscale-hosts`](plugins/tailscale-hosts) |
| **Ansible Inventory** | 从本地 Ansible 主机清单发现并导入 SSH 目标 | [`plugins/ansible-inventory`](plugins/ansible-inventory) |
| **小工具箱（Toolbox）** | 本地编解码、JSON 格式化、时间转换、文本整理、摘要与随机生成 | [`plugins/toolbox`](plugins/toolbox) |

### 4K 动态背景

专为 OxideTerm 原生窗口打造的原创 4K 循环动态背景：

- [**Dawn Mist**](plugins/background-dawn-mist) — 暖白与青绿层次
- [**Desert Gold**](plugins/background-desert-gold) — 沙色与流金光影
- [**Night Flow**](plugins/background-night-flow) — 深蓝与暗紫夜幕

### 语言高亮支持（43 种语言）

为 OxideTerm 内置编辑器按需安装 Tree-sitter 语法高亮与代码折叠支持。构建配方与发布流程见[语言插件说明](docs/language-plugins.md)。

<details>
<summary><b>展开查看全部 43 个语言插件</b></summary>

<br>

[AWK](plugins/language-awk) · [C](plugins/language-c) · [C#](plugins/language-c-sharp) · [C++](plugins/language-cpp) · [Clojure / ClojureScript](plugins/language-clojure) · [Common Lisp](plugins/language-commonlisp) · [CSS](plugins/language-css) · [Dart](plugins/language-dart) · [DTD](plugins/language-dtd) · [Elixir](plugins/language-elixir) · [Erlang](plugins/language-erlang) · [Go](plugins/language-go) · [Groovy](plugins/language-groovy) · [HTML](plugins/language-html) · [INI](plugins/language-ini) · [Java](plugins/language-java) · [JavaScript](plugins/language-javascript) · [jq](plugins/language-jq) · [Julia](plugins/language-julia) · [Justfile](plugins/language-just) · [Kotlin](plugins/language-kotlin) · [Nginx](plugins/language-nginx) · [Nix](plugins/language-nix) · [Objective-C](plugins/language-objc) · [OCaml](plugins/language-ocaml) · [OCaml Interface](plugins/language-ocaml-interface) · [Perl](plugins/language-perl) · [PHP](plugins/language-php) · [Protobuf](plugins/language-proto) · [R](plugins/language-r) · [Ruby](plugins/language-ruby) · [Rust](plugins/language-rust) · [Scala](plugins/language-scala) · [Slint](plugins/language-slint) · [Svelte](plugins/language-svelte) · [Swift](plugins/language-swift) · [Terraform / HCL](plugins/language-hcl) · [TSX](plugins/language-tsx) · [TypeScript](plugins/language-typescript) · [Typst](plugins/language-typst) · [Vue](plugins/language-vue) · [XML](plugins/language-xml) · [Zig](plugins/language-zig)

</details>

### 社区插件

| 插件 | 作者 | 说明 |
| --- | --- | --- |
| [**MicroCon Helper**](https://github.com/allegrox/microcon-helper) | `xiaox` | 配置 MicroCon 串口桥接并监控运行状态 |

---

## 开发你的插件

OxideTerm 插件界面由宿主原生渲染——主题、焦点、权限与敏感数据边界统一由 OxideTerm 负责，插件只需通过清单与类型化协议声明能力与交互。

| 形态 | 适用场景 | 模板 |
| --- | --- | --- |
| **Manifest-only** | 主题、语法、设置项等无需运行代码的静态扩展 | [`templates/manifest-plugin`](templates/manifest-plugin) |
| **Process** | 原生交互标签页/侧边栏、外部 CLI 桥接与完整业务流（JSON Lines 协议） | [`templates/process-plugin`](templates/process-plugin) |
| **WASM** | 在宿主 WASI 沙箱中运行的可移植逻辑 | [`templates/wasm-plugin`](templates/wasm-plugin) |

### 五分钟创建插件

需要 Git 与 Node.js 22 或更新版本（开发 WASM 插件还需 Rust 与 `wasm32-wasip1` target）。

```bash
git clone https://github.com/AnalyseDeCircuit/oxideterm-plugins.git
cd oxideterm-plugins
npm ci --ignore-scripts

node scripts/create-plugin.mjs ../my-oxideterm-plugin \
  --type process \
  --id com.example.my-plugin \
  --name "My Plugin" \
  --author "Your Name"

cd ../my-oxideterm-plugin
npm run check
```

将 `--type process` 替换为 `manifest` 或 `wasm` 即可切换模板。打开 [`plugin.json`](templates/process-plugin/plugin.json) 声明权限与界面贡献，在 [`bin/plugin.js`](templates/process-plugin/bin/plugin.js) 中编写逻辑。

本地打包与校验：

```bash
# macOS / Linux
npm run check && npm run package:unix

# Windows (PowerShell)
npm run check; npm run package:windows
```

三套模板均自带双语说明、校验脚本、打包命令、MIT 许可证与基于 tag 触发的 GitHub Release 工作流。完整宿主 API 与原生组件用法请见[插件开发文档](https://github.com/AnalyseDeCircuit/oxideterm/blob/main/docs/user-guide/zh-Hans/plugin-development.md)。

---

## 发布到插件市场

插件源码与 Release 安装包保留在作者自己的仓库中。本仓库通过 Issue 审核收录，不直接接受 Pull Request：

1. 更新 `plugin.json` 版本号并推送 `v<version>` 标签；
2. 等待模板工作流生成不可变的 GitHub Release 安装包；
3. 在声明支持的各个平台上完成实际安装验证；
4. 提交 [**Plugin listing request**](https://github.com/AnalyseDeCircuit/oxideterm-plugins/issues/new?template=plugin-submission.yml)，附上版本、平台、SHA-256 摘要、权限与更新说明。

若仅调整名称、描述、主页或标签，无需新发版本号，可在 Issue 表单中选择“仅更新展示信息”。完整规范与自动发布命令见[插件发布与更新指南](docs/PUBLISHING.md)。

---

<details>
<summary><b>仓库结构与维护者校验</b></summary>

```text
plugins/                   OxideTerm 维护的一方插件
templates/                 三套开发模板（process / manifest / wasm）
registry/plugins/<id>/     分插件维护的展示信息、版本和兼容记录
registry/categories.json   市场分类定义
registry/v2/               自动生成的 v2 索引与独立版本历史
registry/v1/               冻结的旧版 v1 目录（只读保留）
schema/                    市场目录校验 Schema
scripts/                   脚手架、校验与发布辅助脚本
docs/                      插件发布与语言插件构建说明
```

修改市场目录或一方插件后运行：

```bash
npm ci --ignore-scripts
npm test
npm run check
```

</details>

<details>
<summary><b>v1 市场目录兼容说明</b></summary>

旧版 `registry/v1/index.json` 已冻结，原地址与历史安装包继续保留以维持旧客户端可用；所有新插件、版本更新与兼容修复仅发布到 `registry/v2/`。请升级到支持 v2 目录的 OxideTerm 版本以获取最新插件和更新。

</details>

---

## 许可证

- `plugins/language-*/` 中的语言插件采用各目录附带的 **Apache-2.0** 许可证（保留上游 Tree-sitter 语法的许可证与版权声明）。
- `plugins/` 中的其他一方插件源码采用 [**GNU GPL v3**](LICENSE) 许可证。
- `templates/` 中的三套开发模板采用各自附带的 **MIT** 许可证。
- 第三方社区插件遵循其各自仓库声明的许可证。
