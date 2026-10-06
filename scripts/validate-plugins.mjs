import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { requireEngines } from "./validate-registry.mjs";

// Source validation is intentionally independent from the marketplace index:
// a plugin may be prepared here before its immutable release package exists.
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceGroups = [
  { label: "first-party plugin", root: path.join(repositoryRoot, "plugins") },
  { label: "plugin template", root: path.join(repositoryRoot, "templates") },
];
const pluginDirectories = sourceGroups.flatMap(({ label, root }) =>
  fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ label, path: path.join(root, entry.name) })),
);
const pluginIds = new Set();

for (const source of pluginDirectories) {
  const pluginDirectory = source.path;
  const manifestPath = path.join(pluginDirectory, "plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  requireText(manifest.id, `${manifestPath}: id`);
  requireText(manifest.name, `${manifest.id}: name`);
  requireVersion(manifest.version, `${manifest.id}: version`);
  if (pluginIds.has(manifest.id)) {
    throw new Error(`${manifest.id}: duplicate ${source.label} id`);
  }
  pluginIds.add(manifest.id);

  const runtime = manifest.runtime;
  if (runtime !== undefined) {
    requireText(runtime.kind, `${manifest.id}: runtime.kind`);
    requireText(runtime.entry, `${manifest.id}: runtime.entry`);
    const normalizedEntry = path.posix.normalize(runtime.entry.replaceAll("\\", "/"));
    if (normalizedEntry.startsWith("../") || path.posix.isAbsolute(normalizedEntry)) {
      throw new Error(`${manifest.id}: runtime entry escapes the plugin directory`);
    }
    const entryPath = path.join(pluginDirectory, normalizedEntry);
    const generatedLanguage = runtime.kind === "language";
    if (generatedLanguage) {
      if (manifest.license !== "Apache-2.0") throw new Error(`${manifest.id}: expected Apache-2.0 plugin license`);
      for (const file of ["LICENSE", "NOTICE"]) {
        requireText(fs.readFileSync(path.join(pluginDirectory, file), "utf8"), `${manifest.id}: ${file}`);
      }
      const recipe = JSON.parse(fs.readFileSync(path.join(pluginDirectory, "grammar.json"), "utf8"));
      for (const field of ["crate", "version", "repository", "revision", "license", "sample"]) {
        requireText(recipe[field], `${manifest.id}: grammar.${field}`);
      }
      if (!/^[a-f0-9]{64}$/.test(recipe.sha256)) throw new Error(`${manifest.id}: invalid grammar checksum`);
      const captures = Array.isArray(recipe.highlight) ? recipe.highlight : [recipe.highlight];
      if (!captures.length) throw new Error(`${manifest.id}: expected highlight captures`);
      for (const capture of captures) {
        requireText(capture?.text, `${manifest.id}: expected highlight text`);
        requireText(capture?.scope, `${manifest.id}: expected highlight scope`);
      }
      requireText(manifest.contributes?.language?.id, `${manifest.id}: language id`);
      requireEngines(manifest.engines, manifest.id);
    }
    // Rust WASM sources produce their entry during the plugin build job, just like grammars.
    // Release recording separately requires and verifies the actual archived executable.
    const rustWasmSource = runtime.kind === "wasm" && normalizedEntry === "plugin.wasm"
      && fs.existsSync(path.join(pluginDirectory, "Cargo.toml"))
      && fs.existsSync(path.join(pluginDirectory, "src/lib.rs"));
    const rustProcessSource = ["acp", "remote-desktop", "terminal-transport", "helper"].includes(runtime.kind)
      && fs.existsSync(path.join(pluginDirectory, "Cargo.toml"))
      && fs.existsSync(path.join(pluginDirectory, "src/main.rs"));
    const generatedEntry = generatedLanguage || rustWasmSource || rustProcessSource;
    if (!fs.existsSync(entryPath) && !generatedEntry) {
      throw new Error(`${manifest.id}: runtime entry does not exist`);
    }
    if (fs.existsSync(entryPath)) {
      const entryStat = fs.statSync(entryPath);
      if (!entryStat.isFile()) {
        throw new Error(`${manifest.id}: runtime entry is not a file`);
      }
      if (runtime.kind === "process" && process.platform !== "win32" && (entryStat.mode & 0o111) === 0) {
        throw new Error(`${manifest.id}: process runtime entry must be executable`);
      }
      if (runtime.kind === "process" && entryPath.endsWith(".js")) {
        // Syntax-check JavaScript entries without executing plugin code.
        const syntaxCheck = spawnSync(process.execPath, ["--check", entryPath], {
          encoding: "utf8",
        });
        if (syntaxCheck.status !== 0) {
          throw new Error(`${manifest.id}: invalid JavaScript runtime entry\n${syntaxCheck.stderr}`);
        }
      }
    }
  }

  const capabilities = manifest.permissions?.capabilities ?? [];
  if (!Array.isArray(capabilities) || new Set(capabilities).size !== capabilities.length) {
    throw new Error(`${manifest.id}: capabilities must be an array of unique strings`);
  }
  for (const capability of capabilities) {
    requireText(capability, `${manifest.id}: capability`);
  }
}

process.stdout.write(`Validated ${pluginDirectories.length} OxideTerm plugin and template directories.\n`);

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
