import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';

const root = path.resolve(import.meta.dirname, '..');
const target = { 'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin', 'linux-arm64': 'aarch64-unknown-linux-gnu', 'linux-x64': 'x86_64-unknown-linux-gnu', 'win32-arm64': 'aarch64-pc-windows-msvc', 'win32-x64': 'x86_64-pc-windows-msvc' }[`${process.platform}-${process.arch}`];
const rustHost = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)?.[1];
if (!target || target !== rustHost || (process.env.SQLITE_PREVIEW_TARGET && process.env.SQLITE_PREVIEW_TARGET !== target)) throw new Error('Use a native runner matching the package target');
execFileSync('cargo', ['build', '--release', '--locked'], { cwd: root, stdio: 'inherit' });
const binary = process.platform === 'win32' ? 'sqlite-preview.exe' : 'sqlite-preview';
fs.copyFileSync(path.join(root, 'target/release', binary), path.join(root, 'bin', binary));
if (process.platform !== 'win32') fs.chmodSync(path.join(root, 'bin', binary), 0o755);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json')));
manifest.runtime.entry = `bin/${binary}`;
if (process.argv.includes('--local')) {
  manifest.version += '-local.1';
  manifest.engines.oxideterm = '>=2.2.0';
}
const files = { 'plugin.json': strToU8(JSON.stringify(manifest, null, 2) + '\n') };
for (const file of [`bin/${binary}`, 'LICENSE', 'README.md', 'README.en.md']) {
  files[file] = [fs.readFileSync(path.join(root, file)), { os: 3, attrs: ((file.startsWith('bin/') ? 0o100755 : 0o100644) << 16) >>> 0 }];
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--locked', '--format-version', '1', '--filter-platform', target], { cwd: root, encoding: 'utf8' }));
let notices = '';
for (const pkg of metadata.packages) {
  notices += `\n${pkg.name} ${pkg.version}\n${pkg.license || ''}\n`;
  const directory = path.dirname(pkg.manifest_path);
  for (const name of fs.readdirSync(directory).filter(name => /^(LICENSE|COPYING|NOTICE|COPYRIGHT)([._-]|$)/i.test(name))) {
    const filename = path.join(directory, name);
    if (fs.statSync(filename).isFile()) notices += fs.readFileSync(filename, 'utf8') + '\n';
  }
}
files['THIRD_PARTY_NOTICES.txt'] = strToU8(notices);
const output = path.join(root, 'dist', `sqlite-preview-${manifest.version}-${target}.zip`);
fs.writeFileSync(output, zipSync(files, { level: 6 }));
console.log(output);
