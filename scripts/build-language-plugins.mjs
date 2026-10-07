import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { zipSync, strToU8 } from "fflate";
import { prepareManifest, writeJson } from "./release-plugin.mjs";
import {readCatalog} from './catalog-source.mjs';

const root = path.resolve(import.meta.dirname, "..");
const plugins = new Map();
for (const entry of fs.readdirSync(path.join(root, "plugins"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = path.join(root, "plugins", entry.name);
  if (!fs.existsSync(path.join(directory, "grammar.json"))) continue;
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "plugin.json")));
  const recipe = JSON.parse(fs.readFileSync(path.join(directory, "grammar.json")));
  plugins.set(manifest.contributes.language.id, { directory, manifest, recipe });
}
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "host-repo": { type: "string" },
    "tree-sitter": { type: "string", default: "tree-sitter" },
    output: { type: "string", default: path.join(root, "dist/languages") },
    list: { type: "boolean", default: false },
  },
});
if (values.list) {
  console.log([...plugins.keys()].join("\n"));
  process.exit(0);
}
const names = positionals[0] === "all" ? [...plugins.keys()] : positionals;
if (!names.length || names.some(name => !plugins.has(name))) throw new Error("Choose a language listed by --list, or all");
if (!execFileSync(values["tree-sitter"], ["--version"], { encoding: "utf8" }).startsWith("tree-sitter 0.27.0")) {
  throw new Error("Language packages require tree-sitter CLI 0.27.0");
}
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const output = path.resolve(values.output);
fs.mkdirSync(output, { recursive: true });
const catalog = readCatalog();

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error("Download failed: " + response.status + " " + url);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 50 * 1024 * 1024) throw new Error("Source archive exceeds size limit");
  return bytes;
}

async function withSource(plugin, read) {
  const language = plugin.manifest.contributes.language.id;
  const recipe = plugin.recipe;
  const archive = path.join(output, recipe.archiveUrl
    ? language + "-" + recipe.revision + ".tar.gz"
    : recipe.crate + "-" + recipe.version + ".crate");
  if (!fs.existsSync(archive)) {
    fs.writeFileSync(archive, await download(recipe.archiveUrl
      ?? "https://static.crates.io/crates/" + recipe.crate + "/" + recipe.crate + "-" + recipe.version + ".crate"));
  }
  if (digest(fs.readFileSync(archive)) !== recipe.sha256) throw new Error("Source archive checksum mismatch: " + language);
  const build = fs.mkdtempSync(path.join(output, ".build-"));
  try {
    execFileSync("tar", ["-xzf", archive, "-C", build]);
    const source = path.join(build, recipe.archiveRoot ?? recipe.crate + "-" + recipe.version);
    return await read(source, archive);
  } finally {
    fs.rmSync(build, { recursive: true, force: true });
  }
}

function readHighlights(plugin, source) {
  const override = path.join(plugin.directory, "highlights.scm");
  return fs.readFileSync(fs.existsSync(override) ? override : path.join(source, plugin.recipe.highlightsPath ?? "queries/highlights.scm"));
}

async function buildGrammar(plugin, directory, includes = []) {
  fs.mkdirSync(directory, { recursive: true });
  return withSource(plugin, async (source, archive) => {
    const recipe = plugin.recipe;
    const parser = path.join(directory, "parser.wasm");
    execFileSync(values["tree-sitter"], ["build", "--wasm", path.join(source, recipe.grammarPath ?? "."), "-o", parser], { stdio: "inherit" });
    const parts = [];
    for (const language of includes) {
      const included = plugins.get(language);
      if (!included) throw new Error("Unknown included highlight language: " + language);
      parts.push(await withSource(included, source => readHighlights(included, source)));
    }
    parts.push(readHighlights(plugin, source));
    const highlights = Buffer.concat(parts.flatMap(part => [part, Buffer.from("\n")]));
    fs.writeFileSync(path.join(directory, "highlights.scm"), highlights);
    let license;
    const licenseFile = recipe.licenseFile ?? "LICENSE";
    const licensePath = path.join(source, licenseFile);
    if (fs.existsSync(licensePath)) license = fs.readFileSync(licensePath);
    else license = await download(recipe.repository.replace("https://github.com/", "https://raw.githubusercontent.com/") + "/" + recipe.revision + "/" + licenseFile);
    const resources = {};
    for (const notice of ["NOTICE", "NOTICE.txt"]) {
      if (fs.existsSync(path.join(source, notice))) resources["UPSTREAM-" + notice] = fs.readFileSync(path.join(source, notice));
    }
    if (recipe.license.startsWith("GPL-")) {
      resources["SOURCE-grammar.tar.gz"] = fs.readFileSync(archive);
      resources["SOURCE-grammar.json"] = strToU8(JSON.stringify({
        archive: "SOURCE-grammar.tar.gz", sha256: recipe.sha256,
        repository: recipe.repository, revision: recipe.revision,
        treeSitterCli: "0.27.0",
        build: ["tree-sitter", "build", "--wasm",
          (recipe.archiveRoot ?? recipe.crate + "-" + recipe.version) + "/" + (recipe.grammarPath ?? "."), "-o", "parser.wasm"],
      }, null, 2) + "\n");
    }
    return { wasm: fs.readFileSync(parser), highlights, license, resources };
  });
}

for (const language of names) {
    const plugin = plugins.get(language);
    const recipe = plugin.recipe;
    const directory = path.join(output, language);
    const { wasm, highlights, license, resources } = await buildGrammar(plugin, directory);
    const embeddedFiles = {};
    const injections = [];
    for (const declared of recipe.injections ?? []) {
      const embedded = plugins.get(declared.language);
      if (!embedded) throw new Error("Unknown embedded language: " + declared.language);
      const prefix = "embedded/" + declared.language + "/";
      const assets = await buildGrammar(embedded, path.join(directory, prefix), declared.highlightsInclude);
      const query = fs.readFileSync(path.join(plugin.directory, declared.query));
      embeddedFiles[prefix + "parser.wasm"] = assets.wasm;
      embeddedFiles[prefix + "highlights.scm"] = assets.highlights;
      embeddedFiles[prefix + "injections.scm"] = query;
      embeddedFiles[prefix + "LICENSE-grammar"] = assets.license;
      embeddedFiles[prefix + "NOTICE"] = fs.readFileSync(path.join(embedded.directory, "NOTICE"));
      for (const included of declared.highlightsInclude ?? []) {
        const dependency = plugins.get(included);
        const licensed = await withSource(dependency, async source => {
          const file = dependency.recipe.licenseFile ?? "LICENSE";
          const local = path.join(source, file);
          return fs.existsSync(local) ? fs.readFileSync(local) : download(dependency.recipe.repository.replace("https://github.com/", "https://raw.githubusercontent.com/") + "/" + dependency.recipe.revision + "/" + file);
        });
        embeddedFiles[prefix + "LICENSE-" + included] = licensed;
        embeddedFiles[prefix + "NOTICE-" + included] = fs.readFileSync(path.join(dependency.directory, "NOTICE"));
      }
      injections.push({
        id: declared.language, grammarName: embedded.manifest.contributes.language.grammarName ?? declared.language,
        parser: prefix + "parser.wasm", highlights: prefix + "highlights.scm", query: prefix + "injections.scm",
        parserSha256: digest(assets.wasm), highlightsSha256: digest(assets.highlights), querySha256: digest(query),
      });
    }
    const manifest = await prepareManifest({
      ...plugin.manifest,
      contributes: { ...plugin.manifest.contributes, language: {
        ...plugin.manifest.contributes.language,
        parserSha256: digest(wasm), highlightsSha256: digest(highlights),
        ...(injections.length ? {injections} : {}),
      } },
    }, catalog, { hostRepository: values["host-repo"] });
    writeJson(path.join(directory, "plugin.json"), manifest);
    writeJson(path.join(directory, "sample.json"), { source: recipe.sample, highlight: recipe.highlight });
    const files = {
      "plugin.json": strToU8(JSON.stringify(manifest, null, 2) + "\n"),
      "parser.wasm": wasm, "highlights.scm": highlights,
      "LICENSE": fs.readFileSync(path.join(plugin.directory, "LICENSE")),
      "LICENSE-grammar": license,
      "NOTICE": fs.readFileSync(path.join(plugin.directory, "NOTICE")),
      ...resources, ...embeddedFiles,
    };
    for (const [name, bytes] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(directory, name)), {recursive: true});
      fs.writeFileSync(path.join(directory, name), bytes);
    }
    fs.writeFileSync(path.join(output, manifest.id + "-" + manifest.version + ".zip"), zipSync(files));
    console.log("Built " + manifest.id + " " + manifest.version + " (" + wasm.length + " parser bytes)");
}
