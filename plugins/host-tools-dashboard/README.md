# Workspace Dashboard

A workspace overview for OxideTerm, continuing the existing Host Tools Dashboard
plugin identity. Version 0.4.2 requires the host APIs introduced after 2.2.0.
It may be listed before that host release, while older clients retain the published
0.3.0 package and download record.

## What it shows

- **Continue work:** saved SSH connections ordered by last use and currently open
  IDE projects. Connections can be pinned.
- **In progress:** open terminal and remote desktop tabs, recording tasks, active
  or paused transfers, and active port forwards.
- **Needs attention:** disconnected nodes, failed transfers, cloud-sync conflicts
  or errors, and plugin diagnostics. Links open the relevant built-in page.
- **Shortcuts:** pinned connections and built-in pages, stored through the host's
  plugin-scoped storage. Click a page name to add or remove its shortcut.

The dashboard opens in a tab using the shared OxideTerm page header and native
controls. Its activity-bar icon opens or focuses the dashboard tab. It does not
register a sidebar panel; the Refresh button remains inside the dashboard.
All UI copy has 11 locale bundles.

## Data and navigation

The host owns sessions, transfers, forwarding, recordings, and diagnostic state.
The plugin reads their snapshots and requests normal host navigation. It does not
run remote commands, collect performance metrics, or own connections. The original
Host Tools monitor and OS selector have been removed.

The overview refreshes on activation and existing layout, session-state, and
transfer events. The Refresh button samples other changes, including recording
elapsed time and cloud-sync state; there is no periodic polling task. Partial
failures are visible and do not erase successfully loaded sections.

Recent project history, closed-workspace restoration, and persistent project
shortcuts are not implemented. Current projects link to live IDE tabs. The built-in
dashboard remains available. Recent connections currently use the host's saved-SSH
summary API; other transport histories are not returned by that API.

## Install and permissions

Node.js must be on PATH. Packages cover x64/ARM64 macOS, Linux, and Windows;
Windows packages use a dedicated `bin/plugin.cmd` launcher. Install the complete plugin directory, including
`locales/`, using a compatible OxideTerm release. The process entry must be
executable on macOS and Linux. A source checkout still reporting 2.2.0 is correctly
rejected by the release manifest; do not weaken the range for publication.
Activation also checks the host API catalog before registering views or reading
workspace data. A 2.2.0 host retaining the package after a downgrade receives an
upgrade message instead of calls to missing workspace APIs.

The plugin requests:

- `ui.write` for its views and workspace navigation;
- `sessions.read` for workspace labels, recording states, and plugin issue identities;
- `connections.control` to open a saved connection through the normal host flow;
- `transfers.read` for transfer names, progress, state, and owning nodes;
- `plugin.settings.write` to save pinned connection IDs and page names.

It no longer requests `host_tools.custom.execute`. New permissions must be reviewed
through the normal plugin-manager approval flow. Workspace summaries exclude terminal
contents, paths, and diagnostic text. The existing transfer API also returns paths
and errors; the overview displays names and progress without storing those records.

## Development checks

Run `npm test` and `npm run check` from the marketplace repository. The focused
process-protocol test covers ordering, navigation, one-way storage writes, event
refresh, partial failures, and locale key parity. Host-side checks cover destination
validation and capability gates. Release preparation uses the repository's
`scripts/release-plugin.mjs prepare` workflow; publishing remains a separate step.
