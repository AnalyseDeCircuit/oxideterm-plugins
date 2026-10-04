import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const recipe = JSON.parse(fs.readFileSync(path.join(root, "pdfium.json")));
const target = `${process.platform}-${process.arch}`;
const archive = recipe.archives[target];
if (!archive) throw new Error(`Unsupported build platform: ${target}`);
if (process.env.PDF_PREVIEW_TARGET) {
  const version = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  if (!version.split(/\r?\n/).includes(`host: ${process.env.PDF_PREVIEW_TARGET}`)) {
    throw new Error("Rust toolchain does not match the CI target");
  }
}
const cache = path.join(root, "dist", "pdfium", recipe.revision.replaceAll("/", "-"), target);
fs.mkdirSync(cache, { recursive: true });
const archivePath = path.join(cache, archive.name);
if (!fs.existsSync(archivePath)) {
  const url = `${recipe.repository}/releases/download/${recipe.revision}/${archive.name}`;
  console.log(`Downloading ${archive.name}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PDFium download failed: ${response.status}`);
  fs.writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
}
const digest = createHash("sha256").update(fs.readFileSync(archivePath)).digest("hex");
if (digest !== archive.sha256) throw new Error("PDFium checksum mismatch");
execFileSync("tar", ["-xzf", archivePath, "-C", cache], { stdio: "inherit" });
const library = process.platform === "darwin" ? "libpdfium.dylib" : process.platform === "win32" ? "pdfium.dll" : "libpdfium.so";
const source = path.join(cache, process.platform === "win32" ? "bin" : "lib", library);
fs.mkdirSync(path.join(root, "lib"), { recursive: true });
fs.copyFileSync(source, path.join(root, "lib", library));
// Preserve all upstream notices alongside the engine in every package.
for (const name of ["LICENSE", "licenses"]) {
  if (!fs.existsSync(path.join(cache, name))) throw new Error(`Missing PDFium notice: ${name}`);
  fs.cpSync(path.join(cache, name), path.join(root, "lib", name), { recursive: true });
}
execFileSync("cargo", ["build", "--release", "--locked"], { cwd: root, stdio: "inherit" });
const binary = process.platform === "win32" ? "pdf-preview.exe" : "pdf-preview";
fs.copyFileSync(path.join(root, "target", "release", binary), path.join(root, "bin", binary));
if (process.platform !== "win32") fs.chmodSync(path.join(root, "bin", binary), 0o755);
console.log(`Built PDF Preview for ${target}`);
