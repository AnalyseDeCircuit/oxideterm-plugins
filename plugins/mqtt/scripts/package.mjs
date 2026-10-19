import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = {
  'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin',
  'linux-arm64': 'aarch64-unknown-linux-gnu', 'linux-x64': 'x86_64-unknown-linux-gnu',
  'win32-arm64': 'aarch64-pc-windows-msvc', 'win32-x64': 'x86_64-pc-windows-msvc',
}[`${process.platform}-${process.arch}`];
const host = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)?.[1];
if (!target || target !== host) throw new Error('Build on a native runner matching the package target.');
// Use the marketplace's existing preparation and immutable-package conventions.
execFileSync(process.execPath, [path.resolve(root, '../../scripts/release-plugin.mjs'), 'prepare', root], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/check.mjs'], { cwd: root, stdio: 'inherit' });
execFileSync('cargo', ['build', '--release', '--locked'], { cwd: root, stdio: 'inherit' });
const binary = `oxideterm-mqtt${process.platform === 'win32' ? '.exe' : ''}`;
fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
fs.copyFileSync(path.join(root, 'target/release', binary), path.join(root, 'bin', binary));
if (process.platform !== 'win32') fs.chmodSync(path.join(root, 'bin', binary), 0o755);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json')));
manifest.runtime.entry = `bin/${binary}`;
const files = { 'plugin.json': strToU8(JSON.stringify(manifest, null, 2) + '\n') };
for (const name of [`bin/${binary}`, 'LICENSE', 'README.md', 'README.en.md']) {
  files[name] = [fs.readFileSync(path.join(root, name)), { os: 3, attrs: ((name.startsWith('bin/') ? 0o100755 : 0o100644) << 16) >>> 0 }];
}
const metadata = JSON.parse(execFileSync('cargo', ['metadata','--format-version','1','--locked','--filter-platform',target], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
const nodes = new Map(metadata.resolve.nodes.map(node => [node.id, node]));
const used = new Set();
function visit(id) {
  if (used.has(id)) return;
  used.add(id);
  for (const dep of nodes.get(id)?.deps ?? []) if (dep.dep_kinds.some(kind => kind.kind === null)) visit(dep.pkg);
}
visit(metadata.resolve.root);
let notices = '';
for (const pkg of metadata.packages.filter(pkg => used.has(pkg.id))) {
  notices += `\n${pkg.name} ${pkg.version}\nLicense: ${pkg.license ?? ''}\n${pkg.repository ?? ''}\n`;
  const directory = path.dirname(pkg.manifest_path);
  for (const name of fs.readdirSync(directory).filter(name => /^(LICENSE|COPYING|NOTICE|COPYRIGHT)([._-]|$)/i.test(name))) {
    const file = path.join(directory, name);
    if (fs.statSync(file).isFile()) notices += `\n${name}\n${fs.readFileSync(file, 'utf8')}\n`;
  }
}
files['THIRD_PARTY_NOTICES.txt'] = strToU8(notices);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const output = path.join(root, 'dist', `mqtt-${manifest.version}-${target}.zip`);
fs.writeFileSync(output, zipSync(files, { level: 6 }));
console.log(output);
