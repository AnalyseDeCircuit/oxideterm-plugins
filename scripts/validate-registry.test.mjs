import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { validateHistory, validateRegistry } from "./validate-registry.mjs";

const published = JSON.parse(fs.readFileSync(new URL("../registry/v1/index.json", import.meta.url), "utf8"));

function withUpdate() {
  const catalog = structuredClone(published);
  const plugin = catalog.plugins[0];
  plugin.releases.push({
    version: "1.0.0",
    engines: { oxideterm: ">=2.3.0, <3.0.0" },
    packages: [{
      target: "any",
      downloadUrl: "https://example.com/plugin/v1.0.0/plugin.zip",
      checksum: "a".repeat(64),
      size: 1234,
    }],
  });
  return catalog;
}

test("history adoption and later releases preserve the legacy client record", () => {
  const legacy = structuredClone(published);
  delete legacy.plugins[0].releases;
  validateHistory(legacy, published);
  const updated = withUpdate();
  updated.plugins[0].description = "Revised marketplace description";
  updated.plugins[0].releases.reverse();
  validateHistory(published, updated);
  assert.equal(updated.plugins[0].version, "0.3.0");
  assert.equal(updated.plugins[0].releases[0].version, "1.0.0");
});

test("published versions, requirements, packages and legacy fields cannot be replaced", () => {
  const previous = withUpdate();
  for (const [name, mutate] of [
    ["release removal", p => p.releases.pop()],
    ["host range", p => { p.releases[1].engines.oxideterm = ">=2.4.0"; }],
    ["download URL", p => { p.releases[1].packages[0].downloadUrl = "https://example.com/replaced.zip"; }],
    ["checksum", p => { p.releases[1].packages[0].checksum = "b".repeat(64); }],
    ["size", p => { p.releases[1].packages[0].size += 1; }],
    ["legacy minimum", p => { p.minOxideTermVersion = "2.2.0"; }],
  ]) {
    const next = structuredClone(previous);
    mutate(next.plugins[0]);
    assert.throws(() => validateHistory(previous, next), /published release|legacy snapshot/, name);
  }
  assert.throws(() => validateHistory(previous, { version: 1, plugins: [] }), /history was removed/);
});

test("release metadata rejects ambiguous versions, invalid ranges and unusable packages", () => {
  for (const [name, mutate, error] of [
    ["duplicate precedence", p => p.releases.push({ ...p.releases[1], version: "1.0.0+build" }), /duplicate release/],
    ["invalid semver", p => { p.releases[1].version = "01.0.0"; }, /semantic version/],
    ["missing host range", p => { delete p.releases[1].engines; }, /engines.oxideterm/],
    ["npm-only range", p => { p.releases[1].engines.oxideterm = ">=2.0.0 || <1.0.0"; }, /explicit host comparators/],
    ["missing package", p => { p.releases[1].packages = []; }, /at least one package/],
    ["checksum", p => { p.releases[1].packages[0].checksum = "bad"; }, /SHA-256/],
    ["missing legacy", p => p.releases.shift(), /legacy package record/],
  ]) {
    const next = withUpdate();
    mutate(next.plugins[0]);
    assert.throws(() => validateRegistry(next), error, name);
  }
});
