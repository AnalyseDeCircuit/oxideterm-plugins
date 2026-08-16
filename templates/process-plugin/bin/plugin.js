#!/usr/bin/env node

// SPDX-License-Identifier: MIT

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

// The manifest is the single source of truth for the plugin identity.
const pluginManifest = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, "..", "plugin.json"),
  "utf8",
));
const PLUGIN_ID = pluginManifest.id;
const TAB_ID = "starter";
const TAB_REGISTRATION_ID = "starter-tab-registration";
const ACTION_CONTROL_ID = "increment";

let interactionCount = 0;

// Stdout is reserved for protocol frames. Use stderr only for static,
// non-sensitive diagnostics.
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

function starterTabSchema() {
  return {
    componentVersion: 1,
    kind: "form",
    title: "OxideTerm Starter Plugin",
    description: "This interface is rendered and themed by OxideTerm.",
    sections: [
      {
        id: "starter-content",
        title: "Interactive example",
        controls: [
          {
            kind: "card",
            variant: "inspector",
            gap: "normal",
            children: [
              {
                kind: "markdown",
                text: "Edit `plugin.json` and `bin/plugin.js` to build your plugin.",
              },
              {
                kind: "keyValue",
                label: "Interactions",
                value: String(interactionCount),
              },
              {
                kind: "button",
                id: ACTION_CONTROL_ID,
                label: "Increment",
                icon: "plus",
                variant: "default",
              },
            ],
          },
        ],
      },
    ],
  };
}

function publishStarterTab() {
  writeFrame({
    type: "registerContribution",
    registration: {
      registrationId: TAB_REGISTRATION_ID,
      pluginId: PLUGIN_ID,
      kind: "tab",
      metadata: {
        tabId: TAB_ID,
        schema: starterTabSchema(),
      },
    },
  });
}

function handleUiEvent(event) {
  if (event?.name !== "ui.event" || event.payload?.controlId !== ACTION_CONTROL_ID) {
    return { handled: false };
  }
  interactionCount += 1;
  publishStarterTab();
  return { handled: true, interactionCount };
}

async function handleRequest(envelope) {
  const payload = envelope?.payload;
  if (!payload) {
    return;
  }

  const requestId = payload.requestId;
  const requestType = payload.kind?.type;
  switch (requestType) {
    case "activate":
      publishStarterTab();
      writeFrame({ type: "runtimeReady" });
      respondOk(requestId, { activated: true });
      break;
    case "sendEvent":
      respondOk(requestId, handleUiEvent(payload.kind.event));
      break;
    case "health":
      respondOk(requestId, { ok: true });
      break;
    case "deactivate":
    case "kill":
      respondOk(requestId, { stopped: true });
      process.exit(0);
      break;
    default:
      respondError(
        requestId,
        "unsupported_request",
        `Unsupported request ${requestType || "unknown"}`,
      );
  }
}

readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
}).on("line", (line) => {
  if (!line.trim()) {
    return;
  }
  let envelope;
  try {
    envelope = JSON.parse(line);
  } catch (_error) {
    process.stderr.write("Plugin received an invalid protocol frame.\n");
    return;
  }
  handleRequest(envelope).catch(() => {
    // Never log a request body because future host calls may contain secrets.
    process.stderr.write("Plugin request handling failed.\n");
  });
});
