import fs from "node:fs";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugin.json")));
const targets = { "darwin-arm64": "aarch64-apple-darwin", "darwin-x64": "x86_64-apple-darwin", "linux-arm64": "aarch64-unknown-linux-gnu", "linux-x64": "x86_64-unknown-linux-gnu", "win32-x64": "x86_64-pc-windows-msvc", "win32-arm64": "aarch64-pc-windows-msvc" };
const target = targets[`${process.platform}-${process.arch}`];
if (!target) throw new Error("Unsupported package platform");
if (process.env.PDF_PREVIEW_TARGET && process.env.PDF_PREVIEW_TARGET !== target) throw new Error("Package target does not match the runner architecture");
const binary = process.platform === "win32" ? "pdf-preview.exe" : "pdf-preview";
manifest.runtime.entry = `bin/${binary}`;
const files = { "plugin.json": strToU8(JSON.stringify(manifest, null, 2) + "\n") };
function add(relative) {
  const file = path.join(root, relative);
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) throw new Error(`Symlink in package: ${relative}`);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(file)) add(`${relative}/${entry}`);
  } else files[relative] = [fs.readFileSync(file), { os: 3, attrs: ((relative.startsWith("bin/") ? 0o100755 : 0o100644) << 16) >>> 0 }];
}
for (const file of [`bin/${binary}`, "lib", "LICENSE", "README.md", "README.en.md"]) add(file);
const zip = zipSync(files, { level: 6 });
if (zip.length > 50 * 1024 * 1024) throw new Error("Plugin exceeds package size limit");
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const destination = path.join(root, "dist", `pdf-preview-${manifest.version}-${target}.zip`);
fs.writeFileSync(destination, zip);
console.log(destination);
