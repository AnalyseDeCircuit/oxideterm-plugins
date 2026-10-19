import fs from 'node:fs';
import assert from 'node:assert/strict';
const manifest = JSON.parse(fs.readFileSync(new URL('../plugin.json', import.meta.url)));
const locales = JSON.parse(fs.readFileSync(new URL('../locales.json', import.meta.url)));
const expected = ['de','en','es-ES','fr-FR','it','ja','ko','pt-BR','vi','zh-CN','zh-TW'];
assert.deepEqual(Object.keys(locales).sort(), expected.sort());
for (const dictionary of Object.values(locales)) assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(locales.en).sort());
for (const [locale, dictionary] of Object.entries(manifest.contributes.connections[0].form.translations)) {
  for (const [key,value] of Object.entries(dictionary)) assert.equal(value, locales[locale][key]);
}
assert.equal(manifest.engines.oxideterm, '>2.2.4');
assert.equal(manifest.runtime.kind, 'process');
assert.equal(manifest.id, 'com.oxideterm.mqtt');
console.log('MQTT manifest and all 11 locale dictionaries checked.');
