# OpenCode ACP 启动插件

复用用户已安装的官方 OpenCode CLI，使用其原生 ACP 接口。插件只包含小型启动器，不下载或打包 OpenCode 本体。

先按 [OpenCode 官方说明](https://opencode.ai/docs/)安装并登录。在 OxideTerm 中安装、启用插件，然后从聊天模型选择器选择 OpenCode。代理配置位于插件详情。

默认从 PATH 启动 `opencode acp`（Windows 使用 `opencode.exe`）。指定其他安装位置时，在插件的参数列表中先填 `--command`，再填完整可执行文件路径；每个参数独立一行，其后参数原样传给 OpenCode。

需要支持 ACP 插件的 OxideTerm 2.2.2 或更新版本。六平台构建、打包和进程验证复用 ACP 插件流水线。Linux/macOS 直接替换启动器进程；Windows 使用随启动器退出关闭的进程作业，主程序停止插件时同步终止代理进程树。

```sh
node scripts/build-acp-agent.mjs opencode-acp
node scripts/verify-acp-agent.mjs opencode-acp
```

插件与已安装 OpenCode 独立更新。协议测试使用本地测试程序，不登录账号或发送模型请求。
