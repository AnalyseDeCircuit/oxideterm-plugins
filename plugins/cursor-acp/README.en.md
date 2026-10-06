# Cursor ACP launcher

Reuse the installed official Cursor CLI through `cursor-agent acp`. This plugin contains only a launcher, without downloading or bundling Cursor's runtime.

Install and authenticate using the [official installation guide](https://cursor.com/docs/cli/installation). Enable the plugin, select Cursor in chat, and configure arguments, cwd and host permissions in plugin details.

The launcher discovers `cursor-agent` on PATH, then the official default location: `~/.local/bin/cursor-agent` on macOS/Linux or `%LOCALAPPDATA%\cursor-agent` on Windows. To select another installation, begin the argument list with `--command` and the full entry path, one argument per line.

On Windows, specify the official `cursor-agent.cmd` or `cursor-agent.ps1` path. The launcher locates `node.exe` and `index.js` in a complete installed version and runs them directly, without executing wrapper text or composing shell commands. Each launch discovers the installed version again, including after CLI updates.

Requires OxideTerm 2.2.2 or later with Cursor interaction support. Standard authentication, model configuration, streaming, permission checks, cancellation and session restoration use the host ACP flow. `cursor/ask_question` supports multiple questions, single/multiple selection and explicit submission. `cursor/create_plan` presents the plan for explicit approval or rejection. Stopping a turn cancels its pending interactions. Question and plan content remains transient.

See the [official ACP specification](https://cursor.com/docs/cli/acp). Cursor and this plugin update independently; GPL-3.0-only covers this launcher's own code.

```sh
node scripts/build-acp-agent.mjs cursor-acp
node scripts/verify-acp-agent.mjs cursor-acp
```

The six-platform workflow verifies packaged entries, arguments, cwd/env and process cleanup. Host protocol tests verify answers, plan acceptance/rejection and cancellation. Full account authentication and chat require a local official Cursor installation for validation.
