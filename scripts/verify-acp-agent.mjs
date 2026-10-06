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
if (['opencode-acp', 'antigravity-acp', 'grok-acp', 'cursor-acp'].includes(plugin)) {
  await import('./verify-acp-launcher.mjs');
  process.exit(0);
}
if (!['codex-acp', 'claude-code-acp'].includes(plugin)) throw new Error('Unknown ACP plugin');
const root = path.join(repository, 'plugins', plugin);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
const target = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)[1];
const archive = path.join(root, 'dist', `${plugin}-${manifest.version}-${target}.zip`);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'oxideterm ACP package '));
let child;
let exited;
const pending = new Map();
try {
  for (const [name, bytes] of Object.entries(unzipSync(fs.readFileSync(archive)))) {
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw new Error('Invalid archive path');
    const destination = path.join(temporary, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { mode: name.startsWith('bin/') ? 0o755 : 0o644 });
  }
  const packaged = JSON.parse(fs.readFileSync(path.join(temporary, 'plugin.json'), 'utf8'));
  assert.equal(packaged.id, manifest.id);
  assert.equal(packaged.version, manifest.version);
  assert.deepEqual(packaged.engines, manifest.engines);
  assert.deepEqual(packaged.tags, ['acp']);
  assert.equal(packaged.runtime.kind, 'acp');
  assert.equal(packaged.runtime.entry, `bin/${plugin}${process.platform === 'win32' ? '.exe' : ''}`);
  execFileSync('cargo', ['build', '--locked', '-p', 'oxideterm-acp-adapter', '--example', 'fixture'], { cwd: root, stdio: 'inherit' });
  const fixture = path.join(root, 'target/debug/examples', `fixture${process.platform === 'win32' ? '.exe' : ''}`);
  child = spawn(path.join(temporary, packaged.runtime.entry), ['--command', fixture], { stdio: ['pipe', 'pipe', 'pipe'] });
  exited = once(child, 'exit');
  let sequence = 0;
  let stage = 'initialize';
  const notifications = [];
  const send = value => child.stdin.write(JSON.stringify(value) + '\n');
  child.stderr.resume();
  createInterface({ input: child.stdout }).on('line', line => {
    const value = JSON.parse(line);
    if (value.method) notifications.push(value);
    else if (pending.has(value.id)) {
      const { resolve, reject, timer } = pending.get(value.id);
      clearTimeout(timer); pending.delete(value.id);
      if (value.error) reject(new Error(JSON.stringify(value.error)));
      else resolve(value.result);
    }
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reject(new Error(`ACP ${method} timed out during ${stage}`)), 15000);
    pending.set(id, { resolve, reject, timer });
    send({ jsonrpc: '2.0', id, method, params });
  });
  const initialized = await request('initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'package-verifier', version: '1' } });
  assert.equal(initialized.protocolVersion, 1);
  assert.equal(initialized.agentInfo.name, plugin === 'codex-acp' ? 'OxideTerm Codex ACP Adapter' : 'OxideTerm Claude Code ACP Adapter');
  const session = await request('session/new', { cwd: temporary, mcpServers: [] });
  if (plugin === 'codex-acp') {
    assert.equal(session.configOptions[0].currentValue, 'fixture-model');
    assert.equal(session.configOptions[0].options[0].name, 'Fixture Model');
  }
  const prompt = text => request('session/prompt', { sessionId: session.sessionId, prompt: [{ type: 'text', text }] });
  stage = 'streamed prompt';
  assert.equal((await prompt('hello')).stopReason, 'end_turn');
  assert.equal(notifications.filter(value => value.params?.update?.sessionUpdate === 'agent_message_chunk')
    .map(value => value.params.update.content.text).join(''), 'fixture output');
  notifications.length = 0;
  stage = 'cancellation';
  const held = prompt('hold');
  const deadline = Date.now() + 10000;
  while (!notifications.some(value => value.params?.update?.content?.text === 'waiting')) {
    if (Date.now() > deadline) throw new Error('Provider did not enter its running turn');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  send({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: session.sessionId } });
  assert.equal((await held).stopReason, 'cancelled');
  await request('session/close', { sessionId: session.sessionId });
  child.stdin.end();
  const [code] = await exited;
  assert.equal(code, 0);
  console.log(`${plugin}: packaged ACP identity, model discovery, streamed content, cancellation and session close verified on ${target}`);
} finally {
  for (const { timer } of pending.values()) clearTimeout(timer);
  if (child && child.exitCode === null) { child.kill(); await exited; }
  fs.rmSync(temporary, { recursive: true, force: true });
}
