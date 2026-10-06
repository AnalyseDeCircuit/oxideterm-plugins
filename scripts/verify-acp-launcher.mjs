import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { unzipSync } from 'fflate';

const repository = path.resolve(import.meta.dirname, '..');
const plugin = process.argv[2];
const root = path.join(repository, 'plugins', plugin);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json')));
const target = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)[1];
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'oxideterm ACP launcher '));
let child;
let closed;
let descendantPid;
try {
  const files = unzipSync(fs.readFileSync(path.join(root, 'dist', `${plugin}-${manifest.version}-${target}.zip`)));
  const packaged = JSON.parse(Buffer.from(files['plugin.json']).toString('utf8'));
  assert.equal(packaged.id, manifest.id);
  assert.equal(packaged.version, manifest.version);
  assert.deepEqual(packaged.engines, manifest.engines);
  assert.deepEqual(packaged.tags, ['acp']);
  assert.equal(packaged.runtime.kind, 'acp');
  assert.equal(packaged.runtime.entry, `bin/${plugin}${process.platform === 'win32' ? '.exe' : ''}`);
  for (const [name, bytes] of Object.entries(files)) {
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw new Error('Invalid package path');
    const destination = path.join(temporary, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { mode: name === packaged.runtime.entry ? 0o755 : 0o644 });
  }
  const launcherCrate = path.join(repository, 'crates/oxideterm-acp-launcher');
  execFileSync('cargo', ['build', '--locked', '--manifest-path', path.join(launcherCrate, 'Cargo.toml'), '--example', 'fixture'], { stdio: 'inherit' });
  const fixture = path.join(launcherCrate, 'target/debug/examples', `fixture${process.platform === 'win32' ? '.exe' : ''}`);
  const literal = 'project with spaces 中文 $(touch forbidden)';
  let executable = fixture;
  let cursorScript;
  if (plugin === 'cursor-acp' && process.platform === 'win32') {
    const directory = path.join(temporary, 'installed Cursor', 'versions', '2026.10.01-abcd');
    fs.mkdirSync(directory, { recursive: true });
    fs.copyFileSync(fixture, path.join(directory, 'node.exe'));
    cursorScript = path.join(directory, 'index.js');
    fs.writeFileSync(cursorScript, 'fixture entry');
    executable = path.join(temporary, 'installed Cursor', 'cursor-agent.cmd');
    fs.writeFileSync(executable, 'This wrapper must never be interpreted.');
  }
  child = spawn(path.join(temporary, packaged.runtime.entry), ['--command', executable, literal], {
    cwd: temporary, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, OXIDETERM_LAUNCHER_FIXTURE: 'fixture-value' },
  });
  closed = once(child, 'close');
  child.stderr.resume();
  const initialized = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Launcher initialization timed out')), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', () => { clearTimeout(timer); reject(new Error('Launcher exited before initialization')); });
    createInterface({ input: child.stdout }).on('line', line => {
      try {
        const message = JSON.parse(line);
        if (message.id !== 1) return;
        clearTimeout(timer);
        resolve(message.result);
      } catch { /* Only a protocol response can satisfy initialization. */ }
    });
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: {} } }) + '\n');
  const response = await initialized;
  descendantPid = response._meta.descendantPid;
  assert.equal(response.protocolVersion, 1);
  assert.deepEqual(response.agentInfo, { name: 'launcher-fixture', version: '1.0.0' });
  const defaults = {
    'opencode-acp': ['acp'],
    'antigravity-acp': process.platform === 'linux' ? ['--uid='] : [],
    'grok-acp': ['agent', 'stdio'],
    'cursor-acp': cursorScript ? [cursorScript, 'acp'] : ['acp'],
  };
  const expectedArgs = [...defaults[plugin], literal];
  assert.deepEqual(response._meta.arguments, expectedArgs);
  assert.equal(response._meta.cwd, fs.realpathSync(temporary));
  assert.equal(response._meta.environment, 'fixture-value');
  stopLauncher();
  await closed;
  const deadline = Date.now() + 3000;
  while (processExists(descendantPid) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(processExists(descendantPid), false, 'Stopping the launcher must retire its descendant');
  console.log(`${plugin}: packaged identity, exact arguments, inherited streams, cwd/env and process-tree retirement verified on ${target}`);
} finally {
  if (child && child.exitCode === null && child.signalCode === null) stopLauncher();
  if (closed) await closed;
  if (descendantPid && processExists(descendantPid)) { try { process.kill(descendantPid); } catch {} }
  fs.rmSync(temporary, { recursive: true, force: true });
}

function stopLauncher() {
  if (process.platform === 'win32') child.kill();
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
}

function processExists(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
