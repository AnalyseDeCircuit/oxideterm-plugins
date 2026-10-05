import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { WASI } from 'node:wasi';
import { unzipSync } from 'fflate';

const root = path.resolve(import.meta.dirname, '..');
const files = process.argv[2] ? unzipSync(fs.readFileSync(process.argv[2])) : null;
const read = name => files ? files[name] : fs.readFileSync(path.join(root, name));
const manifest = JSON.parse(new TextDecoder().decode(read('plugin.json')));
const locales = JSON.parse(new TextDecoder().decode(read('locales.json')));
assert.deepEqual(Object.keys(locales).sort(), ['de','en','es-ES','fr-FR','it','ja','ko','pt-BR','vi','zh-CN','zh-TW'].sort());
for (const messages of Object.values(locales)) assert.deepEqual(Object.keys(messages).sort(), Object.keys(locales.en).sort());
const wasi = new WASI({ version:'preview1', args:[], env:{}, preopens:{}, returnOnExit:true });
const { instance } = await WebAssembly.instantiate(read('plugin.wasm'), { wasi_snapshot_preview1:wasi.wasiImport });
wasi.start(instance);
const guest = instance.exports;
function decode(packed) {
  const pointer = Number(BigInt.asUintN(64, packed) >> 32n), length = Number(BigInt.asUintN(32, packed));
  return JSON.parse(new TextDecoder().decode(new Uint8Array(guest.memory.buffer, pointer, length)));
}
const registrations = decode(guest.oxideterm_plugin_drain_outbound());
// Registration kinds follow PluginRegistrationKind's kebab-case wire format.
assert.deepEqual(registrations.filter(x=>x.type==='registerContribution').map(x=>x.registration.kind), ['tab','context-menu']);
const schema = registrations[0].registration.metadata.schema;
assert.deepEqual(Object.keys(schema.translations).sort(), Object.keys(locales).sort());
assert.equal(schema.controls[0].kind, 'textWorkbench');
function checkLabels(value) {
  if (typeof value==='string' && value.startsWith('@')) {
    for (const [locale,messages] of Object.entries(locales)) assert.equal(typeof messages[value.slice(1)],'string',`${locale}: ${value}`);
  } else if (value && typeof value==='object') for(const child of Object.values(value)) checkLabels(child);
}
checkLabels(schema);
assert.deepEqual(registrations[1].registration.metadata.items, [{label:'@openMenu',tabId:'toolbox',controlId:'text'}]);
function run(command, input, parameter='') {
  const bytes = new TextEncoder().encode(JSON.stringify({requestId:'verify',kind:{type:'dispatchCommand',command,args:{input,parameter}},timeoutMs:5000}));
  const pointer = guest.oxideterm_plugin_alloc(bytes.length);
  new Uint8Array(guest.memory.buffer,pointer,bytes.length).set(bytes);
  const response = decode(guest.oxideterm_plugin_command(pointer,bytes.length));
  assert.equal(response.requestId,'verify');
  assert.equal(response.result.status,'ok');
  return response.result.value;
}
const decoded = run('base64.decode','eyJuIjo5MDA3MTk5MjU0NzQwOTkzfQ==').output;
assert.equal(decoded,'{"n":9007199254740993}');
const formatted = run('json.pretty', decoded).output;
assert.equal(formatted,'{\n  "n": 9007199254740993\n}');
assert.equal(run('json.pointer', formatted, '/n').output,'9007199254740993');
assert.equal(new Set(schema.controls[0].options.map(option=>option.value.group)).size,6);
assert.equal(run('time.seconds','0','Asia/Shanghai').output,'1970-01-01T08:00:00+08:00');
assert.equal(run('date.zone','2024-11-03T06:30:00Z','America/New_York').output,'2024-11-03T01:30:00-05:00');
assert.equal(run('hash.sha256','abc').output,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
assert.equal(run('text.ansi','\u001b[31mred\u001b[0m').output,'red');
assert.equal(run('hex.decode',run('url.decode','%36%31%36%32').output).output,'ab');
const uuid=run('generate.uuid','').output;
assert.match(uuid,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.notEqual(run('generate.uuid','').output,uuid);
for(const [command,pattern] of [['random.alphanumeric',/^[a-zA-Z0-9]{128}$/],['random.hex',/^[0-9a-f]{128}$/],['random.digits',/^[0-9]{128}$/]]) {
  assert.match(run(command,'','128').output,pattern);
}
for(const [command,input,parameter] of [['url.decode','%zz',''],['date.seconds','2024-11-03T01:30:00',''],['text.regex','token=fixture-secret','[']]) {
  const result=run(command,input,parameter);
  assert.ok(result.error && !('output' in result));
  assert.ok(!JSON.stringify(result).includes('fixture-secret'));
}
assert.equal(run('json.pretty','{"private-token":"fixture-secret",').error.code,'invalidJson');
assert.ok(!JSON.stringify(decode(guest.oxideterm_plugin_drain_outbound())).includes('fixture-secret'));
console.log(`Verified ${manifest.id}: WASI ABI, terminal entry, chained transformations and 11 locales.`);
