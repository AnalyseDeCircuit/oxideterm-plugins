import fs from 'node:fs';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';

const root = path.resolve(import.meta.dirname, '../plugins/host-tools-dashboard');
const target = { 'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin', 'linux-arm64': 'aarch64-unknown-linux-gnu', 'linux-x64': 'x86_64-unknown-linux-gnu', 'win32-x64': 'x86_64-pc-windows-msvc', 'win32-arm64': 'aarch64-pc-windows-msvc' }[`${process.platform}-${process.arch}`];
if (!target) throw new Error('Unsupported Dashboard platform');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json')));
if (process.platform === 'win32') manifest.runtime.entry = 'bin/plugin.cmd';
const files = { 'plugin.json': strToU8(JSON.stringify(manifest, null, 2) + '\n') };
for (const name of ['README.md', 'LICENSE', 'bin/host-tools-dashboard.js', ...(process.platform === 'win32' ? ['bin/plugin.cmd'] : []), ...fs.readdirSync(path.join(root, 'locales')).map(name => `locales/${name}`)]) {
  files[name] = [fs.readFileSync(path.join(root, name)), { os: 3, attrs: ((name.startsWith('bin/') ? 0o100755 : 0o100644) << 16) >>> 0 }];
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const output = path.join(root, 'dist', `host-tools-dashboard-${manifest.version}-${target}.zip`);
fs.writeFileSync(output, zipSync(files, { level: 6 }));
console.log(output);
