import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { unzipSync } from 'fflate';

const slug = process.argv[2];
if (!['certificate-preview', 'binary-preview'].includes(slug)) throw new Error('Unknown inspection plugin');
const root = path.resolve(import.meta.dirname, '../plugins', slug);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json')));
const local = process.argv.includes('--local');
const version = manifest.version + (local ? '-local.1' : '');
const files = fs.readdirSync(path.join(root, 'dist')).filter(name => name.startsWith(`${slug}-${version}-`) && (local || !name.includes('-local.')) && name.endsWith('.zip'));
if (files.length !== 1) throw new Error('Expected one package for this version and runner');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), `${slug}-`));
try {
  for (const [name, bytes] of Object.entries(unzipSync(fs.readFileSync(path.join(root, 'dist', files[0]))))) {
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw new Error('Invalid package path');
    const target = path.join(directory, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { mode: name.startsWith('bin/') ? 0o755 : 0o644 });
  }
  const packaged = JSON.parse(fs.readFileSync(path.join(directory, 'plugin.json')));
  const entry = `bin/${slug}${process.platform === 'win32' ? '.exe' : ''}`;
  if (packaged.id !== manifest.id || packaged.version !== version || packaged.runtime.entry !== entry) throw new Error('Incorrect package identity or entry');
  execFileSync('cargo', ['test', '--locked', '--test', 'protocol'], { cwd: root, stdio: 'inherit', env: { ...process.env, FILE_PREVIEW_PACKAGE_BIN: path.join(directory, entry) } });
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
