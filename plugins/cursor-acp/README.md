# Cursor ACP 启动插件

复用用户安装的官方 Cursor CLI，启动 `cursor-agent acp`。插件只包含启动器，不下载或打包 Cursor 的运行环境。

先按 [官方安装说明](https://cursor.com/docs/cli/installation)安装并登录 Cursor。启用插件后，从应用聊天模型选择器选择 Cursor；参数、工作目录与能力授权仍在插件详情配置。

启动器先查找 PATH 中的 `cursor-agent`，再查找官方默认安装位置：macOS/Linux 的 `~/.local/bin/cursor-agent`，Windows 的 `%LOCALAPPDATA%\cursor-agent`。自定义位置可在参数列表开头依次填入 `--command` 和完整入口路径，每个参数独立一行。

Windows 可指定官方 `cursor-agent.cmd` 或 `cursor-agent.ps1` 的位置。启动器依据官方安装目录找到完整版本中的 `node.exe` 和 `index.js`，直接调用它们，不执行命令脚本，也不通过 Shell 拼接参数。更新 Cursor 后，下次启动会重新选择已安装的完整版本。

需要包含 Cursor 交互支持的 OxideTerm 2.2.2 或更新版本。标准登录、模型配置、回复、权限、取消与会话恢复使用现有 ACP 流程；`cursor/ask_question` 支持多题、单选与多选，明确提交后继续；`cursor/create_plan` 展示计划并要求明确批准或拒绝。停止任务会取消待处理请求，问题和计划内容只保留在当前运行状态中。

协议依据 [官方 ACP 文档](https://cursor.com/docs/cli/acp)。插件与 Cursor 独立更新，GPL-3.0-only 仅适用于自己的启动代码。

```sh
node scripts/build-acp-agent.mjs cursor-acp
node scripts/verify-acp-agent.mjs cursor-acp
```

六平台流水线验证最终 ZIP、参数传递、工作目录、环境和子进程清理。宿主协议测试验证问题答案、计划批准、拒绝和取消；完整账号登录与聊天需安装官方 Cursor 后验证。
