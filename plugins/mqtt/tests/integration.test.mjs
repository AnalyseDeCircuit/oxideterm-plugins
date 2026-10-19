import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter, once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Aedes } from 'aedes';

const root = fileURLToPath(new URL('..', import.meta.url));
const binary = process.env.MQTT_TEST_BINARY ?? path.join(root, 'target/debug', `oxideterm-mqtt${process.platform === 'win32' ? '.exe' : ''}`);
const secret = 'synthetic-mqtt-password';

class Host {
  events = new EventEmitter();
  views = new Map();
  replies = new Map();
  sequence = 0;
  error = '';
  constructor(t) {
    this.child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.exited = once(this.child, 'exit');
    this.child.on('exit', () => this.events.emit('change'));
    t.after(() => { if (this.child.exitCode === null) this.child.kill(); });
    this.child.stderr.on('data', chunk => { this.error += chunk.toString(); this.events.emit('change'); });
    createInterface({ input: this.child.stdout }).on('line', line => {
      assert(!line.includes(secret), 'credentials must never appear in protocol output');
      const frame = JSON.parse(line);
      if (frame.payload.type === 'registerContribution') {
        const { connectionId, schema } = frame.payload.registration.metadata;
        assert(Buffer.byteLength(JSON.stringify(schema)) < 2 * 1024 * 1024);
        this.views.set(connectionId, schema);
        const fixtures = path.join(root, 'target/host-schemas');
        fs.mkdirSync(fixtures, { recursive: true });
        fs.writeFileSync(path.join(fixtures, `${connectionId}-${schema.sections.some(s => s.id === 'subscriptions') ? 'subscriptions' : 'messages'}.json`), JSON.stringify(schema));
      } else if (frame.requestId) this.replies.set(frame.requestId, frame.payload.result);
      this.events.emit('change');
    });
  }
  async until(predicate) {
    const signal = AbortSignal.timeout(7000);
    const timeout = new Error('Timed out waiting for the MQTT process');
    while (!predicate()) {
      assert(!this.error.includes(secret), 'credentials must never appear in stderr');
      assert.equal(this.error, '', 'MQTT process wrote to stderr while waiting');
      assert.equal(this.child.exitCode, null, this.error || 'MQTT process exited before replying');
      try {
        await once(this.events, 'change', { signal });
      } catch (error) {
        if (error.name === 'AbortError') throw timeout;
        throw error;
      }
    }
  }
  async request(kind, fragmented = false) {
    const id = `test-${++this.sequence}`;
    const frame = JSON.stringify({ protocolVersion: 1, requestId: id, payload: { requestId: id, kind } }) + '\n';
    if (fragmented) {
      this.child.stdin.write(frame.slice(0, 37));
      // Allow unsolicited updates to arrive while a host frame is incomplete.
      await new Promise(resolve => setTimeout(resolve, 200));
      this.child.stdin.write(frame.slice(37));
    } else this.child.stdin.write(frame);
    await this.until(() => this.replies.has(id));
    const result = this.replies.get(id);
    this.replies.delete(id);
    assert.equal(result.status, 'ok', JSON.stringify(result));
    return result.value;
  }
  async activate() {
    await this.request({ type: 'activate', permissions: { capabilities: ['ui.write', 'credentials.raw.read'] } });
  }
  async open(id, port, extra = {}) {
    const result = await this.request({ type: 'dispatchCommand', command: 'connection.open', args: {
      instanceId: id, profileId: 'same-profile', typeId: 'mqtt',
      config: { 'root/host': 'localhost', 'root/port': String(port), 'root/username': 'fixture', ...extra },
      credentials: { 'root/password': secret },
    } });
    assert.equal(result.kind, 'workbench');
    if (!this.views.has(id)) this.views.set(id, result.schema);
  }
  ui(id, sectionId, controlId, type, value) {
    return this.request({ type: 'sendEvent', event: { name: 'ui.event', payload: { surfaceId: id, sectionId, controlId, type, value } } });
  }
  section(id, name) { return this.views.get(id)?.sections.find(s => s.id === name); }
  control(id, section, name) {
    function find(controls) {
      for (const c of controls ?? []) { if (c.id === name) return c; const nested = find(c.children); if (nested) return nested; }
    }
    return find(this.section(id, section)?.controls);
  }
  rows(id) { return this.control(id, 'messages', 'list')?.rows ?? []; }
  connected(id) { return this.section(id, 'session')?.controls[0]?.children.some(c => c.label?.endsWith('.mqtt.connected')); }
  async publish(id, topic, body, qos = 1, retain = false) {
    await this.ui(id, 'publish', 'topic', 'input', topic);
    await this.ui(id, 'publish', 'body', 'input', body);
    await this.ui(id, 'publish', 'qos', 'change', String(qos));
    await this.ui(id, 'publish', 'retain', 'change', retain);
    await this.ui(id, 'publish', 'send', 'click');
  }
  async close(id) { await this.request({ type: 'dispatchCommand', command: 'connection.close', args: { instanceId: id } }); }
  async stop() {
    await this.request({ type: 'deactivate' });
    const [code] = await this.exited;
    assert.equal(code, 0, this.error);
    assert.equal(this.error, '');
  }
}

async function broker(t, options) {
  const broker = await Aedes.createBroker();
  const clients = new Set();
  broker.authenticate = (_client, username, password, callback) => callback(null, username === 'fixture' && password?.toString() === secret);
  broker.on('client', client => clients.add(client));
  broker.on('clientDisconnect', client => clients.delete(client));
  const server = options ? tls.createServer(options, broker.handle) : net.createServer(broker.handle);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    for (const client of clients) client.close();
    server.close();
    await new Promise(resolve => broker.close(resolve));
  });
  return { broker, clients, port: server.address().port };
}

test('real broker: isolated instances, QoS, retained delivery, pause, reconnect and lifecycle', { timeout: 30000 }, async t => {
  const server = await broker(t);
  const host = new Host(t);
  await host.activate();
  await host.open('receiver', server.port);
  await host.open('sender', server.port);
  await host.until(() => host.connected('receiver') && host.connected('sender'));
  assert.equal(server.clients.size, 2);
  await host.ui('receiver', 'session', 'page', 'change', 'subscriptions');
  await host.ui('receiver', 'subscriptions', 'filter', 'input', 'device/+/state');
  await host.ui('receiver', 'subscriptions', 'qos', 'change', '2');
  const subscribed = once(server.broker, 'subscribe');
  await host.ui('receiver', 'subscriptions', 'subscribe', 'click');
  await subscribed;
  await host.ui('receiver', 'session', 'page', 'change', 'messages');
  await host.ui('receiver', 'publish', 'body', 'input', 'unsent\ndraft');
  for (const qos of [0, 1, 2]) {
    await host.publish('sender', 'device/a/state', `value-${qos}\n第二行`, qos, qos === 2);
    await host.until(() => host.rows('receiver').some(m => m.preview === `value-${qos}\n第二行` && m.qos === qos));
    await host.until(() => host.rows('sender').some(m => m.preview === `value-${qos}\n第二行` && m.status === (qos ? '@mqtt.acknowledged' : '@mqtt.sent')));
  }
  assert.equal(host.control('receiver', 'publish', 'body').value, '', 'refreshes must not replace the host-owned draft');
  assert(host.rows('receiver').every(m => m.direction === '←'));
  assert(host.rows('sender').every(m => m.direction === '→'));
  const selected = host.rows('receiver')[0];
  await host.ui('receiver', 'messages', 'list', 'change', selected.id);
  await host.ui('receiver', 'messages', 'reuse', 'click');
  await host.until(() => host.control('receiver', 'publish', 'body').value === 'value-0\n第二行');
  assert.equal(host.control('receiver', 'publish', 'topic').value, 'device/a/state');
  await host.ui('receiver', 'messages', 'pause', 'click');
  await host.until(() => host.control('receiver', 'messages', 'pause').label.endsWith('.mqtt.resume'));
  const before = host.rows('receiver').map(m => m.id);
  const received = () => host.section('receiver', 'session').controls[0].children.find(c => c.label?.endsWith('.mqtt.received')).value;
  const count = received();
  await host.publish('sender', 'device/a/state', 'while-paused');
  await host.until(() => received() > count);
  assert.deepEqual(host.rows('receiver').map(m => m.id), before);
  await host.request({ type: 'health' }, true);
  await host.ui('receiver', 'messages', 'pause', 'click');
  await host.until(() => host.rows('receiver').some(m => m.preview === 'while-paused'));

  const resubscribed = once(server.broker, 'subscribe');
  for (const client of server.clients) client.close();
  await resubscribed;
  await host.until(() => host.connected('receiver') && host.connected('sender'));
  await host.publish('sender', 'device/a/state', 'after-reconnect');
  await host.until(() => host.rows('receiver').some(m => m.preview === 'after-reconnect'));
  await host.open('retained', server.port);
  await host.until(() => host.connected('retained'));
  await host.ui('retained', 'session', 'page', 'change', 'subscriptions');
  await host.ui('retained', 'subscriptions', 'filter', 'input', 'device/a/state');
  await host.ui('retained', 'subscriptions', 'subscribe', 'click');
  await host.ui('retained', 'session', 'page', 'change', 'messages');
  await host.until(() => host.rows('retained').some(m => m.preview === 'value-2\n第二行' && m.retain === '✓'));
  const disconnected = once(server.broker, 'clientDisconnect');
  await host.close('retained');
  // The broker observes socket closure independently of the host's reply.
  await disconnected;
  await host.close('retained');
  assert.equal(server.clients.size, 2);
  await host.close('receiver');
  await host.publish('sender', 'not/subscribed', 'still-alive');
  await host.until(() => host.rows('sender').some(m => m.preview === 'still-alive' && m.status === '@mqtt.acknowledged'));
  await host.stop();
});

test('TLS verifies certificates and accepts an explicitly configured test CA', { timeout: 20000 }, async t => {
  const dir = path.join(root, 'target/test-tls');
  fs.mkdirSync(dir, { recursive: true });
  const key = path.join(dir, 'key.pem'), cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-addext','basicConstraints=critical,CA:FALSE'], { stdio: 'ignore' });
  const ca = fs.readFileSync(cert, 'utf8');
  const server = await broker(t, { key: fs.readFileSync(key), cert: ca });
  const host = new Host(t);
  await host.activate();
  await host.open('untrusted', server.port, { 'root/tls': true });
  await host.until(() => host.section('untrusted', 'session')?.controls.some(c => c.text?.endsWith('.mqtt.tls_failed')));
  await host.close('untrusted');
  await host.open('trusted', server.port, { 'root/tls': true, 'root/ca_pem': ca });
  await host.until(() => host.connected('trusted'));
  await host.stop();
});
