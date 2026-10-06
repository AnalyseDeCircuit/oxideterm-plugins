# GitHub Copilot CLI ACP launcher

Reuse the installed GitHub Copilot CLI through `copilot --acp --stdio` in OxideTerm chat. This plugin packages only the launcher; it does not download the agent or any model.

Install the official Copilot CLI, then authenticate in a terminal or configure its supported bring-your-own-provider mode. GitHub-managed access requires the appropriate Copilot entitlement and organization policy. ACP is currently in public preview. See the [official installation guide](https://github.com/github/copilot-cli#installation) and [ACP entry documentation](https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server).

Installing and enabling the plugin creates the agent configuration automatically. Select GitHub Copilot CLI in the chat model selector; no launch command is required. Working directory, additional arguments, and environment variables are optional.

The launcher discovers `copilot` on PATH and also checks the user's `.local/bin` directory. For a custom installation, put `--command` and the complete executable path at the beginning of the plugin argument list, one argument per line. Remaining arguments are passed unchanged.

Windows supports the native `copilot.exe` from WinGet and the npm `copilot.cmd` entry. The npm entry is started directly with local Node.js using the program declared in the installed `@github/copilot` package; wrappers are never interpreted.

Copilot and Qwen npm installations support global command directories and `node_modules/.bin` entries. Node.js must be on PATH or next to the command entry. An explicit JavaScript entry can also be passed through `--command` and is executed with local Node.js.

Requires OxideTerm 2.2.2 or later. Plugin and official CLI versions advance independently. Users manage the official program, authentication, and model configuration. The launcher never invokes a shell or downloads programs with npx. Unix replaces the launcher process; Windows uses a process job that retires descendants when the host stops the agent.

```sh
node scripts/build-acp-agent.mjs copilot-acp
node scripts/verify-acp-agent.mjs copilot-acp
```

The six-platform workflow verifies package identity, exact arguments, streams, working directory, environment, and process cleanup. The fixture verifies launch behavior; authenticated model chat with the official agent requires separate validation. GPL-3.0-only applies to the plugin launcher; the official agent is not included.
