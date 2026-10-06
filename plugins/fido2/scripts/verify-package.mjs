import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { unzipSync } from 'fflate';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json')));
const packages = fs.readdirSync(path.join(root, 'dist')).filter(name => name.startsWith(`fido2-${manifest.version}-`) && name.endsWith('.zip'));
assert.equal(packages.length, 1, 'Expected one package for the current native runner');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oxideterm-fido2-'));
function frame(value) {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4); header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}
function messages(bytes) {
  const result = [];
  while (bytes.length) {
    assert.ok(bytes.length >= 4);
    const length = bytes.readUInt32BE();
    assert.ok(length > 0 && length <= 65536 && bytes.length >= length + 4);
    result.push(JSON.parse(bytes.subarray(4, length + 4)));
    bytes = bytes.subarray(length + 4);
  }
  return result;
}
try {
  const archive = unzipSync(fs.readFileSync(path.join(root, 'dist', packages[0])));
  for (const [name, bytes] of Object.entries(archive)) {
    assert.ok(!name.startsWith('/') && !name.includes('\\') && !name.split('/').includes('..'));
    const destination = path.join(directory, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { mode: name.startsWith('bin/') ? 0o755 : 0o644 });
  }
  const packaged = JSON.parse(fs.readFileSync(path.join(directory, 'plugin.json')));
  const entry = `bin/fido2${process.platform === 'win32' ? '.exe' : ''}`;
  assert.equal(packaged.id, manifest.id);
  assert.equal(packaged.version, manifest.version);
  assert.deepEqual(packaged.runtime, { kind: 'helper', entry });
  assert.deepEqual(packaged.contributes, { helper: { feature: 'ssh-authentication', protocol: 'oxideterm-security-key', protocolVersion: 1 } });
  const executable = path.join(directory, entry);
  const result = spawnSync(executable, ['--stdio'], { input: frame({ type: 'pin', value: 'synthetic-secret-PIN' }), timeout: 5000, env: { ...process.env, DYLD_LIBRARY_PATH: '', LD_LIBRARY_PATH: '' } });
  assert.equal(result.status, 0);
  assert.deepEqual(messages(result.stdout), [{ type: 'ready', protocol_version: 1 }, { type: 'failure', code: 'invalidRequest' }]);
  assert.ok(!result.stderr.includes('synthetic-secret-PIN'));
  if (process.platform === 'darwin') for (const file of [executable, ...Object.keys(archive).filter(name => name.startsWith('lib/')).map(name => path.join(directory, name))]) {
    const libraries = execFileSync('otool', ['-L', file], { encoding: 'utf8' });
    assert.ok(!libraries.includes('/opt/homebrew/') && !libraries.includes('/usr/local/'), 'Package depends on a development-only library');
  }
  if (process.argv.includes('--no-device')) {
    const result = spawnSync(executable, ['--stdio'], { input: frame({ type: 'sign', algorithm: 'sk-ssh-ed25519@openssh.com', application: 'ssh:fixture', key_handle: [1, 2, 3], flags: 1, challenge: [83, 83, 72] }), timeout: 5000 });
    assert.equal(result.status, 0);
    assert.deepEqual(messages(result.stdout), [{ type: 'ready', protocol_version: 1 }, { type: 'failure', code: 'noDevice' }]);
  }
  console.log('Verified archived FIDO provider identity, private protocol, redacted errors and standalone loading.');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
