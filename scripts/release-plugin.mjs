import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { parseArgs, isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { unzipSync, strFromU8 } from "fflate";
import { requireEngines, validateRegistry, validateHistory } from "./validate-registry.mjs";

const defaultCatalog = path.resolve(import.meta.dirname, "../registry/v1/index.json");
const readJson = filename => JSON.parse(fs.readFileSync(filename, "utf8"));

export function writeJson(filename, value) {
  const temporary = filename + "." + randomUUID() + ".tmp";
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
    fs.renameSync(temporary, filename);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export async function readHostVersion(repository) {
  let version;
  if (repository) {
    const metadata = JSON.parse(execFileSync("cargo", [
      "metadata", "--no-deps", "--format-version", "1",
      "--manifest-path", path.resolve(repository, "Cargo.toml"),
    ], { cwd: path.resolve(repository), encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
    version = metadata.packages.find(pkg => pkg.name === "oxideterm-gpui-app")?.version;
  } else {
    const response = await fetch("https://api.github.com/repos/AnalyseDeCircuit/oxideterm/releases/latest", {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error("Cannot read the latest stable OxideTerm release: HTTP " + response.status);
    const release = await response.json();
    if (release.draft || release.prerelease) throw new Error("Expected a stable OxideTerm release");
    version = release.tag_name?.replace(/^v/, "");
  }
  if (!semver.valid(version)) throw new Error("Cannot determine a valid OxideTerm version");
  return version;
}

export function effectiveEngines(release) {
  return release.compatibilityCorrections?.at(-1)?.engines ?? release.engines;
}

function hostRequirement(manifest, version) {
  // The language runtime is introduced after 2.2.0; development checkouts may
  // still carry that released version while the new loader is being prepared.
  return manifest.runtime?.kind === "language" && semver.lte(version, "2.2.0")
    ? ">2.2.0" : ">=" + version;
}

export async function prepareManifest(manifest, catalog, options = {}) {
  validateRegistry(catalog);
  if (!semver.valid(manifest.version)) throw new Error("Invalid plugin version");
  if (options.hostRange && options.requiresCurrentApp) throw new Error("Choose --host-range or --requires-current-app");
  const published = catalog.plugins.find(plugin => plugin.id === manifest.id);
  const releases = published?.releases ?? (published ? [{
    version: published.version,
    engines: published.engines ?? (published.minOxideTermVersion
      ? { oxideterm: ">=" + published.minOxideTermVersion } : undefined),
  }] : []);
  const sameVersion = releases.find(release => release.version === manifest.version);
  if (sameVersion) throw new Error("This version is already published; bump the plugin version before preparing it");
  const latest = [...releases].sort((a, b) => semver.rcompare(a.version, b.version))[0];
  if (latest && !semver.gt(manifest.version, latest.version)) throw new Error("The new plugin version must exceed its published versions");
  let engines;
  if (options.hostRange) {
    engines = { oxideterm: options.hostRange };
  } else if (options.requiresCurrentApp) {
    engines = { oxideterm: hostRequirement(manifest, await readHostVersion(options.hostRepository)) };
  } else if (latest) {
    engines = manifest.engines && !isDeepStrictEqual(manifest.engines, latest.engines)
      ? manifest.engines : effectiveEngines(latest);
    if (!engines) throw new Error("Published plugin has no host range; use --host-range to establish it");
  } else {
    engines = manifest.engines ?? { oxideterm: hostRequirement(manifest, await readHostVersion(options.hostRepository)) };
  }
  requireEngines(engines, manifest.id);
  return { ...manifest, engines };
}

export function recordRelease(catalog, manifest, releaseUrl, packageArguments) {
  validateRegistry(catalog);
  requireEngines(manifest.engines, manifest.id);
  const base = new URL(releaseUrl);
  if (base.protocol !== "https:" || base.search || base.hash) throw new Error("Use an immutable HTTPS release asset directory");
  const packages = packageArguments.map(argument => {
    const separator = argument.indexOf("=");
    if (separator < 1) throw new Error("Package must use target=path");
    const target = argument.slice(0, separator);
    const filename = path.resolve(argument.slice(separator + 1));
    const size = fs.statSync(filename).size;
    if (size < 1 || size > 50 * 1024 * 1024) throw new Error("Invalid package size");
    const bytes = fs.readFileSync(filename);
    const manifests = unzipSync(bytes, { filter: file => {
      if (!/^(?:[^/]+\/)?plugin\.json$/.test(file.name)) return false;
      if (file.originalSize > 1024 * 1024) throw new Error("Package manifest is too large");
      return true;
    } });
    const entries = Object.values(manifests);
    if (entries.length !== 1) throw new Error("Package must contain exactly one root or single-directory plugin.json");
    const packaged = JSON.parse(strFromU8(entries[0]));
    if (packaged.id !== manifest.id || packaged.version !== manifest.version
      || !isDeepStrictEqual(packaged.engines, manifest.engines)
      || packaged.runtime?.kind !== manifest.runtime?.kind) {
      throw new Error("Packaged identity, version or host range does not match the prepared manifest");
    }
    return {
      target,
      downloadUrl: base.href.replace(/\/$/, "") + "/" + encodeURIComponent(path.basename(filename)),
      checksum: "sha256:" + createHash("sha256").update(bytes).digest("hex"),
      size,
    };
  });
  const next = structuredClone(catalog);
  let plugin = next.plugins.find(plugin => plugin.id === manifest.id);
  if (!plugin) {
    plugin = {
      id: manifest.id, name: manifest.name, description: manifest.description,
      author: manifest.author, homepage: manifest.repository,
      version: manifest.version, engines: manifest.engines, packages,
      // Older native clients read this historical spelling. Do not emit both aliases.
      minOxidetermVersion:
        semver.minVersion(manifest.engines.oxideterm.replaceAll(",", " "))?.version,
      releases: [],
    };
    next.plugins.push(plugin);
    if (manifest.tags !== undefined) {
      if (!Array.isArray(manifest.tags) || manifest.tags.some(tag => typeof tag !== "string" || !tag.trim())) {
        throw new Error("Plugin tags must be non-empty category names");
      }
      plugin.tags = [...new Set(manifest.tags.map(tag => tag.trim().toLowerCase()))];
    } else if (manifest.runtime?.kind === "language") {
      plugin.tags = ["language"];
    } else if (manifest.contributes?.filePreviews?.length) {
      plugin.tags = ["preview"];
    }
  }
  if (!plugin.releases) {
    const engines = plugin.engines ?? (plugin.minOxideTermVersion
      ? { oxideterm: ">=" + plugin.minOxideTermVersion } : undefined);
    requireEngines(engines, plugin.id);
    plugin.releases = [{ version: plugin.version, engines, packages: plugin.packages }];
  }
  const release = { version: manifest.version, engines: manifest.engines, packages };
  const existing = plugin.releases.find(item => semver.eq(item.version, manifest.version));
  if (existing) throw new Error("Release already exists; package records are immutable");
  plugin.releases.push(release);
  plugin.updatedAt = new Date().toISOString();
  validateHistory(catalog, next);
  return next;
}

export function correctCompatibility(catalog, id, version, hostRange, reason) {
  const next = structuredClone(catalog);
  const release = next.plugins.find(plugin => plugin.id === id)?.releases?.find(release => release.version === version);
  if (!release) throw new Error("Published release not found");
  if (!reason?.trim()) throw new Error("A compatibility correction needs a reason");
  const engines = { oxideterm: hostRange };
  requireEngines(engines, id);
  if (isDeepStrictEqual(effectiveEngines(release), engines)) throw new Error("Compatibility range is unchanged");
  (release.compatibilityCorrections ??= []).push({
    engines, reason: reason.trim(), recordedAt: new Date().toISOString(),
  });
  validateHistory(catalog, next);
  return next;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      catalog: { type: "string", default: defaultCatalog },
      "host-repo": { type: "string" },
      "host-range": { type: "string" },
      "requires-current-app": { type: "boolean", default: false },
      "release-url": { type: "string" },
      package: { type: "string", multiple: true, default: [] },
      version: { type: "string" },
      reason: { type: "string" },
    },
  });
  const [command, subject] = positionals;
  if (!subject || positionals.length !== 2) {
    throw new Error("Usage: release-plugin.mjs prepare <plugin-dir> | record <plugin-dir> --release-url URL --package target=zip | correct <plugin-id> --version VERSION --host-range RANGE --reason TEXT");
  }
  const catalog = readJson(values.catalog);
  if (command === "correct") {
    writeJson(values.catalog, correctCompatibility(catalog, subject, values.version, values["host-range"], values.reason));
  } else {
    const manifestPath = path.resolve(subject, "plugin.json");
    const manifest = readJson(manifestPath);
    if (command === "prepare") {
      writeJson(manifestPath, await prepareManifest(manifest, catalog, {
        hostRepository: values["host-repo"],
        hostRange: values["host-range"],
        requiresCurrentApp: values["requires-current-app"],
      }));
    } else if (command === "record") {
      writeJson(values.catalog, recordRelease(catalog, manifest, values["release-url"], values.package));
    } else {
      throw new Error("Unknown release command: " + command);
    }
  }
  process.stdout.write(command + " completed\n");
}
