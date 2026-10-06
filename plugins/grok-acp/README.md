# Grok Build ACP 启动插件

复用用户已安装的 xAI 官方 Grok Build，通过 `grok agent stdio` 使用其原生 ACP 接口。插件只包含启动器，不下载或打包 Grok 本体。

先按 [官方安装说明](https://docs.x.ai/build/overview)安装并登录 Grok。在 OxideTerm 中启用插件，从聊天模型选择器选择 Grok Build；代理配置位于插件详情。

默认从 PATH 启动 `grok`（Windows 使用 `grok.exe`）。程序不在 PATH 中时，在插件参数列表的开头依次填入 `--command` 和完整可执行文件路径，每个参数独立一行。其后参数原样传给 Grok。

Windows 请使用官方原生 `grok.exe`；如果通过 npm 安装，指定包内的原生可执行文件，不使用 `grok.cmd`。插件不会自动调用 Shell 或 npx 下载程序。官方原生安装器的默认目录是 `~/.grok/bin`（Windows 为 `%USERPROFILE%\.grok\bin`）。

需要 OxideTerm 2.2.2 或更新版本。插件和 Grok 独立更新；插件版本 `0.1.0` 不表示 Grok 的版本。上游启动参数依据 [ACP 官方注册信息](https://github.com/agentclientprotocol/registry/blob/main/grok-build/agent.json)。

六平台构建与进程验证复用 ACP 插件流水线。Unix 直接替换启动器进程；Windows 使用随启动器退出关闭的进程作业，停止插件时终止代理进程树。登录和会话功能由 Grok 与应用现有 ACP 流程处理。

```sh
node scripts/build-acp-agent.mjs grok-acp
node scripts/verify-acp-agent.mjs grok-acp
```

验证使用本地测试程序，检查打包身份、完整参数、输入输出、工作目录、环境变量与子进程清理，不发送模型请求。GPL-3.0-only 仅用于本插件自己的启动代码。
