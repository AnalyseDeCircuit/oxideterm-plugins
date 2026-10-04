import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import test from "node:test";

const source = path.resolve(import.meta.dirname, "../plugins/host-tools-dashboard");

test("workspace overview routes real items, persists pins and preserves partial results", { timeout: 10000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oxideterm-dashboard-"));
  fs.cpSync(source, root, { recursive: true });
  const child = spawn(process.execPath, [path.join(root, "bin/host-tools-dashboard.js")]);
  t.after(() => { child.kill(); fs.rmSync(root, { recursive: true, force: true }); });
  const pending = new Map(), surfaces = new Map(), calls = [];
  let language = "en", stored = null, transfersFail = false;
  let apiCatalog = [{ namespace: "app", method: "getWorkspaceSummary" }, { namespace: "ui", method: "openWorkspace" }];
  const workspace = {
    tabs: [{ id: "42", title: "Build shell", kind: "terminal", recordings: [{ paused: false, elapsedSeconds: 12 }] }, { id: "43", title: "Compiler project", kind: "project", recordings: [] }, { id: "44", title: "FTP files", kind: "files", recordings: [], transferOwners: ["ftp:profile"] }],
    nodes: [{ id: "live", title: "Build machine", state: "active", forwards: 2 }, { id: "down", title: "Offline machine", state: "disconnected", forwards: 0 }],
    pluginIssues: [{ id: "broken", name: "Broken plugin" }],
  };
  const connections = [
    { id: "older", name: "Older connection", lastUsedAt: "2026-10-01T00:00:00Z" },
    { id: "unused", name: "Never used", lastUsedAt: null },
    { id: "newer", name: "Latest connection", lastUsedAt: "2026-10-04T00:00:00Z" },
  ];
  let transfers = [
    { id: "upload", name: "Source archive", nodeId: "live", state: "active", size: 100, transferred: 25 },
    { id: "failed", name: "Failed archive", nodeId: "down", state: "error", size: 200, transferred: 0 },
    { id: "done", name: "Completed archive", nodeId: "live", state: "completed", size: 100, transferred: 100 },
    { id: "ftp", name: "FTP archive", nodeId: "ftp:profile", state: "active", size: 100, transferred: 10 },
    { id: "orphan", name: "Closed target", nodeId: "deleted-node", state: "error", size: 100, transferred: 0 },
  ];
  const send = payload => child.stdin.write(JSON.stringify({ protocolVersion: 1, payload }) + "\n");
  createInterface({ input: child.stdout }).on("line", line => {
    const { payload } = JSON.parse(line);
    if (payload.type === "registerContribution") surfaces.set(payload.registration.kind, payload.registration.metadata.schema);
    if (payload.type === "callHostApi") {
      assert.equal(typeof payload.requestId, "string");
      calls.push(payload);
      let value;
      switch (payload.namespace + "." + payload.method) {
        case "app.getLocale": value = language; break;
        case "app.getApiCatalog": value = apiCatalog; break;
        case "storage.get": value = stored; break;
        case "storage.set": stored = payload.args.value; return;
        case "app.getWorkspaceSummary": value = workspace; break;
        case "connections.getSavedSummaries": value = connections; break;
        case "transfers.getAll":
          if (transfersFail) { send({ requestId: payload.requestId, result: { status: "error", error: { message: "private diagnostic" } } }); return; }
          value = transfers; break;
        case "cloudSync.getSummary": value = { conflict: true }; break;
        case "connections.connect": case "ui.openWorkspace": value = { queued: true }; break;
        default: throw new Error("Unexpected host API: " + payload.namespace + "." + payload.method);
      }
      send({ requestId: payload.requestId, result: { status: "ok", value } });
    } else if (pending.has(payload.requestId)) {
      pending.get(payload.requestId)(payload.result);
      pending.delete(payload.requestId);
    }
  });
  let requestId = 0;
  async function request(kind, expectedStatus = "ok") {
    const id = String(++requestId), result = new Promise(resolve => pending.set(id, resolve));
    send({ requestId: id, kind });
    const response = await result;
    assert.equal(response.status, expectedStatus);
    return response;
  }
  function controls(schema) {
    return [...(schema.controls ?? []), ...(schema.sections ?? []).flatMap(section => section.controls)]
      .flatMap(function flatten(control) { return [control, ...(control.children ?? []).flatMap(flatten)]; });
  }
  async function click(id) {
    const control = controls(surfaces.get("tab")).find(control => control.id === id);
    assert.ok(control, id);
    await request({ type: "sendEvent", event: { name: "ui.event", payload: { controlId: id, type: "click", value: control.value } } });
  }
  await request({ type: "activate" });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugin.json")));
  assert.deepEqual(Object.keys(manifest.contributes), ["tabs"]);
  assert.deepEqual(manifest.contributes.tabs.map(tab => tab.id), ["dashboard"]);
  assert.equal(surfaces.has("activity-bar-item"), false);
  assert.deepEqual(controls(surfaces.get("tab")).filter(control => control.kind === "stack" && control.label).map(control => control.id), ["continue", "shortcuts", "ongoing", "attention"]);
  assert.equal(surfaces.has("sidebar-panel"), false);
  const recentIds = controls(surfaces.get("tab")).filter(control => control.id?.startsWith("open-connection-")).map(control => control.value.id);
  assert.deepEqual(recentIds, ["newer", "older"]);
  const visible = JSON.stringify(surfaces.get("tab"));
  for (const label of ["Compiler project", "Build shell", "Source archive · 25%", "Failed archive", "Broken plugin", "Resolve sync conflict"]) assert.ok(visible.includes(label), label);
  assert.doesNotMatch(visible, /Never used|Completed archive/);
  await click("open-project-43");
  assert.deepEqual(calls.at(-1).args, { kind: "tab", id: "43" });
  await click("open-connection-newer");
  assert.equal(calls.at(-1).namespace + "." + calls.at(-1).method, "connections.connect");
  assert.deepEqual(calls.at(-1).args, { connectionId: "newer" });
  await click("open-transfer-upload");
  assert.deepEqual(calls.at(-1).args, { kind: "sftp", nodeId: "live" });
  await click("open-transfer-ftp");
  assert.deepEqual(calls.at(-1).args, { kind: "tab", id: "44" });
  assert.equal(controls(surfaces.get("tab")).find(control => control.id === "open-failed-transfer-orphan").disabled, true);
  await click("pin-connection-newer");
  assert.deepEqual(stored, [{ kind: "page", page: "sessions" }, { kind: "page", page: "files" }, { kind: "page", page: "localTerminal" }, { kind: "connection", id: "newer" }]);
  await click("pin-connection-newer");
  assert.deepEqual(stored.map(pin => pin.page), ["sessions", "files", "localTerminal"]);
  assert.equal(controls(surfaces.get("tab")).some(control => control.id?.startsWith("pin-page-")), false);
  await click("open-shortcut-0");
  assert.deepEqual(calls.at(-1).args, { kind: "page", page: "sessions" });
  await click("edit-shortcuts");
  await click("pin-page-plugins");
  assert.deepEqual(stored, [{ kind: "page", page: "sessions" }, { kind: "page", page: "files" }, { kind: "page", page: "localTerminal" }, { kind: "page", page: "plugins" }]);
  await click("edit-shortcuts");
  assert.equal(controls(surfaces.get("tab")).some(control => control.id?.startsWith("pin-page-")), false);
  await click("open-shortcut-3");
  assert.deepEqual(calls.at(-1).args, { kind: "page", page: "plugins" });
  transfers = [];
  await request({ type: "sendEvent", event: { name: "transfers.complete", payload: {} } });
  assert.doesNotMatch(JSON.stringify(surfaces.get("tab")), /Source archive|Failed archive/);
  transfersFail = true;
  await click("refresh");
  assert.equal(controls(surfaces.get("tab")).find(control => control.kind === "alert").label, "Some information could not be loaded");
  assert.match(JSON.stringify(surfaces.get("tab")), /Build shell/);
  assert.doesNotMatch(JSON.stringify(surfaces.get("tab")), /private diagnostic/);
  language = "zh-CN";
  await request({ type: "sendEvent", event: { name: "i18n.languageChanged", payload: {} } });
  assert.equal(surfaces.get("tab").title, "工作概览");
  surfaces.clear();
  calls.length = 0;
  apiCatalog = [{ namespace: "app", method: "getWorkspaceSummary" }];
  const blocked = await request({ type: "activate" }, "error");
  assert.equal(blocked.error.code, "host_upgrade_required");
  assert.equal(blocked.error.message, "请升级到支持工作概览的 OxideTerm 版本。");
  assert.deepEqual(calls.map(call => call.namespace + "." + call.method), ["app.getLocale", "app.getApiCatalog"]);
  assert.deepEqual([...surfaces.keys()], []);
  const files = fs.readdirSync(path.join(root, "locales"));
  const keys = Object.keys(JSON.parse(fs.readFileSync(path.join(root, "locales/en.json")))).sort();
  assert.deepEqual(files.map(file => file.replace(".json", "")).sort(), ["de", "en", "es-ES", "fr-FR", "it", "ja", "ko", "pt-BR", "vi", "zh-CN", "zh-TW"]);
  for (const file of files) assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(root, "locales", file)))).sort(), keys, file);
});
