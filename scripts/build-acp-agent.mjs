import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';

const repository = path.resolve(import.meta.dirname, '..');
const plugin = process.argv[2];
if (!['codex-acp', 'claude-code-acp'].includes(plugin)) throw new Error('Choose codex-acp or claude-code-acp');
const root = path.join(repository, 'plugins', plugin);
const target = {
  'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin',
  'linux-arm64': 'aarch64-unknown-linux-gnu', 'linux-x64': 'x86_64-unknown-linux-gnu',
  'win32-arm64': 'aarch64-pc-windows-msvc', 'win32-x64': 'x86_64-pc-windows-msvc',
}[`${process.platform}-${process.arch}`];
const rustHost = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)?.[1];
if (!target || rustHost !== target || (process.env.ACP_TARGET && process.env.ACP_TARGET !== target)) {
  throw new Error('Build and verify on a native runner matching the target');
}
execFileSync('cargo', ['test', '--locked', '-p', 'oxideterm-acp-adapter'], { cwd: root, stdio: 'inherit' });
execFileSync('cargo', ['build', '--release', '--locked'], { cwd: root, stdio: 'inherit' });
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
const binary = `${plugin}${process.platform === 'win32' ? '.exe' : ''}`;
manifest.runtime.entry = `bin/${binary}`;
const files = { 'plugin.json': strToU8(JSON.stringify(manifest, null, 2) + '\n') };
files[manifest.runtime.entry] = [fs.readFileSync(path.join(root, 'target/release', binary)), {
  os: 3, attrs: (0o100755 << 16) >>> 0,
}];
for (const name of ['LICENSE', 'README.md', 'README.en.md']) files[name] = strToU8(fs.readFileSync(path.join(root, name), 'utf8'));
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--locked', '--format-version', '1', '--filter-platform', target], {
  cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
}));
let notices = '';
for (const pkg of metadata.packages) {
  notices += `\n${pkg.name} ${pkg.version}\n${pkg.license || ''}\n`;
  const directory = path.dirname(pkg.manifest_path);
  for (const name of fs.readdirSync(directory).filter(name => /^(LICENSE|COPYING|NOTICE|COPYRIGHT)([._-]|$)/i.test(name))) {
    const file = path.join(directory, name);
    if (fs.statSync(file).isFile()) notices += fs.readFileSync(file, 'utf8') + '\n';
  }
}
files['THIRD_PARTY_NOTICES.txt'] = strToU8(notices);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const output = path.join(root, 'dist', `${plugin}-${manifest.version}-${target}.zip`);
fs.writeFileSync(output, zipSync(files, { level: 6 }));
console.log(output);
