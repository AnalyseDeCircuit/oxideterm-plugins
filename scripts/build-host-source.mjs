import fs from 'node:fs';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';

const slug = process.argv[2];
if (!['tailscale-hosts', 'ansible-inventory'].includes(slug)) throw new Error('Choose tailscale-hosts or ansible-inventory');
const repo = path.resolve(import.meta.dirname, '..');
const root = path.join(repo, 'plugins', slug);
fs.mkdirSync(path.join(root, 'generated'), { recursive: true });
fs.copyFileSync(path.join(repo, 'packages/host-sources/runtime.cjs'), path.join(root, 'generated/runtime.cjs'));
fs.copyFileSync(path.join(repo, 'packages/host-sources/client.cjs'), path.join(root, 'generated/client.cjs'));
fs.chmodSync(path.join(root, 'bin/plugin'), 0o755);
if (process.argv.includes('--package')) {
  const target = { 'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin', 'linux-arm64': 'aarch64-unknown-linux-gnu', 'linux-x64': 'x86_64-unknown-linux-gnu', 'win32-x64': 'x86_64-pc-windows-msvc', 'win32-arm64': 'aarch64-pc-windows-msvc' }[`${process.platform}-${process.arch}`];
  if (!target || (process.platform === 'win32' && slug !== 'tailscale-hosts')) throw new Error('Unsupported host source platform');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json')));
  if (process.platform === 'win32') manifest.runtime.entry = 'bin/plugin.cmd';
  if (process.argv.includes('--local')) {
    manifest.version += '-local.1';
    manifest.engines.oxideterm = '>=2.2.0';
  }
  const files = { 'plugin.json': strToU8(JSON.stringify(manifest, null, 2) + '\n') };
  for (const file of [manifest.runtime.entry, 'bin/plugin.js', 'source.cjs', 'generated/runtime.cjs', 'generated/client.cjs', 'LICENSE', 'README.md', 'README.en.md', ...fs.readdirSync(path.join(root, 'locales')).map(name => `locales/${name}`)]) {
    files[file] = [fs.readFileSync(path.join(root, file)), { os: 3, attrs: ((file === 'bin/plugin' ? 0o100755 : 0o100644) << 16) >>> 0 }];
  }
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  const output = path.join(root, 'dist', `${slug}-${manifest.version}-${target}.zip`);
  fs.writeFileSync(output, zipSync(files, { level: 6 }));
  console.log(output);
}
