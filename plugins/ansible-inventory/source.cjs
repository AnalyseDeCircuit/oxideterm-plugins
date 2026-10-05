// SPDX-License-Identifier: MIT
const path = require('node:path');
const os = require('node:os');
exports.executable = 'ansible-inventory';
exports.inventory = true;
exports.args = inventory => ['--list', '-i', path.resolve(inventory.startsWith('~/') ? path.join(os.homedir(), inventory.slice(2)) : inventory)];
exports.parse = function parse(data) {
  if (!data?._meta || typeof data._meta.hostvars !== 'object' || !data._meta.hostvars || Array.isArray(data._meta.hostvars)) throw 'failed';
  const memberships = new Map(), names = new Set(Object.keys(data._meta.hostvars));
  if (names.size > 5000 || Object.keys(data).length > 10000) throw 'tooLarge';
  let visits = 0;
  function visit(group, ancestors = new Set()) {
    if (++visits > 100000) throw 'tooLarge';
    if (ancestors.has(group) || ancestors.size > 100) return;
    const item = data[group];
    if (!item || typeof item !== 'object') return;
    const parents = new Set([...ancestors, group]);
    for (const host of Array.isArray(item.hosts) ? item.hosts : []) {
      if (typeof host !== 'string') continue;
      names.add(host);
      if (names.size > 5000) throw 'tooLarge';
      const groups = memberships.get(host) || new Set();
      for (const name of parents) if (!['all', 'ungrouped'].includes(name)) groups.add(name);
      memberships.set(host, groups);
    }
    for (const child of Array.isArray(item.children) ? item.children : []) visit(child, parents);
  }
  for (const group of Object.keys(data)) if (group !== '_meta') visit(group);
  const hosts = [];
  let skipped = 0;
  for (const name of names) {
    const vars = data._meta.hostvars[name] || {};
    const connection = vars.ansible_connection || 'ssh';
    const host = vars.ansible_host ?? vars.ansible_ssh_host ?? name;
    const port = Number(vars.ansible_port ?? vars.ansible_ssh_port ?? 22);
    const username = vars.ansible_user ?? vars.ansible_ssh_user ?? '';
    if (!['ssh', 'paramiko', 'smart', 'ansible.builtin.ssh', 'ansible.builtin.paramiko_ssh'].includes(connection)
      || typeof host !== 'string' || !/^[a-zA-Z0-9_:.%][a-zA-Z0-9_.:%-]*$/.test(host) || host.length > 253
      || !Number.isInteger(port) || port < 1 || port > 65535 || !name.trim() || Buffer.byteLength(name) > 256 || /\p{Cc}/u.test(name)
      || typeof username !== 'string' || Buffer.byteLength(username) > 256 || /[\s\p{Cc}]/u.test(username)) { skipped++; continue; }
    const groups = [...(memberships.get(name) || [])].filter(group => Buffer.byteLength(group) <= 256 && !/\p{Cc}/u.test(group)).sort();
    // A saved connection belongs to one group. Keep a deterministic group while discovery stays refreshable.
    hosts.push({ name, host, port, username, group: groups[0] || 'Ansible' });
  }
  hosts.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  return { hosts, skipped };
};
