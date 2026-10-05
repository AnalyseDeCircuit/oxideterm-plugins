# Claude Code 接入

将本机 Claude Code 命令行工具接入 OxideTerm 的智能体聊天界面。安装并启用插件后，可在智能体列表中选择 Claude Code；插件直接使用标准 ACP，与普通插件消息通道分开。

需要支持 ACP 插件的 OxideTerm 版本（>2.2.1），以及已安装、登录的 Claude Code 命令行工具。插件包包含 Rust 适配器，无需 Node.js；上游命令行工具的安装和登录仍由用户管理。

工作目录、环境配置和权限沿用应用的智能体设置。适配器选项可填写 `--command` 指定工具路径；`--arg` 为上游工具追加参数。插件禁用、卸载或更新时，应用会结束对应的活动会话；聊天记录保留。

六个平台分别构建、打包并验证：macOS、Linux、Windows 的 x64 和 ARM64。源码沿用 OxideTerm 的 GPL-3.0-only 许可证，共享适配实现位于 `crates/oxideterm-acp-adapter`。

构建：`node scripts/build-acp-agent.mjs claude-code-acp`。
验证安装包：`node scripts/verify-acp-agent.mjs claude-code-acp`。
