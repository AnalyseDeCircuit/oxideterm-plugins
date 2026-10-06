# Antigravity ACP 启动插件

复用用户已安装的 Google 官方 Antigravity ACP Server。插件只包含启动器，不下载、复制或分发 Google 程序。

需要的是官方 `agy_acp_server` 程序；普通 `agy` 命令行程序不是这个 ACP 服务。官方服务器分发信息可在 [ACP 注册表](https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json)查看。

默认从 PATH 查找 `agy_acp_server.par`（Windows 使用 `agy_acp_server.exe`）。其他安装位置可在插件参数列表的开头依次填写 `--command` 和完整服务器路径。Linux 自动带上官方的 `--uid=` 参数。

启用插件后，从聊天模型选择器选择 Antigravity。登录由官方服务器和应用现有的 ACP 认证提示完成。Google 程序继续遵循其原有条款；本插件仅对自己的启动代码使用 GPL-3.0-only。

需要支持 ACP 插件的 OxideTerm 2.2.2 或更新版本。进程退出与禁用清理方式和 OpenCode 启动插件一致。

```sh
node scripts/build-acp-agent.mjs antigravity-acp
node scripts/verify-acp-agent.mjs antigravity-acp
```
