import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { unzipSync } from 'fflate';

const protocol = process.argv[2];
if (!['rdp', 'vnc'].includes(protocol)) throw new Error('Choose rdp or vnc');
const root = path.resolve(import.meta.dirname, '..', 'plugins', protocol);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json')));
const packages = fs.readdirSync(path.join(root, 'dist')).filter(file => file.startsWith(`${protocol}-${manifest.version}-`) && file.endsWith('.zip'));
if (packages.length !== 1) throw new Error('Verify exactly one native package per runner');
const files = unzipSync(fs.readFileSync(path.join(root, 'dist', packages[0])));
const archived = JSON.parse(Buffer.from(files['plugin.json']).toString());
assert.equal(archived.id, `com.oxideterm.remote-desktop.${protocol}`);
assert.equal(archived.runtime.kind, 'remote-desktop');
assert.equal(archived.engines.oxideterm, '>2.2.1');
assert.equal(archived.contributes.remoteDesktop.protocol, protocol);
assert.equal(archived.contributes.remoteDesktop.protocolVersion, 1);
assert.equal(archived.contributes.remoteDesktop.capabilities.binaryFrames, true);
assert(files['THIRD_PARTY_NOTICES.txt'], 'Package must carry dependency notices');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'oxideterm-desktop-package-'));
try {
  for (const [name, bytes] of Object.entries(files)) {
    const file = path.resolve(temporary, name);
    assert(file.startsWith(temporary + path.sep), 'Archive path must remain inside the extraction directory');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
  const executable = path.join(temporary, archived.runtime.entry);
  fs.chmodSync(executable, 0o755);
  // Exercise the executable extracted from the archive and the unchanged binary
  // framing contract. Engine tests separately exercise protocol negotiation.
  const child = spawn(executable, ['--stdio', '--fake'], { cwd: temporary, stdio: ['pipe', 'pipe', 'pipe'] });
  const timeout = setTimeout(() => child.kill(), 15000);
  let stderr = '';
  const chunks = [];
  child.stdout.on('data', chunk => chunks.push(chunk));
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const requests = [
    { type: 'startConnect', protocol, endpoint: { host: '127.0.0.1', port: protocol === 'rdp' ? 3389 : 5900 }, size: { width: 200, height: 120 }, readOnly: false },
    { type: 'text', text: 'Unicode ✓' },
    { type: 'releaseAllInputs' },
    { type: 'resize', size: { width: 240, height: 160 } },
    { type: 'close' },
  ];
  child.stdin.end(requests.map(request => JSON.stringify(request) + '\n').join(''));
  const exit = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal }));
  }).finally(() => clearTimeout(timeout));
  assert.deepEqual(exit, { code: 0, signal: null }, stderr);
  const output = Buffer.concat(chunks);
  const events = [];
  let offset = 0;
  while (offset < output.length) {
    const newline = output.indexOf(10, offset);
    assert(newline >= offset, 'Every header must end with a newline');
    const header = JSON.parse(output.subarray(offset, newline).toString());
    offset = newline + 1;
    if (header.type === 'frameBinary') {
      assert.equal(header.format, 'rgba8');
      assert.equal(header.compression, 'none');
      assert.equal(header.payloadLen, header.size.width * header.size.height * 4);
      const payload = output.subarray(offset, offset + header.payloadLen);
      assert.equal(payload.length, header.payloadLen);
      for (let pixel = 0; pixel < payload.length / 4; pixel++) {
        const stripe = Math.floor(pixel / header.size.width) % 255;
        assert.deepEqual([...payload.subarray(pixel * 4, pixel * 4 + 4)], [protocol === 'rdp' ? 0x30 : 0x80, stripe, 255 - stripe, 255]);
      }
      offset += header.payloadLen;
    }
    events.push(header);
  }
  assert.deepEqual(events.map(event => event.type), ['status', 'connected', 'frameBinary', 'connected', 'frameBinary', 'disconnected']);
  assert.deepEqual(events.filter(event => event.type === 'connected').map(event => event.size), [{ width: 200, height: 120 }, { width: 240, height: 160 }]);
  console.log(`Verified ${packages[0]}: connect, binary pixels, input, resize and close`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
