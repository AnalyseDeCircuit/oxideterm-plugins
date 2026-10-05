// SPDX-License-Identifier: MIT
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');

exports.start = function start(root, source) {
  const manifest = require(path.join(root, 'plugin.json'));
  let messages = require(path.join(root, 'locales/en.json'));
  let hosts = [], query = '', page = 0, loaded = false, busy = false, error = null, skipped = 0;
  let executable = source.executable, inventory = '', child = null, stopping = false, next = 0;
  const pending = new Map();
  const t = key => messages[key];
  const write = payload => { if (!stopping) process.stdout.write(JSON.stringify({ protocolVersion: 1, requestId: payload.result ? payload.requestId : null, payload }) + '\n'); };
  const reply = (requestId, value) => write({ requestId, result: { status: 'ok', value } });
  const call = (namespace, method, args = {}) => new Promise((resolve, reject) => {
    const requestId = `source-${++next}`;
    pending.set(requestId, { resolve, reject });
    write({ type: 'callHostApi', requestId, namespace, method, args });
  });
  const button = (id, label, disabled = false) => ({ kind: 'button', id, label, disabled, variant: 'outline', size: 'small' });
  async function language() {
    const locale = await call('app', 'getLocale');
    const supported = ['en', 'zh-CN', 'zh-TW', 'de', 'es-ES', 'fr-FR', 'it', 'ja', 'ko', 'pt-BR', 'vi'];
    messages = require(path.join(root, 'locales', supported.includes(locale) ? `${locale}.json` : 'en.json'));
  }
  function render() {
    const matches = hosts.filter(host => `${host.name} ${host.host} ${host.group}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    page = Math.min(page, Math.max(0, Math.ceil(matches.length / 20) - 1));
    const controls = [
      { kind: 'text', id: 'executable', label: t('executable'), value: executable, disabled: busy },
      ...(source.inventory ? [{ kind: 'text', id: 'inventory', label: t('inventory'), value: inventory, disabled: busy }] : []),
      { kind: 'markdown', text: t('hint') },
      { kind: 'row', gap: 'compact', children: [button('refresh', t(busy ? 'loading' : 'refresh'), busy), { kind: 'markdown', text: loaded ? `${hosts.length} ${t('hosts')}` : '' }] },
      ...(error ? [{ kind: 'alert', tone: 'error', label: t(error) }] : []),
      ...(skipped ? [{ kind: 'alert', tone: 'warning', label: `${skipped} ${t('skipped')}` }] : []),
      { kind: 'text', id: 'search', placeholder: t('search'), value: query },
      { kind: 'divider' },
    ];
    for (const host of matches.slice(page * 20, (page + 1) * 20)) {
      const index = hosts.indexOf(host);
      controls.push({ kind: 'actionRow', children: [
        { kind: 'stack', gap: 'compact', children: [
          { kind: 'keyValue', label: host.name, value: `${host.username ? host.username + '@' : ''}${host.host}:${host.port}` },
          { kind: 'keyValue', label: host.group, value: host.online === undefined ? '' : t(host.online ? 'online' : 'offline') },
        ] }, button(`connect-${index}`, t('connect'), busy),
      ] }, { kind: 'divider' });
    }
    if (!matches.length) controls.push({ kind: 'emptyState', label: t(loaded ? 'empty' : 'initial') });
    if (matches.length > 20) controls.push({ kind: 'row', children: [button('previous', t('previous'), page === 0), { kind: 'markdown', text: `${page + 1} / ${Math.ceil(matches.length / 20)}` }, button('next', t('next'), (page + 1) * 20 >= matches.length)] });
    write({ type: 'registerContribution', registration: { pluginId: manifest.id, registrationId: 'hosts-view', kind: 'tab', metadata: { tabId: 'hosts', schema: { componentVersion: 1, kind: 'form', title: t('title'), description: t('description'), controls } } } });
  }
  function stopChild() {
    if (!child) return;
    // Closing the owner pipe also works when the host kills this plugin abruptly.
    child.stdin.end();
  }
  function discover() {
    return new Promise((resolve, reject) => {
      let chunks = [], bytes = 0, failure = null;
      try {
        child = spawn(process.execPath, [path.join(__dirname, 'client.cjs'), executable, ...source.args(inventory)], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
        child.stdin.on('error', () => {});
      } catch { reject('failed'); return; }
      // Finish inside the host's five-second event deadline, including child cleanup.
      const timer = setTimeout(() => { failure = 'timeout'; stopChild(); }, 4000);
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 8 * 1024 * 1024) { chunk.fill(0); failure = 'tooLarge'; stopChild(); }
        else chunks.push(chunk);
      });
      child.on('error', err => { failure = err.code === 'ENOENT' ? 'missing' : 'failed'; });
      child.on('close', code => {
        clearTimeout(timer);
        stopChild();
        child = null;
        const buffer = Buffer.concat(chunks);
        for (const chunk of chunks) chunk.fill(0);
        chunks = [];
        try {
          if (failure || code !== 0) throw failure || (code === 127 ? 'missing' : 'failed');
          // Only allowlisted connection metadata survives parsing. Never retain host variables or stderr.
          resolve(source.parse(JSON.parse(buffer.toString('utf8'))));
        } catch (err) { reject(typeof err === 'string' ? err : 'failed'); }
        finally { buffer.fill(0); }
      });
    });
  }
  async function event(event) {
    if (event.name === 'i18n.languageChanged') { await language(); render(); return; }
    if (event.name !== 'ui.event') return;
    const { controlId, type, value } = event.payload || {};
    if ((type === 'input' || type === 'change') && typeof value === 'string') {
      if (controlId === 'search') { query = value; page = 0; render(); }
      else if (!busy && controlId === 'executable') executable = value;
      else if (!busy && controlId === 'inventory') inventory = value;
      return;
    }
    if (type !== 'click' || busy) return;
    error = null;
    if (controlId === 'refresh') {
      busy = true; hosts = []; loaded = false; skipped = 0; render();
      try {
        if (!executable.trim() || (source.inventory && !inventory.trim())) throw 'required';
        ({ hosts, skipped } = await discover());
        loaded = true; page = 0;
      } catch (key) { error = messages[key] ? key : 'failed'; }
      finally { busy = false; render(); }
    } else if (/^connect-\d+$/.test(controlId)) {
      const host = hosts[Number(controlId.slice(8))];
      if (host) {
        const { name, host: address, port, username, group } = host;
        try { await call('connections', 'openForm', { name, host: address, port, username, group }); }
        catch { error = 'openFailed'; render(); }
      }
    } else if (controlId === 'previous' || controlId === 'next') {
      page = Math.max(0, page + (controlId === 'next' ? 1 : -1)); render();
    }
  }
  function stop() {
    stopping = true; stopChild();
    for (const request of pending.values()) request.reject(new Error('stopped'));
    pending.clear();
  }
  async function request(payload) {
    const { requestId, kind } = payload;
    try {
      switch (kind?.type) {
        case 'activate': {
          await language();
          const catalog = await call('app', 'getApiCatalog');
          if (!catalog.some(item => item.namespace === 'connections' && item.method === 'openForm')) throw new Error('upgrade');
          write({ type: 'registerContribution', registration: { pluginId: manifest.id, registrationId: 'locale', kind: 'event-subscription', metadata: { event: 'i18n.languageChanged' } } });
          render(); write({ type: 'runtimeReady' }); reply(requestId, { activated: true }); break;
        }
        case 'sendEvent': await event(kind.event); reply(requestId, { handled: true }); break;
        case 'health': reply(requestId, { ok: true }); break;
        case 'deactivate': case 'kill': reply(requestId, { stopped: true }); stop(); process.exit(0); break;
        default: throw new Error('unsupported');
      }
    } catch {
      write({ requestId, result: { status: 'error', error: { code: 'source_request_failed', message: t('openFailed'), recoverable: true } } });
    }
  }
  readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', line => {
    let envelope;
    try { envelope = JSON.parse(line); } catch { return; }
    if (envelope.protocolVersion !== 1 || !envelope.payload) return;
    const payload = envelope.payload, waiter = pending.get(payload.requestId);
    if (payload.result) {
      if (waiter) { pending.delete(payload.requestId); payload.result.status === 'ok' ? waiter.resolve(payload.result.value) : waiter.reject(new Error('host rejected request')); }
    } else request(payload).catch(() => {});
  }).on('close', () => { stop(); process.exit(0); });
  process.on('SIGTERM', () => { stop(); process.exit(0); });
  process.on('SIGINT', () => { stop(); process.exit(0); });
};
