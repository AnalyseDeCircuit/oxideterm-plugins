#!/usr/bin/env node

// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

"use strict";
const readline = require("node:readline");
const PLUGIN_ID = "com.oxideterm.examples.host-tools-dashboard";
const TAB_ID = "dashboard";
const pendingHostCalls = new Map();
let nextHostRequestId = 1;
let messages = require("../locales/en.json");
let refreshInProgress = false;
let refreshPending = false;
let pinned = [];
let data = {};
let failures = [];
let actionFailed = false;
let editingShortcuts = false;
const pages = ["sessions", "files", "plugins", "cloudSync", "notifications", "localTerminal"];
const pageIcons = { sessions: "server", files: "folder", plugins: "puzzle", cloudSync: "cloud", notifications: "bell", localTerminal: "terminal" };
const events = ["i18n.languageChanged", "ui.layoutChanged", "sessions.nodeStateChanged", "transfers.progress", "transfers.complete", "transfers.error"];
const t = key => messages[key];

async function loadLanguage() {
  const locale = await callHost("app", "getLocale");
  const language = ["en", "de", "es-ES", "fr-FR", "it", "ja", "ko", "pt-BR", "vi", "zh-CN", "zh-TW"].includes(locale) ? locale : "en";
  messages = require("../locales/" + language + ".json");
}

// Stdout is exclusively reserved for versioned protocol frames.
function writeFrame(payload, requestId = null) {
  process.stdout.write(`${JSON.stringify({
    protocolVersion: 1,
    requestId,
    payload,
  })}\n`);
}

function respondOk(requestId, value) {
  writeFrame({
    requestId,
    result: {
      status: "ok",
      value,
    },
  }, requestId);
}

function respondError(requestId, code, message) {
  writeFrame({
    requestId,
    result: {
      status: "error",
      error: {
        code,
        message,
        recoverable: false,
      },
    },
  }, requestId);
}

function callHost(namespace, method, args = {}) {
  const requestId = `host-tools-dashboard-${nextHostRequestId++}`;
  writeFrame({
    type: "callHostApi",
    requestId,
    namespace,
    method,
    args,
  });
  return new Promise((resolve, reject) => {
    pendingHostCalls.set(requestId, { resolve, reject });
  });
}

function handleHostResponse(payload) {
  const pending = pendingHostCalls.get(payload.requestId);
  if (!pending || !payload.result) {
    return false;
  }
  pendingHostCalls.delete(payload.requestId);
  if (payload.result.status === "ok") {
    pending.resolve(payload.result.value);
  } else {
    const message = payload.result.error?.message || "Host API call failed";
    pending.reject(new Error(message));
  }
  return true;
}

function page(page) { return { kind: "page", page }; }
function isPin(value) {
  return value && ((value.kind === "page" && pages.includes(value.page))
    || (value.kind === "connection" && typeof value.id === "string" && value.id.length > 0));
}
function pinKey(value) { return value.kind === "page" ? "page:" + value.page : "connection:" + value.id; }
function action(id, label, destination, icon = "arrow-right") {
  return { kind: "button", id, label, icon, value: destination, variant: "ghost", size: "small", disabled: refreshInProgress };
}
function entry(id, label, destination, icon, canPin = false) {
  const children = [action("open-" + id, label, destination, icon)];
  if (canPin) children.push({
    kind: "iconButton", id: "pin-" + id, label: t(pinned.some(pin => pinKey(pin) === pinKey(destination)) ? "unpin" : "pin"),
    icon: pinned.some(pin => pinKey(pin) === pinKey(destination)) ? "check" : "pin", value: destination, size: "small", disabled: refreshInProgress,
  });
  return { kind: "actionRow", gap: "compact", children };
}
function section(id, title, controls, empty) {
  return { id, title, controls: controls.length ? controls : [{ kind: "markdown", text: t(failures.length ? "unavailable" : refreshInProgress ? "refreshing" : empty) }] };
}
function transferEntry(transfer, label, id, icon) {
  const workspace = data.workspace;
  const tab = workspace?.tabs.find(tab => tab.transferOwners?.includes(transfer.nodeId));
  const target = tab ? { kind: "tab", id: tab.id }
    : workspace?.nodes.some(node => node.id === transfer.nodeId) ? { kind: "sftp", nodeId: transfer.nodeId } : null;
  const row = entry(id, label, target, icon);
  row.children[0].disabled ||= !target;
  return row;
}
function buildSchema() {
  const workspace = data.workspace;
  const controls = [{ kind: "row", gap: "compact", children: [
    { kind: "button", id: "refresh", label: t(refreshInProgress ? "refreshing" : "refresh"), icon: "refresh-cw", variant: "outline", size: "small", loading: refreshInProgress, disabled: refreshInProgress },
  ] }];
  if (failures.length) controls.push({ kind: "alert", tone: "warning", label: t("loadFailed"), description: failures.map(key => t(key)).join(" · ") });
  if (actionFailed) controls.push({ kind: "alert", tone: "error", label: t("actionFailed") });
  const sections = [];
  const recent = (data.connections || []).filter(connection => connection.lastUsedAt)
    .sort((a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt)).slice(0, 8)
    .map(connection => entry("connection-" + connection.id, connection.name, { kind: "connection", id: connection.id }, "server", true));
  for (const tab of (workspace?.tabs || []).filter(tab => tab.kind === "project").slice(0, 6)) {
    recent.push(entry("project-" + tab.id, t("openProject") + " · " + tab.title, { kind: "tab", id: tab.id }, "folder"));
  }
  sections.push(section("continue", t("continue"), recent, "noRecent"));
  const ongoing = [];
  for (const tab of (workspace?.tabs || []).filter(tab => ["terminal", "desktop"].includes(tab.kind)).slice(0, 8)) {
    ongoing.push(entry("tab-" + tab.id, tab.title, { kind: "tab", id: tab.id }, "terminal"));
    if (tab.recordings.length) ongoing.push(entry("recording-" + tab.id, t("recording") + " · " + tab.title, { kind: "tab", id: tab.id }, "circle"));
  }
  const transfers = data.transfers || [];
  for (const transfer of transfers.filter(item => ["pending", "active", "paused"].includes(item.state)).slice(0, 6)) {
    const progress = transfer.size > 0 ? " · " + Math.min(100, Math.floor(transfer.transferred * 100 / transfer.size)) + "%" : "";
    ongoing.push(transferEntry(transfer, t("transfer") + " · " + transfer.name + progress, "transfer-" + transfer.id, "arrow-up-down"));
  }
  for (const node of (workspace?.nodes || []).filter(node => node.forwards > 0).slice(0, 6)) {
    ongoing.push(entry("forward-" + node.id, t("forwards") + " · " + node.title + " (" + node.forwards + ")", { kind: "forwards", nodeId: node.id }, "network"));
  }
  sections.push(section("ongoing", t("ongoing"), ongoing, "noOngoing"));
  const attention = [];
  for (const node of (workspace?.nodes || []).filter(node => ["disconnected", "error"].includes(node.state)).slice(0, 6)) {
    attention.push(entry("disconnected-" + node.id, t("disconnected") + " · " + node.title, page("sessions"), "alert-triangle"));
  }
  for (const transfer of transfers.filter(item => item.state === "error").slice(0, 6)) {
    attention.push(transferEntry(transfer, t("transferFailed") + " · " + transfer.name, "failed-transfer-" + transfer.id, "alert-triangle"));
  }
  if (data.cloud?.conflict) attention.push(entry("sync-conflict", t("syncConflict"), page("cloudSync"), "cloud"));
  else if (data.cloud?.status === "error") attention.push(entry("sync-error", t("syncFailed"), page("cloudSync"), "cloud"));
  for (const issue of (workspace?.pluginIssues || []).slice(0, 6)) {
    attention.push(entry("plugin-" + issue.id, t("pluginIssue") + " · " + issue.name, page("plugins"), "puzzle"));
  }
  sections.push(section("attention", t("attention"), attention, "noAttention"));
  const shortcuts = pinned.map((destination, index) => {
    const connection = (data.connections || []).find(item => item.id === destination.id);
    const label = destination.kind === "page" ? t(destination.page) : connection?.name || t("unavailableConnection");
    const row = entry("shortcut-" + index, label, destination, destination.kind === "page" ? pageIcons[destination.page] : "server", editingShortcuts);
    row.children[0].disabled ||= destination.kind === "connection" && !connection;
    return row;
  });
  if (editingShortcuts) {
    shortcuts.push({ kind: "markdown", text: t("shortcutsHint") });
    shortcuts.push({ kind: "row", gap: "compact", children: pages.map(name => ({ kind: "button", id: "pin-page-" + name, value: page(name), label: t(name), variant: pinned.some(pin => pin.kind === "page" && pin.page === name) ? "outline" : "ghost", size: "small" })) });
  }
  sections.push({ id: "shortcuts", title: t("shortcuts"), controls: [
    { kind: "button", id: "edit-shortcuts", label: t(editingShortcuts ? "done" : "editShortcuts"), icon: editingShortcuts ? "check" : "settings", variant: "ghost", size: "small" },
    ...shortcuts,
  ] });
  const panel = id => {
    const section = sections.find(section => section.id === id);
    return { kind: "stack", id, label: section.title, gap: "compact", children: [
      { kind: "divider" }, ...section.controls,
    ] };
  };
  controls.push({ kind: "columns", gap: "spacious", children: [
    { kind: "stack", gap: "spacious", children: [panel("continue"), panel("shortcuts")] },
    { kind: "stack", gap: "spacious", children: [panel("ongoing"), panel("attention")] },
  ] });
  return { componentVersion: 1, kind: "form", title: t("title"), description: t("description"), controls };
}
function registerTab() {
  writeFrame({ type: "registerContribution", registration: {
    pluginId: PLUGIN_ID, registrationId: "workspace-tab", kind: "tab",
    metadata: { tabId: TAB_ID, schema: buildSchema() },
  } });
}
async function refresh() {
  if (refreshInProgress) { refreshPending = true; return; }
  refreshInProgress = true;
  registerTab();
  const sources = [["workspace", "app", "getWorkspaceSummary"], ["connections", "connections", "getSavedSummaries"], ["transfers", "transfers", "getAll"], ["cloud", "cloudSync", "getSummary"]];
  const results = await Promise.allSettled(sources.map(([, namespace, method]) => callHost(namespace, method)));
  failures = [];
  results.forEach((result, index) => {
    const key = sources[index][0];
    if (result.status === "fulfilled") data[key] = result.value;
    else { delete data[key]; failures.push(key); }
  });
  refreshInProgress = false;
  registerTab();
  if (refreshPending) { refreshPending = false; await refresh(); }
}
async function handleEvent(event) {
  if (event.name === "i18n.languageChanged") { await loadLanguage(); registerTab(); return; }
  if (events.includes(event.name)) { await refresh(); return; }
  if (event.name !== "ui.event" || event.payload?.type !== "click") return;
  const { controlId, value } = event.payload;
  actionFailed = false;
  try {
    if (controlId === "refresh") await refresh();
    else if (controlId === "edit-shortcuts") { editingShortcuts = !editingShortcuts; registerTab(); }
    else if (controlId.startsWith("pin-") && isPin(value)) {
      const key = pinKey(value);
      const next = pinned.some(pin => pinKey(pin) === key) ? pinned.filter(pin => pinKey(pin) !== key) : [...pinned, value];
      // Storage writes are one-way host effects, applied after this event completes.
      writeFrame({ type: "callHostApi", requestId: "workspace-write-" + nextHostRequestId++, namespace: "storage", method: "set", args: { key: "shortcuts", value: next } });
      pinned = next;
      registerTab();
    } else if (controlId.startsWith("open-")) {
      if (value?.kind === "connection") await callHost("connections", "connect", { connectionId: value.id });
      else await callHost("ui", "openWorkspace", value);
    }
  } catch (_error) { actionFailed = true; registerTab(); }
}
async function handleRequest(envelope) {
  const payload = envelope?.payload;
  if (!payload || handleHostResponse(payload) || payload.result) return;
  const { requestId, kind } = payload;
  try {
    switch (kind?.type) {
      case "activate": {
        await loadLanguage();
        const catalog = await callHost("app", "getApiCatalog");
        const required = ["app.getWorkspaceSummary", "ui.openWorkspace", "ui.openTab"];
        if (!Array.isArray(catalog) || required.some(api => !catalog.some(item => item.namespace + "." + item.method === api))) {
          respondError(requestId, "host_upgrade_required", t("hostUpgradeRequired"));
          return;
        }
        const saved = await callHost("storage", "get", { key: "shortcuts" });
        pinned = Array.isArray(saved) ? saved.filter(isPin) : [page("sessions"), page("files"), page("localTerminal")];
        for (const event of events) writeFrame({ type: "registerContribution", registration: { pluginId: PLUGIN_ID, registrationId: event, kind: "event-subscription", metadata: { event } } });
        await refresh();
        writeFrame({ type: "registerContribution", registration: {
          pluginId: PLUGIN_ID, registrationId: "workspace-entry", kind: "activity-bar-item",
          metadata: { itemId: "dashboard" },
        } });
        writeFrame({ type: "runtimeReady" });
        respondOk(requestId, { activated: true });
        break;
      }
      case "sendEvent": await handleEvent(kind.event); respondOk(requestId, { handled: true }); break;
      case "dispatchCommand": {
        if (kind.command !== "dashboard.open") {
          respondError(requestId, "unsupported_command", "Unsupported command");
          break;
        }
        // Navigation is a one-way effect; the host focuses an existing tab by ID.
        writeFrame({ type: "callHostApi", requestId: "workspace-open-" + nextHostRequestId++, namespace: "ui", method: "openTab", args: { tabId: TAB_ID } });
        respondOk(requestId, { opened: true });
        break;
      }
      case "health": respondOk(requestId, { ok: true }); break;
      case "deactivate": case "kill": respondOk(requestId, { stopped: true }); process.exit(0); break;
      default: respondError(requestId, "unsupported_request", "Unsupported request");
    }
  } catch (_error) { respondError(requestId, "workspace_request_failed", "Workspace request failed"); }
}
readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on("line", line => {
  let envelope;
  try { envelope = JSON.parse(line); } catch (_error) { return; }
  handleRequest(envelope).catch(() => process.stderr.write("Workspace request failed.\n"));
});
