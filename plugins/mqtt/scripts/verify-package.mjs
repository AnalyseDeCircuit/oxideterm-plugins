import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json')));
const target = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)[1];
const archive = unzipSync(fs.readFileSync(path.join(root, 'dist', `mqtt-${source.version}-${target}.zip`)));
const manifest = JSON.parse(strFromU8(archive['plugin.json']));
const binary = `oxideterm-mqtt${process.platform === 'win32' ? '.exe' : ''}`;
assert.deepEqual(manifest, { ...source, runtime: { ...source.runtime, entry: `bin/${binary}` } });
for (const name of ['LICENSE', 'README.md', 'README.en.md', 'THIRD_PARTY_NOTICES.txt']) {
  assert(archive[name]?.length > 0, `Missing ${name}`);
}
const directory = path.join(root, 'target/package-check');
fs.mkdirSync(directory, { recursive: true });
const executable = path.join(directory, binary);
fs.writeFileSync(executable, archive[manifest.runtime.entry]);
if (process.platform !== 'win32') fs.chmodSync(executable, 0o755);
execFileSync(process.execPath, ['--test', 'tests/integration.test.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, MQTT_TEST_BINARY: executable },
});
