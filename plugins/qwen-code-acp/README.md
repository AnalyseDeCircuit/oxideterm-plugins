# Qwen Code ACP 启动插件

复用用户已安装的 Qwen Code，通过 `qwen --acp` 接入聊天。插件只包含启动器，不下载代理本体或模型。

先安装官方 Qwen Code CLI，并完成登录或配置模型接口。使用 npm 安装方式时，当前官方包要求 Node.js 22 或更新版本；原生独立安装包不需要外部 Node.js。插件不默认开启实验功能。 [官方安装说明](https://qwenlm.github.io/qwen-code-docs/en/users/overview/)。[ACP 入口依据](https://github.com/agentclientprotocol/registry/blob/main/qwen-code/agent.json)。

安装并启用插件后，OxideTerm 自动创建代理配置，在聊天模型选择器选择 Qwen Code 即可。无需填写启动命令；工作目录、额外参数和环境变量为可选配置。

默认从 PATH 发现 `qwen`，也检查用户的 `.local/bin` 目录。程序在其他位置时，在插件参数列表开头依次填写 `--command` 和完整程序路径，每个参数独立一行；其余参数原样传给官方程序。

Windows 默认发现原生 `qwen.exe` 或 npm 安装的 `qwen.cmd`。npm 入口通过本机 Node.js 直接执行 `@qwen-code/qwen-code` 在包清单中声明的程序，不执行命令脚本。

Copilot 和 Qwen 的 npm 安装支持全局命令目录及 `node_modules/.bin` 目录。Node.js 必须在 PATH 中，或与命令入口位于同一目录。也可将完整 JavaScript 入口路径作为 `--command` 的值，由本机 Node.js 执行。

需要 OxideTerm 2.2.2 或更新版本。插件与官方 CLI 独立更新；官方程序、登录和模型配置由用户维护。启动器不调用 Shell，也不会使用 npx 自动下载程序。Unix 直接替换启动器进程，Windows 使用进程作业；停止代理时清理子进程树。

```sh
node scripts/build-acp-agent.mjs qwen-code-acp
node scripts/verify-acp-agent.mjs qwen-code-acp
```

六平台流水线验证安装包身份、准确参数、标准输入输出、工作目录、环境变量和进程清理。测试程序验证启动行为；官方代理的登录和模型对话需要另行验证。GPL-3.0-only 适用于本插件的启动器，官方代理不包含在安装包中。
