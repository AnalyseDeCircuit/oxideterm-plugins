import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import semver from "semver";

// Release ordering and manifest ranges use semantic versions.
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const registryPath = path.join(repositoryRoot, "registry", "v1", "index.json");
const supportedTargets = new Set([
  "any",
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "aarch64-unknown-linux-gnu",
  "x86_64-unknown-linux-gnu",
  "aarch64-pc-windows-msvc",
  "x86_64-pc-windows-msvc",
]);

export function validateRegistry(registry) {
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
    if (plugin.minOxidetermVersion !== undefined) {
      requireVersion(plugin.minOxidetermVersion, `${plugin.id}.minOxidetermVersion`);
      if (plugin.minOxideTermVersion !== undefined) throw new Error("Use only one minimum-host field spelling");
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

    if (plugin.engines !== undefined) requireEngines(plugin.engines, plugin.id);
    validatePackages(plugin.id, plugin.packages);
    if (plugin.releases !== undefined) {
      if (!Array.isArray(plugin.releases) || plugin.releases.length === 0) {
        throw new Error(`${plugin.id}: releases must be a non-empty array`);
      }
      const versions = new Set();
      for (const release of plugin.releases) {
        requireVersion(release.version, `${plugin.id}.releases.version`);
        const version = release.version.split("+")[0];
        if (versions.has(version)) throw new Error(`${plugin.id}: duplicate release version`);
        versions.add(version);
        requireEngines(release.engines, `${plugin.id}@${release.version}`);
        validatePackages(plugin.id, release.packages);
        for (const correction of release.compatibilityCorrections ?? []) {
          requireEngines(correction.engines, plugin.id);
          requireText(correction.reason, "compatibility correction reason");
          if (!correction.recordedAt || Number.isNaN(Date.parse(correction.recordedAt))) {
            throw new Error("compatibility correction needs a valid recordedAt");
          }
        }
      }
      if (!plugin.releases.some(release => release.version === plugin.version
        && isDeepStrictEqual(sortedPackages(release.packages), sortedPackages(plugin.packages)))) {
        throw new Error(`${plugin.id}: history must retain the legacy package record`);
      }
    }
  }
}

function validatePackages(id, packages) {
  const plugin = { id, packages };
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

function requireText(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function requireVersion(value, field) {
  requireText(value, field);
  const parsed = semver.parse(value);
  if (!parsed || parsed.raw !== value || !/^\d+\.\d+\.\d/.test(value)) {
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

export function requireEngines(engines, field) {
  requireText(engines?.oxideterm, `${field}.engines.oxideterm`);
  // Use explicit comparators shared with Rust semver, avoiding npm-only range syntax.
  const comparators = engines.oxideterm.split(",").map(value => value.trim());
  if (!comparators.every(value =>
    /^(?:>=|<=|>|<|=|~|\^)\s*\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)
    && semver.validRange(value))) {
    throw new Error(`${field}: use explicit host comparators such as >=2.3.0, <3.0.0`);
  }
}

function sortedPackages(packages) {
  return [...packages].sort((a, b) => a.target.localeCompare(b.target));
}

function legacySnapshot(plugin) {
  return {
    version: plugin.version,
    minOxideTermVersion: plugin.minOxideTermVersion,
    minOxidetermVersion: plugin.minOxidetermVersion,
    engines: plugin.engines,
    packages: sortedPackages(plugin.packages),
  };
}

export function validateHistory(previous, current) {
  validateRegistry(previous);
  validateRegistry(current);
  for (const before of previous.plugins) {
    const after = current.plugins.find(plugin => plugin.id === before.id);
    if (!after) throw new Error(`${before.id}: published plugin history was removed`);
    if (!isDeepStrictEqual(legacySnapshot(before), legacySnapshot(after))) {
      throw new Error(`${before.id}: preserve the legacy snapshot; append a release instead`);
    }
    for (const release of before.releases ?? []) {
      const retained = after.releases?.find(item => item.version === release.version);
      const { compatibilityCorrections: corrections = [], ...original } = release;
      const { compatibilityCorrections: retainedCorrections = [], ...retainedOriginal } = retained ?? {};
      if (!retained || !isDeepStrictEqual(
        { ...original, packages: sortedPackages(release.packages) },
        { ...retainedOriginal, packages: sortedPackages(retained.packages) },
      ) || !isDeepStrictEqual(corrections, retainedCorrections.slice(0, corrections.length))) {
        throw new Error(`${before.id}@${release.version}: published release changed or removed`);
      }
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  validateRegistry(registry);
  const base = process.env.REGISTRY_BASE_REF;
  if (base && !/^0+$/.test(base)) {
    if (!/^[0-9a-f]{40}$/.test(base)) throw new Error("REGISTRY_BASE_REF must be a full commit SHA");
    const previous = JSON.parse(execFileSync("git", ["show", `${base}:registry/v1/index.json`], {
      cwd: repositoryRoot, encoding: "utf8",
    }));
    validateHistory(previous, registry);
  }
  process.stdout.write(`Validated ${registry.plugins.length} OxideTerm plugin entries.\n`);
}
