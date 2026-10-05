// SPDX-License-Identifier: MIT
const { isIP } = require('node:net');
exports.executable = process.platform === 'win32' ? 'tailscale.exe' : 'tailscale';
exports.args = () => ['status', '--json'];
exports.parse = function parse(status) {
  if (status?.BackendState !== 'Running') throw 'notRunning';
  if (status.Peer != null && (typeof status.Peer !== 'object' || Array.isArray(status.Peer))) throw 'failed';
  if (Object.keys(status.Peer || {}).length > 5000) throw 'tooLarge';
  const hosts = [];
  let skipped = 0;
  for (const [id, peer] of Object.entries(status.Peer || {})) {
    if (id === status.Self?.PublicKey) continue;
    if (!peer || typeof peer !== 'object') { skipped++; continue; }
    const ips = Array.isArray(peer.TailscaleIPs) ? peer.TailscaleIPs.filter(ip => typeof ip === 'string' && isIP(ip)) : [];
    const host = ips.find(ip => isIP(ip) === 4) || ips[0];
    const name = peer.HostName || peer.DNSName?.replace(/\.$/, '') || host;
    if (!host || typeof name !== 'string' || !name.trim() || Buffer.byteLength(name) > 256 || /\p{Cc}/u.test(name)) { skipped++; continue; }
    hosts.push({ name, host, port: 22, username: '', group: 'Tailscale', online: peer.Online === true });
  }
  hosts.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  return { hosts, skipped };
};
