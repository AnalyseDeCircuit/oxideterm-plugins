import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import { zipSync, strToU8 } from "fflate";
import { prepareManifest, recordRelease, correctCompatibility } from "./release-plugin.mjs";
import { validateHistory } from "./validate-registry.mjs";

const empty = { version: 1, plugins: [] };
const manifest = { id: "com.example.release", name: "Release", version: "1.0.0", engines: { oxideterm: ">=2.0.0" } };

test("creation reads the host and ordinary updates inherit without consulting a newer host", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oxideterm-release-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const host = path.join(root, "host");
  fs.mkdirSync(path.join(host, "src"), { recursive: true });
  fs.writeFileSync(path.join(host, "Cargo.toml"), '[package]\nname = "oxideterm-gpui-app"\nversion = "2.4.0"\nedition = "2021"\n');
  fs.writeFileSync(path.join(host, "src/main.rs"), "fn main() {}");
  const created = path.join(root, "plugin");
  execFileSync(process.execPath, [
    path.resolve(import.meta.dirname, "create-plugin.mjs"), created,
    "--type", "manifest", "--id", manifest.id, "--name", "Release",
    "--author", "Example", "--host-repo", host,
  ]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(created, "plugin.json"))).engines, { oxideterm: ">=2.4.0" });

  const zip = path.join(root, "plugin.zip");
  fs.writeFileSync(zip, zipSync({ "plugin.json": strToU8(JSON.stringify(manifest)) }));
  const published = recordRelease(empty, manifest, "https://example.com/releases/v1.0.0", ["any=" + zip]);
  const next = { ...manifest, version: "1.1.0" };
  assert.deepEqual((await prepareManifest(next, published, { hostRepository: "/unused/host" })).engines, { oxideterm: ">=2.0.0" });
  assert.deepEqual((await prepareManifest(next, published, { hostRepository: host, requiresCurrentApp: true })).engines, { oxideterm: ">=2.4.0" });
  assert.deepEqual((await prepareManifest(next, published, { hostRange: ">=2.1.0, <3.0.0" })).engines, { oxideterm: ">=2.1.0, <3.0.0" });
  await assert.rejects(prepareManifest(manifest, published), /already published/);

  const language = { id: "com.example.language", name: "Language", version: "0.1.0", runtime: { kind: "language", entry: "parser.wasm" } };
  assert.deepEqual((await prepareManifest(language, empty, { hostRepository: host })).engines, { oxideterm: ">=2.4.0" });
  fs.writeFileSync(path.join(host, "Cargo.toml"), '[package]\nname = "oxideterm-gpui-app"\nversion = "2.2.0"\nedition = "2021"\n');
  const prepared = await prepareManifest(language, empty, { hostRepository: host });
  assert.deepEqual(prepared.engines, { oxideterm: ">2.2.0" });
  fs.writeFileSync(zip, zipSync({ "plugin.json": strToU8(JSON.stringify(prepared)) }));
  const languages = recordRelease(empty, prepared, "https://example.com/releases/v0.1.0", ["any=" + zip]);
  assert.equal(languages.plugins[0].minOxidetermVersion, "2.2.1");
  assert.deepEqual((await prepareManifest({ ...language, version: "0.2.0" }, languages, { hostRepository: "/unused/host" })).engines, { oxideterm: ">2.2.0" });
});

test("recording reads the actual archive and corrections preserve assets and their audit history", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oxideterm-package-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const zip = path.join(root, "plugin.zip");
  const bytes = zipSync({ "plugin.json": strToU8(JSON.stringify(manifest)) });
  fs.writeFileSync(zip, bytes);
  const published = recordRelease(empty, manifest, "https://example.com/releases/v1.0.0", ["any=" + zip]);
  const release = published.plugins[0].releases[0];
  assert.deepEqual(release.packages, [{
    target: "any", downloadUrl: "https://example.com/releases/v1.0.0/plugin.zip",
    checksum: "sha256:" + createHash("sha256").update(bytes).digest("hex"), size: bytes.length,
  }]);
  assert.throws(() => recordRelease(published, manifest, "https://example.com/releases/v1.0.0", ["any=" + zip]), /already exists/);
  assert.throws(() => recordRelease(empty, { ...manifest, version: "2.0.0" }, "https://example.com/releases/v2.0.0", ["any=" + zip]), /does not match/);
  assert.throws(() => recordRelease(empty, manifest, "https://example.com/releases/v1.0.0", []), /package/);
  const corrected = correctCompatibility(published, manifest.id, manifest.version, ">=2.0.0, <3.0.0", "Host 3 removes the old API");
  validateHistory(published, corrected);
  assert.deepEqual(corrected.plugins[0].releases[0].packages, release.packages);
  assert.deepEqual(corrected.plugins[0].releases[0].engines, { oxideterm: ">=2.0.0" });
  assert.equal(corrected.plugins[0].releases[0].compatibilityCorrections[0].reason, "Host 3 removes the old API");
  const next = await prepareManifest({ ...manifest, version: "1.1.0" }, corrected);
  assert.deepEqual(next.engines, { oxideterm: ">=2.0.0, <3.0.0" });
  const tampered = structuredClone(corrected);
  tampered.plugins[0].releases[0].compatibilityCorrections[0].reason = "Changed history";
  assert.throws(() => validateHistory(corrected, tampered), /changed or removed/);
  assert.throws(() => validateHistory(corrected, published), /changed or removed/);
  const language = { ...manifest, runtime: { kind: "language", entry: "parser.wasm" } };
  fs.writeFileSync(zip, zipSync({ "plugin.json": strToU8(JSON.stringify(language)) }));
  const languageCatalog = recordRelease(empty, language, "https://example.com/releases/v1.0.0", ["any=" + zip]);
  assert.equal(languageCatalog.plugins[0].minOxidetermVersion, "2.0.0");
  assert.equal(languageCatalog.plugins[0].minOxideTermVersion, undefined);
});
