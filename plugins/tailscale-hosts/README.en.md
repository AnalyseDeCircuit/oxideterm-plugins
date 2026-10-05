# Tailscale Hosts

Discover SSH hosts and review them in OxideTerm's native connection form. Authentication, connection creation, saving and session ownership remain in the host. This plugin registers one tab and no sidebar.

Requires Node.js 22+ and a running, signed-in Tailscale client. Packages cover x64/ARM64 macOS, Linux, and Windows. Windows packages include a dedicated launcher; Node.js must be on PATH. If Tailscale cannot be found, enter the full path to `tailscale.exe`.

## Usage

Open the plugin tab, enter the client command or full executable path, then choose **Discover hosts**. Search the results and choose **Configure connection**. Review the native form, set credentials and jump hosts, then connect or save.

Discovery executes `tailscale status --json`. It lists peers visible to the local client, online first, preferring a Tailscale IPv4 address and otherwise IPv6. It does not enumerate devices behind subnet routes. Online does not mean SSH is reachable. Connections use ordinary SSH authentication; this plugin does not implement the Tailscale SSH identity login flow.

Refresh does not modify saved connections. Discovery is bounded to 4 seconds, 8 MiB and 5000 hosts; results are paginated by 20. Failed refreshes discard stale results. Raw client output and diagnostics are never logged or persisted. A pipe-owned supervisor stops the client process group if the plugin is forcibly killed. Client locations remain in memory for the current plugin process.

## Build and test

From the marketplace repository root:

```sh
node scripts/build-host-source.mjs tailscale-hosts --package
node --test scripts/host-sources.test.mjs
```

Shared UI/process code in `packages/host-sources/` is copied into each package. The packaged plugin is independent of the checkout. Source-specific parsing lives in `source.cjs`. All 11 interface languages are included.

Official packages require `>2.2.0` and the new `connections.openForm` API. For a locally compiled host still labeled 2.2.0, append `--local` to build a trial package. It still verifies API availability at activation and must not be listed in the catalog.

License: MIT.
