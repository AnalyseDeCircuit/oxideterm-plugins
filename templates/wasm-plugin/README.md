# OxideTerm WASM 插件模板

**简体中文** | [English](README.en.md)

这个模板使用 Rust 构建可移植的 OxideTerm WASM 插件。它实现 OxideTerm WASM Guest ABI v1，注册一个宿主渲染的标签页，并在点击按钮后更新状态。

WASM 模块运行在 OxideTerm 管理的 WASI Preview 1 运行时中，不会像 Process 插件一样启动不受沙箱约束的本地进程。

## 开始开发

需要 Node.js 18、Rust 和 `wasm32-wasip1` target：

```bash
rustup target add wasm32-wasip1
node scripts/create-plugin.mjs ../my-wasm-plugin \
  --type wasm \
  --id com.example.my-wasm-plugin \
  --name "My WASM Plugin" \
  --author "Your Name"
cd ../my-wasm-plugin
npm run check
```

脚手架会更新 `plugin.json`。`build.rs` 在编译时读取清单 ID，因此 Rust 源码不需要维护第二份插件身份。

## 模板结构

```text
plugin.json                 插件身份、WASM 入口、权限和标签页
Cargo.toml                  Rust cdylib 工程
build.rs                    把清单 ID 传给 WASM 编译
src/lib.rs                  ABI 导出、请求处理和原生界面数据
scripts/check.mjs           清单与 Cargo 版本校验
scripts/package.sh          Unix 构建与打包
scripts/package.ps1         Windows 构建与打包
.github/workflows/release.yml  标签发布工作流
```

`src/lib.rs` 已实现宿主要求的 `_start`、内存分配、命令、事件和出站消息导出。修改 `registration_message()` 设计界面，修改命令和事件处理函数实现行为。

标准 ABI 使用 JSON 值，但不要自行改变指针与长度的打包方式。完整契约见 [OxideTerm 插件开发文档](https://github.com/AnalyseDeCircuit/oxideterm/blob/main/docs/user-guide/zh-Hans/plugin-development.md#协议接口)。

## 本地构建与调试

```bash
npm run check
npm run package:unix
```

Windows：

```powershell
npm run check
npm run package:windows
```

打包脚本会：

1. 校验清单和 Cargo 版本；
2. 检查 Rust 格式；
3. 以 release 模式编译 `wasm32-wasip1`；
4. 复制生成的 `plugin.wasm`；
5. 创建 ZIP 并输出 SHA-256 与准确字节数。

然后运行 `oxideterm paths --json`，把包含 `plugin.json` 和 `plugin.wasm` 的目录复制到 `<config-dir>/plugins/<plugin-id>`，重启 OxideTerm，在插件管理器中启用并批准 `ui.write`。

## 发布

WASM 包不包含原生平台二进制，可以在实际验证后使用 `any` target。更新时必须同时提升 `plugin.json` 和 `Cargo.toml` 的版本。

推送与版本匹配的标签即可构建 Release：

```bash
git tag v0.1.0
git push origin v0.1.0
```

工作流会安装 WASM target、编译模块、创建安装包并发布 GitHub Release。随后按照 [插件发布与更新指南](https://github.com/AnalyseDeCircuit/oxideterm-plugins/blob/main/docs/PUBLISHING.md) 申请市场收录。
