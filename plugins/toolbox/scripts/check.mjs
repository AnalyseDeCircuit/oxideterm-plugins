import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptDirectory, "..");
const manifestPath = path.join(pluginRoot, "plugin.json");
const cargoManifestPath = path.join(pluginRoot, "Cargo.toml");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const cargoManifest = fs.readFileSync(cargoManifestPath, "utf8");
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
if (manifest.runtime?.kind !== "wasm" || manifest.runtime?.entry !== "plugin.wasm") {
  fail("WASM starter runtime must use plugin.wasm");
}

const cargoPackage = cargoManifest.match(/\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m);
if (!cargoPackage || cargoPackage[1] !== manifest.version) {
  fail("Cargo.toml package version must match plugin.json");
}

const releaseTagIndex = process.argv.indexOf("--release-tag");
if (releaseTagIndex >= 0 && process.argv[releaseTagIndex + 1] !== `v${manifest.version}`) {
  fail(`release tag must be v${manifest.version}`);
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
