# OpenCode ACP launcher

Reuse the installed official OpenCode CLI through its native ACP interface. The plugin contains only a small launcher and never downloads or bundles OpenCode.

Install and authenticate OpenCode using its [official documentation](https://opencode.ai/docs/). Enable the plugin, select OpenCode in the chat model selector, and configure it in installed plugin details.

The default executable is `opencode` (`opencode.exe` on Windows), launched with `acp`. To select another installation, begin the argument list with `--command` followed by its full executable path. Remaining arguments retain their original boundaries and are passed to OpenCode.

Requires OxideTerm 2.2.2 or later with ACP plugin support. On Unix the launcher replaces itself with the agent. On Windows an exit-owned process job terminates the agent tree when the host stops the launcher.

```sh
node scripts/build-acp-agent.mjs opencode-acp
node scripts/verify-acp-agent.mjs opencode-acp
```

The plugin and installed CLI update independently. Verification uses a local fixture without authentication or model requests.
