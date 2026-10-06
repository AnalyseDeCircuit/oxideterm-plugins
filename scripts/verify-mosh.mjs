import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { unzipSync } from 'fflate';

const root = path.resolve(import.meta.dirname, '..', 'plugins', 'mosh');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json')));
const packages = fs.readdirSync(path.join(root, 'dist')).filter(file => file.startsWith(`mosh-${manifest.version}-`) && file.endsWith('.zip'));
assert.equal(packages.length, 1, 'Verify one native target package per runner');
const files = unzipSync(fs.readFileSync(path.join(root, 'dist', packages[0])));
const archived = JSON.parse(Buffer.from(files['plugin.json']).toString());
assert.equal(archived.id, 'com.oxideterm.terminal.mosh');
assert.equal(archived.runtime.kind, 'terminal-transport');
assert.deepEqual(archived.tags, ['remote-connections']);
assert.equal(archived.engines.oxideterm, '>=2.2.2');
assert.deepEqual(archived.contributes, { terminalTransport: { protocol: 'mosh', protocolVersion: 1 } });
assert(files['THIRD_PARTY_NOTICES.txt']);
assert(Buffer.from(files['NOTICE']).toString().includes('FerNomade'));
assert(Buffer.from(files['LICENSE.fernomade']).toString().includes('Apache License'));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oxideterm-mosh-package-'));
let child;
try {
  for (const [name, bytes] of Object.entries(files)) {
    const file = path.resolve(directory, name);
    assert(file.startsWith(directory + path.sep));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
  const executable = path.join(directory, archived.runtime.entry);
  fs.chmodSync(executable, 0o755);
  child = spawn(executable, ['--verify-stdio'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const ended = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Mosh verifier exited: ${code}/${signal}`)));
  });
  const frames = [];
  let buffer = Buffer.alloc(0);
  let wake;
  child.stdout.on('data', bytes => {
    buffer = Buffer.concat([buffer, bytes]);
    while (buffer.length >= 5 && buffer.length >= 5 + buffer.readUInt32BE(1)) {
      const length = buffer.readUInt32BE(1);
      assert(length <= 65536);
      frames.push({ kind: buffer[0], bytes: Buffer.from(buffer.subarray(5, 5 + length)) });
      buffer = buffer.subarray(5 + length);
    }
    wake?.();
  });
  const frame = (kind, bytes) => {
    const header = Buffer.alloc(5);
    header[0] = kind;
    header.writeUInt32BE(bytes.length, 1);
    return Buffer.concat([header, bytes]);
  };
  const send = value => child.stdin.write(frame(0, Buffer.from(JSON.stringify(value))));
  const next = async () => {
    const deadline = Date.now() + 5000;
    while (!frames.length) {
      assert(Date.now() < deadline, 'Mosh verifier frame timeout');
      await new Promise(resolve => { wake = resolve; setTimeout(resolve, 25); });
    }
    return frames.shift();
  };
  send({ Start: { version: 1, host: '127.0.0.1', port: 60000, family: 'Ipv4', columns: 80, rows: 24, key: 'AQIDBAUGBwgJCgsMDQ4PEA' } });
  assert.deepEqual(JSON.parse((await next()).bytes), { Ready: { version: 1 } });
  const input = Buffer.concat([Buffer.from('中文\n'), Buffer.from([0, 0xff, 0x1b])]);
  const prediction = Buffer.alloc(8); prediction.writeBigUInt64BE(7n);
  const encoded = frame(1, Buffer.concat([prediction, input]));
  // Fragmented stdin exercises the binary reader rather than line-based parsing.
  for (const byte of encoded) child.stdin.write(Buffer.from([byte]));
  const output = await next();
  assert.equal(output.kind, 2); assert.deepEqual(output.bytes, input);
  assert.deepEqual(JSON.parse((await next()).bytes), { PredictionAcknowledged: 7 });
  send({ Resize: { columns: 132, rows: 43 } });
  assert.deepEqual(JSON.parse((await next()).bytes), { RemoteResize: { columns: 132, rows: 43 } });
  send('Shutdown');
  assert.deepEqual(JSON.parse((await next()).bytes), { Closed: 'Acknowledged' });
  await ended;
  console.log(`Verified native Mosh package: ${packages[0]}`);
} finally {
  child?.kill();
  fs.rmSync(directory, { recursive: true, force: true });
}
