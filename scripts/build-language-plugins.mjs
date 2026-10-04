import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { zipSync, strToU8 } from "fflate";
import { prepareManifest, writeJson } from "./release-plugin.mjs";

const root = path.resolve(import.meta.dirname, "..");
const recipes = JSON.parse(fs.readFileSync(path.join(root, "language-plugins/grammars.json")));
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "host-repo": { type: "string" },
    "tree-sitter": { type: "string", default: "tree-sitter" },
    output: { type: "string", default: path.join(root, "dist/languages") },
    version: { type: "string", default: "0.1.0" },
  },
});
const names = positionals[0] === "all" ? Object.keys(recipes) : positionals;
if (!names.length || names.some(name => !recipes[name])) throw new Error("Choose a language from language-plugins/grammars.json or all");
if (!execFileSync(values["tree-sitter"], ["--version"], { encoding: "utf8" }).startsWith("tree-sitter 0.27.0")) {
  throw new Error("Language packages require tree-sitter CLI 0.27.0");
}
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const output = path.resolve(values.output);
fs.mkdirSync(output, { recursive: true });
const catalog = JSON.parse(fs.readFileSync(path.join(root, "registry/v1/index.json")));

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error("Download failed: " + response.status + " " + url);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 50 * 1024 * 1024) throw new Error("Source archive exceeds size limit");
  return bytes;
}

for (const language of names) {
  const recipe = recipes[language];
  const archive = path.join(output, recipe.crate + "-" + recipe.version + ".crate");
  if (!fs.existsSync(archive)) {
    fs.writeFileSync(archive, await download("https://static.crates.io/crates/" + recipe.crate + "/" + recipe.crate + "-" + recipe.version + ".crate"));
  }
  if (digest(fs.readFileSync(archive)) !== recipe.sha256) throw new Error("Source archive checksum mismatch: " + language);
  const build = fs.mkdtempSync(path.join(output, ".build-"));
  try {
    execFileSync("tar", ["-xzf", archive, "-C", build]);
    const source = path.join(build, recipe.crate + "-" + recipe.version);
    const directory = path.join(output, language);
    fs.mkdirSync(directory, { recursive: true });
    const parser = path.join(directory, "parser.wasm");
    execFileSync(values["tree-sitter"], ["build", "--wasm", path.join(source, recipe.grammarPath ?? "."), "-o", parser], { stdio: "inherit" });
    const override = path.join(root, "language-plugins", language + "-highlights.scm");
    const highlights = fs.readFileSync(fs.existsSync(override) ? override : path.join(source, "queries/highlights.scm"));
    fs.writeFileSync(path.join(directory, "highlights.scm"), highlights);
    let license;
    const licenseFile = recipe.licenseFile ?? "LICENSE";
    const licensePath = path.join(source, licenseFile);
    if (fs.existsSync(licensePath)) license = fs.readFileSync(licensePath);
    else license = await download(recipe.repository.replace("https://github.com/", "https://raw.githubusercontent.com/") + "/" + recipe.revision + "/" + licenseFile);
    const wasm = fs.readFileSync(parser);
    const manifest = await prepareManifest({
      id: "com.oxideterm.language." + language,
      name: recipe.name + " Language Support",
      version: values.version,
      description: "Syntax highlighting and folding for " + recipe.name + ".",
      author: "OxideTerm",
      repository: "https://github.com/AnalyseDeCircuit/oxideterm-plugins/tree/main/language-plugins",
      runtime: { kind: "language", entry: "parser.wasm" },
      contributes: { language: {
        id: language, highlights: "highlights.scm",
        parserSha256: digest(wasm), highlightsSha256: digest(highlights),
      } },
    }, catalog, { hostRepository: values["host-repo"] });
    writeJson(path.join(directory, "plugin.json"), manifest);
    writeJson(path.join(directory, "sample.json"), { source: recipe.sample, highlight: recipe.highlight });
    const files = {
      "plugin.json": strToU8(JSON.stringify(manifest, null, 2) + "\n"),
      "parser.wasm": wasm, "highlights.scm": highlights, "LICENSE": license,
      "NOTICE": strToU8(recipe.crate + " " + recipe.version + "\n" + recipe.repository + "\nLicense: " + recipe.license + "\nCompiler: tree-sitter 0.27.0\n"),
    };
    if (fs.existsSync(override)) files["LICENSE-OxideTerm"] = fs.readFileSync(path.join(root, "LICENSE"));
    fs.writeFileSync(path.join(output, manifest.id + "-" + manifest.version + ".zip"), zipSync(files));
    console.log("Built " + manifest.id + " " + manifest.version + " (" + wasm.length + " parser bytes)");
  } finally {
    fs.rmSync(build, { recursive: true, force: true });
  }
}
