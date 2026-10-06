import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';

const root = path.resolve(import.meta.dirname, '..');
const target = { 'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin', 'linux-arm64': 'aarch64-unknown-linux-gnu', 'linux-x64': 'x86_64-unknown-linux-gnu', 'win32-arm64': 'aarch64-pc-windows-msvc', 'win32-x64': 'x86_64-pc-windows-msvc' }[`${process.platform}-${process.arch}`];
const host = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)?.[1];
if (!target || target !== host || (process.env.FIDO_TARGET && process.env.FIDO_TARGET !== target)) throw new Error('Use a native runner matching the package target');
const env = { ...process.env, PKG_CONFIG_ALL_STATIC: '1', OPENSSL_STATIC: '1' };
if (process.platform !== 'win32') {
  const flags = execFileSync('pkg-config', ['--cflags', 'libfido2', 'libcrypto'], { encoding: 'utf8', env }).trim();
  env.BINDGEN_EXTRA_CLANG_ARGS = `${env.BINDGEN_EXTRA_CLANG_ARGS ?? ''} ${flags}`;
}
execFileSync('cargo', ['build', '--release', '--locked'], { cwd: root, env, stdio: 'inherit' });
const name = `fido2${process.platform === 'win32' ? '.exe' : ''}`;
const staging = path.join(root, 'target/package');
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(path.join(staging, 'bin'), { recursive: true });
fs.mkdirSync(path.join(staging, 'lib'), { recursive: true });
const binary = path.join(staging, 'bin', name);
fs.copyFileSync(path.join(root, 'target/release', name), binary);
if (process.platform !== 'win32') fs.chmodSync(binary, 0o755);

if (process.platform === 'darwin') {
  const pending = [[binary, path.join(root, 'target/release', name), true]];
  const copied = new Set();
  while (pending.length) {
    const [destination, original, entry] = pending.shift();
    const libraries = execFileSync('otool', ['-L', original], { encoding: 'utf8' }).split('\n').slice(1).map(line => line.trim().split(' (')[0]);
    for (const library of libraries) {
      if (!library.startsWith('/') || library.startsWith('/usr/lib/') || library.startsWith('/System/Library/')) continue;
      const filename = path.basename(library);
      const installed = path.join(staging, 'lib', filename);
      if (!copied.has(filename)) {
        copied.add(filename);
        fs.copyFileSync(library, installed);
        execFileSync('install_name_tool', ['-id', `@rpath/${filename}`, installed]);
        pending.push([installed, library, false]);
      }
      execFileSync('install_name_tool', ['-change', library, `@loader_path/${entry ? '../lib/' : ''}${filename}`, destination]);
    }
  }
  for (const library of fs.readdirSync(path.join(staging, 'lib'))) execFileSync('codesign', ['--force', '--sign', '-', path.join(staging, 'lib', library)]);
  execFileSync('codesign', ['--force', '--sign', '-', binary]);
} else if (process.platform === 'linux') {
  const dependencies = execFileSync('ldd', [binary], { encoding: 'utf8' });
  for (const match of dependencies.matchAll(/(lib(?:fido2|cbor|crypto|ssl)[^\s]*)\s+=>\s+(\/[^\s]+)/g)) fs.copyFileSync(match[2], path.join(staging, 'lib', match[1]));
  execFileSync('patchelf', ['--set-rpath', '$ORIGIN/../lib', binary]);
  for (const file of fs.readdirSync(path.join(staging, 'lib'))) execFileSync('patchelf', ['--set-rpath', '$ORIGIN', path.join(staging, 'lib', file)]);
}

let notices = '';
function collectLicenses(directory, label, nested = false) {
  if (!fs.existsSync(directory)) return;
  for (const name of fs.readdirSync(directory)) {
    const filename = path.join(directory, name);
    if (fs.statSync(filename).isFile() && /^(LICENSE|COPYING|NOTICE|COPYRIGHT)([._-]|$)/i.test(name)) notices += `\n${label}: ${name}\n${fs.readFileSync(filename, 'utf8')}\n`;
    else if (nested && fs.statSync(filename).isDirectory()) collectLicenses(filename, label);
  }
}
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--locked', '--format-version', '1', '--filter-platform', target], { cwd: root, env, encoding: 'utf8' }));
for (const pkg of metadata.packages) {
  notices += `\n${pkg.name} ${pkg.version}: ${pkg.license ?? ''}\n`;
  collectLicenses(path.dirname(pkg.manifest_path), pkg.name);
}
if (env.FIDO_NATIVE_PREFIX) collectLicenses(path.join(env.FIDO_NATIVE_PREFIX, 'share'), 'native dependency', true);
else if (process.platform !== 'win32') for (const library of ['libfido2', 'libcbor', 'libcrypto']) {
  const prefix = execFileSync('pkg-config', ['--variable=prefix', library], { encoding: 'utf8', env }).trim();
  collectLicenses(prefix, library);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json')));
manifest.runtime.entry = `bin/${name}`;
const files = { 'plugin.json': strToU8(JSON.stringify(manifest, null, 2) + '\n'), 'THIRD_PARTY_NOTICES.txt': strToU8(notices) };
for (const file of ['LICENSE', 'README.md', 'README.en.md']) files[file] = fs.readFileSync(path.join(root, file));
for (const directory of ['bin', 'lib']) for (const filename of fs.readdirSync(path.join(staging, directory))) files[`${directory}/${filename}`] = [fs.readFileSync(path.join(staging, directory, filename)), { os: 3, attrs: ((directory === 'bin' ? 0o100755 : 0o100644) << 16) >>> 0 }];
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const output = path.join(root, 'dist', `fido2-${manifest.version}-${target}.zip`);
fs.writeFileSync(output, zipSync(files, { level: 6 }));
console.log(output);
