import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';

const repository = path.resolve(import.meta.dirname, '..');
const plugin = process.argv[2];
if (!['rdp', 'vnc'].includes(plugin)) throw new Error('Choose rdp or vnc');
const root = path.join(repository, 'plugins', plugin);
const target = {
  'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin',
  'linux-arm64': 'aarch64-unknown-linux-gnu', 'linux-x64': 'x86_64-unknown-linux-gnu',
  'win32-arm64': 'aarch64-pc-windows-msvc', 'win32-x64': 'x86_64-pc-windows-msvc',
}[`${process.platform}-${process.arch}`];
if (!target) throw new Error('Unsupported native runner');
const toolchain = `+1.97.0-${target}`;
const rustHost = execFileSync('rustc', [toolchain, '-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)?.[1];
if (rustHost !== target || (process.env.REMOTE_DESKTOP_TARGET && process.env.REMOTE_DESKTOP_TARGET !== target)) {
  throw new Error('Build and verify on a native runner matching the target');
}
execFileSync('cargo', [toolchain, 'test', '--locked'], { cwd: root, stdio: 'inherit' });
execFileSync('cargo', [toolchain, 'build', '--release', '--locked'], { cwd: root, stdio: 'inherit' });
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
const binary = `oxideterm-${plugin}-helper${process.platform === 'win32' ? '.exe' : ''}`;
manifest.runtime.entry = `bin/${binary}`;
const files = { 'plugin.json': strToU8(JSON.stringify(manifest, null, 2) + '\n') };
files[manifest.runtime.entry] = [fs.readFileSync(path.join(root, 'target/release', binary)), {
  os: 3, attrs: (0o100755 << 16) >>> 0,
}];
for (const name of ['LICENSE', 'README.md', 'README.en.md']) files[name] = strToU8(fs.readFileSync(path.join(root, name), 'utf8'));
const metadata = JSON.parse(execFileSync('cargo', [toolchain, 'metadata', '--locked', '--format-version', '1', '--filter-platform', target], {
  cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
}));
let notices = '';
const includedNotices = new Set();
for (const pkg of metadata.packages) {
  notices += `\n${pkg.name} ${pkg.version}\n${pkg.license || ''}\n${pkg.repository || ''}\n`;
  const directory = path.dirname(pkg.manifest_path);
  const directories = [directory];
  // Git workspaces often keep the shared license at their repository root.
  if (pkg.source?.startsWith('git+')) directories.push(execFileSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
  for (const source of directories) {
    for (const name of fs.readdirSync(source).filter(name => /^(LICENSE|COPYING|NOTICE|COPYRIGHT)([._-]|$)/i.test(name))) {
      const file = path.join(source, name);
      if (fs.statSync(file).isFile() && !includedNotices.has(file)) {
        notices += fs.readFileSync(file, 'utf8') + '\n';
        includedNotices.add(file);
      }
    }
  }
}
files['THIRD_PARTY_NOTICES.txt'] = strToU8(notices);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const output = path.join(root, 'dist', `${plugin}-${manifest.version}-${target}.zip`);
fs.writeFileSync(output, zipSync(files, { level: 6 }));
console.log(output);
