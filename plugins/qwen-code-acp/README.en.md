# Qwen Code ACP launcher

Reuse the installed Qwen Code through `qwen --acp` in OxideTerm chat. This plugin packages only the launcher; it does not download the agent or any model.

Install the official Qwen Code CLI, then authenticate or configure your model provider. The current npm package requires Node.js 22 or later; native standalone installations do not require an external Node.js. This plugin does not enable experimental features by default. See the [official installation guide](https://qwenlm.github.io/qwen-code-docs/en/users/overview/) and [ACP entry documentation](https://github.com/agentclientprotocol/registry/blob/main/qwen-code/agent.json).

Installing and enabling the plugin creates the agent configuration automatically. Select Qwen Code in the chat model selector; no launch command is required. Working directory, additional arguments, and environment variables are optional.

The launcher discovers `qwen` on PATH and also checks the user's `.local/bin` directory. For a custom installation, put `--command` and the complete executable path at the beginning of the plugin argument list, one argument per line. Remaining arguments are passed unchanged.

On Windows, the launcher discovers the native `qwen.exe` or the npm `qwen.cmd` entry. The npm entry is started directly with local Node.js using the program declared in the installed `@qwen-code/qwen-code` package; wrappers are never interpreted.

Copilot and Qwen npm installations support global command directories and `node_modules/.bin` entries. Node.js must be on PATH or next to the command entry. An explicit JavaScript entry can also be passed through `--command` and is executed with local Node.js.

Requires OxideTerm 2.2.2 or later. Plugin and official CLI versions advance independently. Users manage the official program, authentication, and model configuration. The launcher never invokes a shell or downloads programs with npx. Unix replaces the launcher process; Windows uses a process job that retires descendants when the host stops the agent.

```sh
node scripts/build-acp-agent.mjs qwen-code-acp
node scripts/verify-acp-agent.mjs qwen-code-acp
```

The six-platform workflow verifies package identity, exact arguments, streams, working directory, environment, and process cleanup. The fixture verifies launch behavior; authenticated model chat with the official agent requires separate validation. GPL-3.0-only applies to the plugin launcher; the official agent is not included.
