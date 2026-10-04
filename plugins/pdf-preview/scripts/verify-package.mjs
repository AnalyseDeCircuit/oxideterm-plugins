import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { unzipSync } from "fflate";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugin.json")));
const archives = fs.readdirSync(path.join(root, "dist")).filter(name =>
  name.startsWith(`pdf-preview-${manifest.version}-`) && name.endsWith(".zip"));
if (archives.length !== 1) throw new Error("Expected exactly one current-version platform package in dist");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "oxideterm-pdf-package-"));
try {
  const files = unzipSync(fs.readFileSync(path.join(root, "dist", archives[0])));
  for (const [name, bytes] of Object.entries(files)) {
    if (name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) throw new Error("Invalid package path");
    const target = path.join(directory, name);
    if (name.endsWith("/")) { fs.mkdirSync(target, { recursive: true }); continue; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { mode: name.startsWith("bin/") ? 0o755 : 0o644 });
  }
  const packaged = JSON.parse(fs.readFileSync(path.join(directory, "plugin.json")));
  if (packaged.id !== manifest.id || packaged.version !== manifest.version) throw new Error("Wrong packaged plugin identity");
  const entry = process.platform === "win32" ? "bin/pdf-preview.exe" : "bin/pdf-preview";
  if (packaged.runtime?.kind !== "process" || packaged.runtime.entry !== entry) throw new Error("Wrong packaged runtime entry");
  execFileSync("cargo", ["test", "--locked", "--test", "protocol"], {
    cwd: root, stdio: "inherit", env: { ...process.env, PDF_PREVIEW_PACKAGE_DIR: directory },
  });
  console.log(`Verified rendering from ${archives[0]}`);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
