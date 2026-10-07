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
const manifest = { id: "com.example.release", name: "Release", version: "1.0.0", license: "MIT", licenseUrl: "https://example.com/LICENSE", engines: { oxideterm: ">=2.0.0" } };

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
  fs.writeFileSync(path.join(host, "Cargo.toml"), '[package]\nname = "oxideterm-gpui-app"\nversion = "2.2.1"\nedition = "2021"\n');
  const acp = { id: "com.example.acp", name: "ACP Agent", version: "0.1.0", runtime: { kind: "acp", entry: "bin/agent" } };
  const preparedAcp = await prepareManifest(acp, empty, { hostRepository: host });
  assert.deepEqual(preparedAcp.engines, { oxideterm: ">2.2.1" });
  const desktop = { ...acp, id: "com.example.vnc", runtime: { kind: "remote-desktop", entry: "bin/helper" } };
  assert.deepEqual((await prepareManifest(desktop, empty, { hostRepository: host })).engines, { oxideterm: ">2.2.1" });
  const mosh = { ...acp, id: "com.example.mosh", runtime: { kind: "terminal-transport", entry: "bin/helper" } };
  assert.deepEqual((await prepareManifest(mosh, empty, { hostRepository: host })).engines, { oxideterm: ">=2.2.2" });
  const fido = { ...acp, id: "com.example.fido", runtime: { kind: "helper", entry: "bin/helper" } };
  assert.deepEqual((await prepareManifest(fido, empty, { hostRepository: host })).engines, { oxideterm: ">=2.2.2" });
});

test("recording reads the actual archive and corrections preserve assets and their audit history", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oxideterm-package-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const zip = path.join(root, "plugin.zip");
  const bytes = zipSync({ "plugin.json": strToU8(JSON.stringify(manifest)) });
  fs.writeFileSync(zip, bytes);
  const published = recordRelease(empty, manifest, "https://example.com/releases/v1.0.0", ["any=" + zip]);
  const release = published.plugins[0].releases[0];
  assert.equal(published.plugins[0].license, "MIT");
  assert.equal(published.plugins[0].licenseUrl, "https://example.com/LICENSE");
  assert.equal(published.plugins[0].minOxidetermVersion, "2.0.0");
  assert.equal(published.plugins[0].minOxideTermVersion, undefined);
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
  const language = { ...manifest, runtime: { kind: "language", entry: "parser.wasm" }, contributes: { language: { id: "elixir" } } };
  fs.writeFileSync(zip, zipSync({ "plugin.json": strToU8(JSON.stringify(language)) }));
  const languageCatalog = recordRelease(empty, language, "https://example.com/releases/v1.0.0", ["any=" + zip]);
  assert.equal(languageCatalog.plugins[0].minOxidetermVersion, "2.0.0");
  assert.equal(languageCatalog.plugins[0].minOxideTermVersion, undefined);
  assert.deepEqual(languageCatalog.plugins[0].tags, ["language"]);
  assert.deepEqual(languageCatalog.plugins[0].language, {id: "elixir"});
  const definition = {id: "custom-lang", displayName: "Custom Language", grammarName: "elixir", extensions: ["custom.expr"], fileNames: ["Customfile"]};
  const dynamic = {...language, engines: {oxideterm: ">=2.2.2"}, contributes: {language: {...definition, highlights: "highlights.scm", parserSha256: "a".repeat(64)}}};
  fs.writeFileSync(zip, zipSync({"plugin.json": strToU8(JSON.stringify(dynamic))}));
  assert.deepEqual(recordRelease(empty, dynamic, "https://example.com/releases/v1.0.0", ["any=" + zip]).plugins[0].language, definition);
  assert.throws(() => recordRelease(empty, {...dynamic, contributes: {language: {...dynamic.contributes.language, extensions: ["other"]}}}, "https://example.com/releases/v1.0.0", ["any=" + zip]), /does not match/);
  await assert.rejects(prepareManifest({...dynamic, engines: {oxideterm: ">=2.2.1"}}, empty), /Dynamic language declarations/);
  const embedded = {...language, engines: {oxideterm: ">=2.2.1"}, contributes: {language: {id: "html", injections: [{id: "typescript"}]}}};
  await assert.rejects(prepareManifest(embedded, empty), /Embedded language grammars/);
  assert.throws(() => recordRelease(empty, embedded, "https://example.com/releases/v1.0.0", ["any=" + zip]), /Embedded language grammars/);
  for (const invalid of [{id: "../lang"}, {...definition, extensions: ["*.expr"]}, {...definition, fileNames: ["dir/Customfile"]}]) {
    assert.throws(() => recordRelease(empty, {...dynamic, contributes: {language: invalid}}, "https://example.com/releases/v1.0.0", ["any=" + zip]), /Invalid language/);
  }
  const acp = { ...manifest, runtime: { kind: "acp", entry: "bin/agent" }, engines: { oxideterm: ">2.2.1" } };
  fs.writeFileSync(zip, zipSync({ "plugin.json": strToU8(JSON.stringify(acp)), "bin/agent": strToU8("fixture") }));
  const acpCatalog = recordRelease(empty, acp, "https://example.com/releases/v1.0.0", ["aarch64-apple-darwin=" + zip]);
  assert.deepEqual(acpCatalog.plugins[0].tags, ["acp"]);
  const desktop = { ...acp, runtime: { kind: "remote-desktop", entry: "bin/agent" } };
  fs.writeFileSync(zip, zipSync({ "plugin.json": strToU8(JSON.stringify(desktop)), "bin/agent": strToU8("fixture") }));
  assert.deepEqual(recordRelease(empty, desktop, "https://example.com/releases/v1.0.0", ["aarch64-apple-darwin=" + zip]).plugins[0].tags, ["remote-connections"]);
  const preview = { ...manifest, runtime: { kind: "process", entry: "bin/viewer" }, contributes: { filePreviews: [{ mimeTypes: ["application/pkix-cert"], command: "preview.render" }] } };
  fs.writeFileSync(zip, zipSync({ "plugin.json": strToU8(JSON.stringify(preview)), "bin/viewer": strToU8("fixture") }));
  const previewCatalog = recordRelease(empty, preview, "https://example.com/releases/v1.0.0", ["aarch64-apple-darwin=" + zip]);
  assert.deepEqual(previewCatalog.plugins[0].tags, ["preview"]);
  assert.equal(published.plugins[0].tags, undefined);
  const categorized = { ...manifest, tags: [" Utilities ", "utilities", "future-category"] };
  fs.writeFileSync(zip, zipSync({ "plugin.json": strToU8(JSON.stringify(categorized)) }));
  const categorizedCatalog = recordRelease(empty, categorized, "https://example.com/releases/v1.0.0", ["any=" + zip]);
  assert.deepEqual(categorizedCatalog.plugins[0].tags, ["utilities", "future-category"]);
});
