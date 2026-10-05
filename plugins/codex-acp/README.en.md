# Codex ACP integration

Connect the local Codex CLI to OxideTerm's agent chat. After installing and enabling the plugin, select Codex in the agent list. The executable speaks standard ACP directly to the host.

Requires an ACP-plugin-capable OxideTerm release (>2.2.1) and an installed, authenticated Codex CLI. The package includes a native Rust adapter and does not require Node.js; installation and authentication of the upstream CLI remain user-managed.

Working directory, environment and permissions use the application's agent settings. Adapter arguments accept `--command` for the CLI path and `--arg` for additional upstream arguments. Disabling, uninstalling or updating the plugin ends its active sessions and preserves chat history.

Native packages are built and verified for macOS, Linux and Windows, each on x64 and ARM64. The existing adapter code retains GPL-3.0-only. Shared implementation lives in `crates/oxideterm-acp-adapter`.

Build: `node scripts/build-acp-agent.mjs codex-acp`.
Verify: `node scripts/verify-acp-agent.mjs codex-acp`.
