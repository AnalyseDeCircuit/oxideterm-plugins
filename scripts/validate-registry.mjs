import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// Keep CI dependency-free so the published catalog can be validated locally
// with the Node.js runtime already available on GitHub Actions.
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const registryPath = path.join(repositoryRoot, "registry", "v1", "index.json");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const supportedTargets = new Set([
  "any",
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "aarch64-unknown-linux-gnu",
  "x86_64-unknown-linux-gnu",
  "aarch64-pc-windows-msvc",
  "x86_64-pc-windows-msvc",
]);

if (registry.version !== 1 || !Array.isArray(registry.plugins)) {
  throw new Error("registry/v1/index.json must contain version 1 and a plugins array");
}

const pluginIds = new Set();
for (const plugin of registry.plugins) {
  requireText(plugin.id, "plugin.id");
  requireText(plugin.name, `${plugin.id}.name`);
  requireVersion(plugin.version, `${plugin.id}.version`);
  if (plugin.minOxideTermVersion !== undefined) {
    requireVersion(plugin.minOxideTermVersion, `${plugin.id}.minOxideTermVersion`);
  }
  optionalText(plugin.description, `${plugin.id}.description`, 1000);
  optionalText(plugin.author, `${plugin.id}.author`, 128);
  optionalTextArray(plugin.tags, `${plugin.id}.tags`, 48);
  optionalTextArray(plugin.capabilitiesSummary, `${plugin.id}.capabilitiesSummary`, 128);
  if (plugin.homepage !== undefined) {
    requireHttpsUrl(plugin.homepage, `${plugin.id}.homepage`);
  }
  if (plugin.updatedAt !== undefined && Number.isNaN(Date.parse(plugin.updatedAt))) {
    throw new Error(`${plugin.id}.updatedAt must be an ISO date-time`);
  }
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(plugin.id)) {
    throw new Error(`${plugin.id}: invalid plugin id`);
  }
  if (pluginIds.has(plugin.id)) {
    throw new Error(`${plugin.id}: duplicate plugin id`);
  }
  pluginIds.add(plugin.id);

  if (!Array.isArray(plugin.packages) || plugin.packages.length === 0) {
    throw new Error(`${plugin.id}: at least one package is required`);
  }
  const targets = new Set();
  for (const pluginPackage of plugin.packages) {
    requireText(pluginPackage.target, `${plugin.id}.packages.target`);
    if (!supportedTargets.has(pluginPackage.target)) {
      throw new Error(`${plugin.id}: unsupported package target ${pluginPackage.target}`);
    }
    requireHttpsUrl(pluginPackage.downloadUrl, `${plugin.id}.${pluginPackage.target}.downloadUrl`);
    if (!/^(?:sha256:)?[0-9a-fA-F]{64}$/.test(pluginPackage.checksum ?? "")) {
      throw new Error(`${plugin.id}.${pluginPackage.target}: invalid SHA-256`);
    }
    if (!Number.isSafeInteger(pluginPackage.size) || pluginPackage.size <= 0 || pluginPackage.size > 50 * 1024 * 1024) {
      throw new Error(`${plugin.id}.${pluginPackage.target}: invalid package size`);
    }
    if (targets.has(pluginPackage.target)) {
      throw new Error(`${plugin.id}: duplicate package target ${pluginPackage.target}`);
    }
    targets.add(pluginPackage.target);
  }
}

process.stdout.write(`Validated ${registry.plugins.length} OxideTerm plugin entries.\n`);

function requireText(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function requireVersion(value, field) {
  requireText(value, field);
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value)) {
    throw new Error(`${field} must be a semantic version`);
  }
}

function optionalText(value, field, maximumLength) {
  if (value === undefined) {
    return;
  }
  requireText(value, field);
  if (value.length > maximumLength) {
    throw new Error(`${field} must not exceed ${maximumLength} characters`);
  }
}

function optionalTextArray(value, field, maximumItemLength) {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || new Set(value).size !== value.length) {
    throw new Error(`${field} must be an array of unique strings`);
  }
  for (const item of value) {
    optionalText(item, `${field} item`, maximumItemLength);
  }
}

function requireHttpsUrl(value, field) {
  requireText(value, field);
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error(`${field} must use HTTPS`);
  }
}
