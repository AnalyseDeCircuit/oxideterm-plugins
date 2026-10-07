import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseArgs, isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { unzipSync, strFromU8 } from "fflate";
import { requireEngines, validateRegistry, validateHistory, languageDefinition } from "./validate-registry.mjs";
import {defaultCatalog, readCatalog, writeJson, importCatalogEntry, generateCatalog} from './catalog-source.mjs';
export {writeJson} from './catalog-source.mjs';

const readJson = filename => JSON.parse(fs.readFileSync(filename, "utf8"));

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
  // Development checkouts can still carry the last released version while a
  // new runtime is being implemented. Exclude hosts that cannot load it.
  const language = languageDefinition(manifest.contributes?.language);
  if (manifest.contributes?.language?.injections?.length && semver.lt(version, "2.2.2")) return ">=2.2.2";
  if (language && Object.keys(language).some(key => key !== 'id') && semver.lt(version, "2.2.2")) return ">=2.2.2";
  if (manifest.runtime?.kind === "language" && semver.lte(version, "2.2.0")) return ">2.2.0";
  if (manifest.runtime?.kind === "acp" && semver.lte(version, "2.2.1")) return ">2.2.1";
  if (manifest.runtime?.kind === "remote-desktop" && semver.lte(version, "2.2.1")) return ">2.2.1";
  if (manifest.runtime?.kind === "terminal-transport" && semver.lte(version, "2.2.1")) return ">=2.2.2";
  if (manifest.runtime?.kind === "helper" && semver.lte(version, "2.2.1")) return ">=2.2.2";
  return ">=" + version;
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
  validateLanguageHost(manifest, engines);
  return { ...manifest, engines };
}

function validateLanguageHost(manifest, engines) {
  if (manifest.contributes?.language?.injections?.length
    && semver.intersects(engines.oxideterm.replaceAll(',', ' '), '<2.2.2')) {
    throw new Error('Embedded language grammars require OxideTerm >=2.2.2; prepare with --requires-current-app or --host-range');
  }
  const language = languageDefinition(manifest.contributes?.language);
  if (language && Object.keys(language).some(key => key !== 'id')
    && semver.intersects(engines.oxideterm.replaceAll(',', ' '), '<2.2.2')) {
    throw new Error('Dynamic language declarations require OxideTerm >=2.2.2; prepare with --requires-current-app or --host-range');
  }
}

export function recordRelease(catalog, manifest, releaseUrl, packageArguments) {
  validateRegistry(catalog);
  requireEngines(manifest.engines, manifest.id);
  validateLanguageHost(manifest, manifest.engines);
  const language = languageDefinition(manifest.contributes?.language);
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
      || packaged.runtime?.kind !== manifest.runtime?.kind
      || !isDeepStrictEqual(languageDefinition(packaged.contributes?.language), language)) {
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
      license: manifest.license, licenseUrl: manifest.licenseUrl,
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
    } else if (manifest.runtime?.kind === "acp") {
      plugin.tags = ["acp"];
    } else if (manifest.runtime?.kind === "remote-desktop") {
      plugin.tags = ["remote-connections"];
    } else if (manifest.runtime?.kind === "terminal-transport") {
      plugin.tags = ["remote-connections"];
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
  if (plugin.releases.every(item => semver.lt(item.version, manifest.version))) {
    if (language) plugin.language = language;
    else delete plugin.language;
  }
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

if (process.argv[1] && fs.existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
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
      output: { type: "string" },
      "packages-dir": {type:"string"},
    },
  });
  const [command, subject] = positionals;
  if (!subject || positionals.length !== 2) {
    throw new Error("Use prepare <plugin-dir> | entry/record <plugin-dir> --release-url URL --package target=zip | correct <plugin-id> --version VERSION --host-range RANGE --reason TEXT");
  }
  const catalog = readCatalog(values.catalog);
  const save = (next, id) => {
    if (path.resolve(values.catalog) === defaultCatalog) {
      importCatalogEntry(next.plugins.find(plugin=>plugin.id===id));
      generateCatalog();
    } else writeJson(values.catalog,next);
  };
  if (command === "correct") {
    save(correctCompatibility(catalog, subject, values.version, values["host-range"], values.reason),subject);
  } else {
    const manifestPath = path.resolve(subject, "plugin.json");
    const sourceManifest = readJson(manifestPath);
    const manifest = command === 'entry' ? await prepareManifest(sourceManifest,catalog) : sourceManifest;
    if (command === "prepare") {
      writeJson(manifestPath, await prepareManifest(manifest, catalog, {
        hostRepository: values["host-repo"],
        hostRange: values["host-range"],
        requiresCurrentApp: values["requires-current-app"],
      }));
    } else if (command === "record" || command === "entry") {
      const packages=[...values.package];
      if(values['packages-dir']) {
        const prefix=path.basename(path.resolve(subject));
        for(const file of fs.readdirSync(values['packages-dir']).filter(file=>file.endsWith('.zip') && (file.startsWith(`${prefix}-${manifest.version}`) || file.startsWith(`${manifest.id}-${manifest.version}`)))) {
          const match=file.match(/((?:aarch64|x86_64)-(?:apple-darwin|unknown-linux-gnu|pc-windows-msvc))\.zip$/);
          const target=match?.[1] ?? (file.endsWith('-any.zip') || manifest.runtime?.kind==='language' ? 'any' : undefined);
          if(!target) throw new Error('Cannot determine package target from filename');
          packages.push(`${target}=${path.join(values['packages-dir'],file)}`);
        }
      }
      const next=recordRelease(catalog, manifest, values["release-url"], packages);
      if(command==='entry') {
        if(!values.output) throw new Error('entry requires --output');
        writeJson(values.output,next.plugins.find(plugin=>plugin.id===manifest.id));
      } else save(next,manifest.id);
    } else {
      throw new Error("Unknown release command: " + command);
    }
  }
  process.stdout.write(command + " completed\n");
}
