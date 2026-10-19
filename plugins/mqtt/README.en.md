# MQTT Workbench

[简体中文](README.md)

Subscribe, inspect and publish MQTT messages alongside serial or SSH terminals in OxideTerm.

## Use

1. Install the ZIP for your platform and approve the process and credential-access permissions.
2. Create an **MQTT** connection in the connection manager. An empty port uses 1883 for TCP or 8883 for TLS.
3. Open the connection, choose **Subscriptions**, enter a filter such as `devices/+/state`, select QoS and subscribe.
4. Return to **Messages**. Select a row to inspect its payload or copy it into the publisher before sending.
5. Use the host's normal split controls to place the workbench beside a serial terminal. Switching pages keeps reception active; closing the connection page disconnects.

## Behavior

MQTT 3.1.1 over TCP or verified TLS, username/password authentication, QoS 0/1/2, and retained messages are supported. TLS uses system roots by default; an optional PEM CA supports private brokers without disabling certificate or hostname verification.

Network failures retry with backoff and restore current subscriptions. Authentication refusal and TLS failures wait for an explicit retry. Empty client IDs generate independent identities; persistent sessions require a fixed ID. Simultaneous clients must use different IDs.

Payloads support text, JSON and hex. QoS 0 shows sent; QoS 1/2 waits for the protocol acknowledgement. Pause freezes display, not reception. Retention is bounded to 1,000 messages / 8 MiB, with the latest 200 matches shown and visible eviction counts. Payloads are limited to 64 KiB, topic/filter inputs to 1,024 bytes, and subscriptions to 32 filters.

Messages stay in session memory, never in logs or cloud sync. Subscriptions, history and drafts do not survive closing the connection. The host owns saved profiles, protected credentials, cloud sync and encrypted .oxide transfer; credential transfer follows host settings.

MQTT 5, WebSocket, mutual TLS, automatic publishing and broker administration are outside this first version.

**Requires an OxideTerm version newer than 2.2.4 with plugin connections and live updates.** Released 2.2.4 is incompatible. A development host still reporting 2.2.4 will also be blocked; keep the published compatibility range intact.

## Build and verify

Use Rust and Node.js 22+. Tests use a local Aedes broker and OpenSSL, not a public server.

```sh
npm ci --ignore-scripts
npm run check
npm test
node scripts/check-host.mjs /path/to/OxideTerm
npm run package
node scripts/verify-package.mjs
```

Packages in `dist/` contain a native executable, manifest, documentation and licenses. Node.js is not required at runtime. Build and verify each platform natively. Packaging reuses the marketplace preparation workflow without publishing a Release or changing the catalog.

The `mqtt-v<version>` tag triggers native builds for macOS, Linux and Windows on x64 and ARM64. Each runner executes unit tests and runs the extracted package against a local broker, including TLS checks. All six must pass before the shared release workflow publishes the packages and the catalog publisher registers them.

The MQTT implementation uses rumqttc. Host communication, session state and UI are independently implemented here. Package dependency licenses are included in `THIRD_PARTY_NOTICES.txt`.
