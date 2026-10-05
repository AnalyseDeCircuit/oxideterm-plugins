// SPDX-License-Identifier: MIT
// The parent's pipe is the lifetime lease. EOF terminates the CLI and its process group.
const { spawn } = require('node:child_process');
let child, stopped = false, abandoned = false;
function stop() {
  if (stopped) return;
  stopped = true;
  if (child?.pid) {
    try {
      if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
      else child.kill('SIGKILL');
    } catch { /* The command may already have exited. */ }
  }
}
process.stdin.resume();
function abandon() {
  abandoned = true; stop();
  if (!child?.pid) process.exit(1);
}
process.stdin.on('end', abandon);
process.stdout.on('error', abandon);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, abandon);
try {
  child = spawn(process.argv[2], process.argv.slice(3), { shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  child.stdout.pipe(process.stdout, { end: false });
  child.on('error', error => { stop(); process.exit(error.code === 'ENOENT' ? 127 : 1); });
  child.on('close', code => {
    stop();
    if (abandoned) process.exit(1);
    process.stdout.write('', () => process.exit(code === 0 ? 0 : 1));
  });
} catch { stop(); process.exit(1); }
setTimeout(abandon, 4500);
