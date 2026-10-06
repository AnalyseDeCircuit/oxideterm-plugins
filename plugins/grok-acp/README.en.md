# Grok Build ACP launcher

Reuse the installed official xAI Grok Build CLI through `grok agent stdio`. The plugin contains only a launcher and never downloads or bundles Grok.

Install and authenticate Grok using its [official documentation](https://docs.x.ai/build/overview). Enable this plugin, select Grok Build in chat, and configure the agent in installed plugin details.

The default command is `grok` (`grok.exe` on Windows). To select another installation, begin the plugin argument list with `--command` and the full executable path, one argument per line. Remaining arguments retain their original boundaries and are passed to Grok.

On Windows, use the official native `grok.exe`. For npm installations, select the package's native executable instead of `grok.cmd`. The launcher never invokes a shell or downloads programs through npx. The official native installer defaults to `~/.grok/bin` (`%USERPROFILE%\.grok\bin` on Windows).

Requires OxideTerm 2.2.2 or later. Grok and the plugin update independently; this plugin's `0.1.0` version does not identify the installed Grok version. The launch arguments follow the [official ACP registry entry](https://github.com/agentclientprotocol/registry/blob/main/grok-build/agent.json).

The ACP workflow builds and verifies six native platforms. On Unix the launcher replaces itself with Grok. On Windows an exit-owned process job retires the agent tree when the host stops the launcher. Authentication and sessions use the existing host ACP flow and Grok's implementation.

```sh
node scripts/build-acp-agent.mjs grok-acp
node scripts/verify-acp-agent.mjs grok-acp
```

Verification uses a local fixture to check package identity, exact arguments, streams, cwd, environment and descendant cleanup, without model requests. GPL-3.0-only covers this plugin's own launcher code.
