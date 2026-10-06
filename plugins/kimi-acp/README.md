# Kimi CLI ACP 启动插件

复用用户已安装的 Kimi CLI，通过 `kimi acp` 接入聊天。插件只包含启动器，不下载代理本体或模型。

先安装官方 Kimi CLI，并在终端完成登录。ACP 会复用 CLI 已有的登录状态，插件不读取或复制登录凭据。 [官方安装说明](https://moonshotai.github.io/kimi-code/en/guides/getting-started.html)。[ACP 入口依据](https://moonshotai.github.io/kimi-code/en/guides/ides.html)。

安装并启用插件后，OxideTerm 自动创建代理配置，在聊天模型选择器选择 Kimi CLI 即可。无需填写启动命令；工作目录、额外参数和环境变量为可选配置。

默认从 PATH 发现 `kimi`，也检查用户的 `.local/bin` 目录。程序在其他位置时，在插件参数列表开头依次填写 `--command` 和完整程序路径，每个参数独立一行；其余参数原样传给官方程序。

Windows 使用官方原生 `kimi.exe` 或 Python 工具安装器生成的可执行入口。Unix Python 脚本入口需要其指定的解释器仍然存在；CLI 环境损坏时，请先修复或重新安装官方 CLI。

需要 OxideTerm 2.2.2 或更新版本。插件与官方 CLI 独立更新；官方程序、登录和模型配置由用户维护。启动器不调用 Shell，也不会使用 npx 自动下载程序。Unix 直接替换启动器进程，Windows 使用进程作业；停止代理时清理子进程树。

```sh
node scripts/build-acp-agent.mjs kimi-acp
node scripts/verify-acp-agent.mjs kimi-acp
```

六平台流水线验证安装包身份、准确参数、标准输入输出、工作目录、环境变量和进程清理。测试程序验证启动行为；官方代理的登录和模型对话需要另行验证。GPL-3.0-only 适用于本插件的启动器，官方代理不包含在安装包中。
