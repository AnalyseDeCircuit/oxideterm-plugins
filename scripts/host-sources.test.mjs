import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import test from 'node:test';
import { unzipSync } from 'fflate';

const require = createRequire(import.meta.url), repo = path.resolve(import.meta.dirname, '..');
const tailscale = require('../plugins/tailscale-hosts/source.cjs');
const ansible = require('../plugins/ansible-inventory/source.cjs');
const tailscaleData = { BackendState: 'Running', Self: { PublicKey: 'self' }, Peer: {
  self: { HostName: 'This computer', TailscaleIPs: ['100.64.0.1'] },
  off: { HostName: 'Offline server', Online: false, TailscaleIPs: ['100.64.0.2'] },
  on: { HostName: 'Build server', Online: true, TailscaleIPs: ['fd7a::3', '100.64.0.3'], UserID: 42, Private: 'secret-user-metadata' },
  ipv6: { DNSName: 'ipv6.example.ts.net.', Online: true, TailscaleIPs: ['fd7a::4'] },
  invalid: { HostName: 'Invalid', TailscaleIPs: ['not-an-address'] },
} };
const inventoryData = { _meta: { hostvars: {
  app: { ansible_host: '192.0.2.10', ansible_port: '2222', ansible_user: 'deploy', ansible_password: 'secret-password', ansible_ssh_private_key_file: '/private/key', private_fact: 'private-fact' },
  alias: {},
  local: { ansible_connection: 'local' },
  unresolved: { ansible_host: '{{ target }}' },
  invalid: { ansible_port: 99999 },
} }, all: { children: ['production'] }, production: { children: ['web'] }, web: { hosts: ['app', 'alias'], children: ['production'] } };

test('Tailscale selects valid network addresses and sorts online peers without exposing peer metadata', () => {
  assert.deepEqual(tailscale.parse(tailscaleData), { hosts: [
    { name: 'Build server', host: '100.64.0.3', port: 22, username: '', group: 'Tailscale', online: true },
    { name: 'ipv6.example.ts.net', host: 'fd7a::4', port: 22, username: '', group: 'Tailscale', online: true },
    { name: 'Offline server', host: '100.64.0.2', port: 22, username: '', group: 'Tailscale', online: false },
  ], skipped: 1 });
  assert.deepEqual(tailscale.parse({ BackendState: 'Running', Peer: null }), { hosts: [], skipped: 0 });
  assert.throws(() => tailscale.parse({ BackendState: 'NeedsLogin' }), error => error === 'notRunning');
});

test('Ansible consumes resolved hostvars, handles group cycles and excludes credentials and unsupported transports', () => {
  assert.deepEqual(ansible.parse(inventoryData), { hosts: [
    { name: 'alias', host: 'alias', port: 22, username: '', group: 'production' },
    { name: 'app', host: '192.0.2.10', port: 2222, username: 'deploy', group: 'production' },
  ], skipped: 3 });
  assert.deepEqual(ansible.args('/tmp/inventory with spaces; echo nope'), ['--list', '-i', '/tmp/inventory with spaces; echo nope']);
});

for (const [slug, data, expected] of [
  ['tailscale-hosts', tailscaleData, { name: 'Build server', host: '100.64.0.3', port: 22, username: '', group: 'Tailscale' }],
  ['ansible-inventory', inventoryData, { name: 'app', host: '192.0.2.10', port: 2222, username: 'deploy', group: 'production' }],
]) test(`${slug}: extracted package discovers through a child process and opens only a native connection draft`, { timeout: 15000 }, async t => {
  const zip = execFileSync(process.execPath, ['scripts/build-host-source.mjs', slug, '--package'], { cwd: repo, encoding: 'utf8' }).trim();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'host-source-'));
  for (const [name, bytes] of Object.entries(unzipSync(fs.readFileSync(zip)))) {
    const target = path.join(root, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { mode: name === 'bin/plugin' ? 0o755 : 0o644 });
  }
  const fake = path.join(root, 'fixture-client');
  const argsFile = path.join(root, 'args.json');
  fs.writeFileSync(fake, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));process.stdout.write(${JSON.stringify(JSON.stringify(data))});`, { mode: 0o755 });
  const child = spawn(path.join(root, 'bin/plugin'), [], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { child.kill(); fs.rmSync(root, { recursive: true, force: true }); });
  const pending = new Map(), calls = [];
  let schema, output = '', number = 0;
  const send = payload => child.stdin.write(JSON.stringify({ protocolVersion: 1, payload }) + '\n');
  createInterface({ input: child.stdout }).on('line', line => {
    output += line;
    const envelope = JSON.parse(line), { payload } = envelope;
    if (payload.result) assert.equal(envelope.requestId, payload.requestId);
    if (payload.type === 'registerContribution' && payload.registration.kind === 'tab') schema = payload.registration.metadata.schema;
    if (payload.type === 'callHostApi') {
      calls.push(payload);
      const value = payload.method === 'getLocale' ? 'en' : payload.method === 'getApiCatalog' ? [{ namespace: 'connections', method: 'openForm' }] : { queued: true };
      send({ requestId: payload.requestId, result: { status: 'ok', value } });
    } else if (payload.result) { pending.get(payload.requestId)?.(payload.result); pending.delete(payload.requestId); }
  });
  async function request(kind) {
    const requestId = `test-${++number}`, response = new Promise(resolve => pending.set(requestId, resolve));
    send({ requestId, kind }); const result = await response; assert.equal(result.status, 'ok'); return result.value;
  }
  const event = (controlId, type = 'click', value) => request({ type: 'sendEvent', event: { name: 'ui.event', payload: { controlId, type, value } } });
  await request({ type: 'activate' });
  assert.equal(fs.existsSync(argsFile), false, 'activation must not execute dynamic inventories');
  await event('executable', 'input', fake);
  await event('inventory', 'input', '/tmp/inventory with spaces; echo nope');
  await event('refresh');
  assert.deepEqual(JSON.parse(fs.readFileSync(argsFile)), slug === 'tailscale-hosts' ? ['status', '--json'] : ['--list', '-i', '/tmp/inventory with spaces; echo nope']);
  await event('search', 'input', expected.name);
  const flatten = controls => controls.flatMap(control => [control, ...flatten(control.children || [])]);
  const controls = flatten(schema.controls), connect = controls.find(control => control.id?.startsWith('connect-'));
  assert.ok(controls.some(control => control.label === expected.name));
  await event(connect.id);
  assert.deepEqual(calls.at(-1).args, expected);
  assert.equal(calls.at(-1).namespace + '.' + calls.at(-1).method, 'connections.openForm');
  assert.doesNotMatch(output, /secret-password|secret-user-metadata|private-fact|\/private\/key/);
  assert.equal(calls.some(call => ['connect', 'set', 'applySavedConnectionsSnapshot'].includes(call.method)), false);
  await event('executable', 'input', path.join(root, 'missing-client'));
  await event('refresh');
  assert.ok(flatten(schema.controls).some(control => control.kind === 'alert' && control.label.includes('Client not found')));
  assert.equal(flatten(schema.controls).some(control => control.id?.startsWith('connect-')), false, 'failed refresh must discard stale hosts');
  await request({ type: 'deactivate' });
});

test('source plugins have complete translations and register only a tab', () => {
  for (const slug of ['tailscale-hosts', 'ansible-inventory']) {
    const root = path.join(repo, 'plugins', slug), keys = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'locales/en.json')))).sort();
    assert.deepEqual(fs.readdirSync(path.join(root, 'locales')).sort(), ['de', 'en', 'es-ES', 'fr-FR', 'it', 'ja', 'ko', 'pt-BR', 'vi', 'zh-CN', 'zh-TW'].map(locale => locale + '.json').sort());
    for (const locale of fs.readdirSync(path.join(root, 'locales'))) assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'locales', locale)))).sort(), keys);
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'))).contributes), ['tabs']);
  }
});

test('closing the owner pipe terminates an in-progress discovery client', { timeout: 5000 }, async t => {
  const guard = spawn(process.execPath, [path.join(repo, 'packages/host-sources/client.cjs'), process.execPath, '-e', 'console.log(process.pid);setInterval(()=>{},1000)']);
  t.after(() => guard.kill());
  const lines = createInterface({ input: guard.stdout });
  const [line] = await once(lines, 'line');
  const pid = Number(line);
  assert.equal(process.kill(pid, 0), true);
  const exited = once(guard, 'close');
  guard.stdin.end();
  await exited;
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
