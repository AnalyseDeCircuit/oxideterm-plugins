import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptDirectory, "..");
const manifestPath = path.join(pluginRoot, "plugin.json");
const runtimeSourcePath = path.join(pluginRoot, "bin", "plugin.js");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const pluginIdPattern = /^[a-z0-9][a-z0-9.-]*$/;
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

requireText(manifest.id, "plugin.json id");
requireText(manifest.name, "plugin.json name");
requireText(manifest.version, "plugin.json version");
if (!pluginIdPattern.test(manifest.id)) {
  fail("plugin.json id must use lowercase reverse-domain characters");
}
if (!versionPattern.test(manifest.version)) {
  fail("plugin.json version must be a semantic version");
}

const runtimeEntry = manifest.runtime?.entry;
requireText(runtimeEntry, "plugin.json runtime.entry");
const normalizedEntry = path.posix.normalize(runtimeEntry.replaceAll("\\", "/"));
if (normalizedEntry.startsWith("../") || path.posix.isAbsolute(normalizedEntry)) {
  fail("plugin.json runtime.entry must stay inside the plugin directory");
}
const runtimeEntryPath = path.join(pluginRoot, normalizedEntry);
if (!fs.existsSync(runtimeEntryPath) || !fs.statSync(runtimeEntryPath).isFile()) {
  fail("plugin.json runtime.entry must point to a file");
}

// Parse the shared runtime without executing plugin code.
const syntaxCheck = spawnSync(process.execPath, ["--check", runtimeSourcePath], {
  encoding: "utf8",
});
if (syntaxCheck.status !== 0) {
  fail(syntaxCheck.stderr.trim() || "bin/plugin.js contains invalid JavaScript");
}

const releaseTagIndex = process.argv.indexOf("--release-tag");
if (releaseTagIndex >= 0) {
  const releaseTag = process.argv[releaseTagIndex + 1];
  if (releaseTag !== `v${manifest.version}`) {
    fail(`release tag must be v${manifest.version}`);
  }
}

process.stdout.write(`Validated ${manifest.id} ${manifest.version}.\n`);

function requireText(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} must be a non-empty string`);
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
