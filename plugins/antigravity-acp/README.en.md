# Antigravity ACP launcher

Reuse the installed official Google Antigravity ACP Server. The plugin contains only a launcher; it never downloads, copies, or redistributes Google's software.

The required executable is the official ACP Server, not the ordinary `agy` CLI. See the [ACP registry entry](https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json) for official distributions.

The default command is `agy_acp_server.par` (`agy_acp_server.exe` on Windows). An alternative installation can be selected by beginning the argument list with `--command` and its full executable path. Linux retains the official `--uid=` argument.

Enable the plugin and select Antigravity in chat. Authentication remains with the official server and the host's existing ACP authentication prompt. Google's terms remain applicable to its software; GPL-3.0-only covers this launcher's own code.

Requires OxideTerm 2.2.2 or later with ACP plugin support. Process ownership follows the same Unix exec and Windows process-job rules as the OpenCode launcher.

```sh
node scripts/build-acp-agent.mjs antigravity-acp
node scripts/verify-acp-agent.mjs antigravity-acp
```
