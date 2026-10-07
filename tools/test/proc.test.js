// tools/lib/proc.js: commands end when told to, the whole process tree goes with them, and a port
// left listening is found and stopped (so `npm run verify` never leaks an emulator).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { runCommand, listeners, sweepPorts, tail, childEnv } = require('../lib/proc');

const NODE = `"${process.execPath}"`;

function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const accepting = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.on('connect', () => (socket.destroy(), resolve(true)));
    socket.on('error', () => resolve(false));
  });

async function waitUntil(fn, ms = 8000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

/** A folder with server.js (listens on argv[2]) and parent.js (starts it, then `mode`). */
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-proc-'));
  fs.writeFileSync(
    path.join(dir, 'server.js'),
    "require('net').createServer().listen(Number(process.argv[2]), '127.0.0.1'); setInterval(() => {}, 1000);\n",
  );
  fs.writeFileSync(
    path.join(dir, 'parent.js'),
    `const { spawn } = require('child_process');
const server = spawn(process.execPath, [require('path').join(__dirname, 'server.js'), process.argv[2]], { stdio: 'ignore', detached: process.argv[3] === 'orphan' });
if (process.argv[3] === 'orphan') { server.unref(); setTimeout(() => process.exit(0), 600); } else { setInterval(() => {}, 1000); }
`,
  );
  return dir;
}

test('a command that outlives its timeout is stopped with its whole tree (nothing left on its port)', async () => {
  const dir = fixture();
  const port = await freePort();
  try {
    const run = runCommand(`${NODE} parent.js ${port}`, { cwd: dir, timeoutMs: 6000 });
    assert.equal(await waitUntil(() => accepting(port)), true, 'the grandchild server came up');
    const early = await Promise.race([
      run,
      new Promise((r) => setTimeout(() => r('still running'), 500)),
    ]);
    assert.equal(early, 'still running');
    const killedAt = Date.now();
    const result = await run; // the timeout fires
    assert.equal(result.timedOut, true);
    assert.ok(Date.now() - killedAt < 10000);
    assert.equal(
      await waitUntil(async () => !(await accepting(port))),
      true,
      'the grandchild is gone',
    );
    assert.deepEqual(listeners(port), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a command that finishes normally leaves nothing behind either', async () => {
  const dir = fixture();
  try {
    const r = await runCommand(`${NODE} -e "console.log('hello'); process.exit(3)"`, { cwd: dir });
    assert.deepEqual([r.code, r.timedOut], [3, false]);
    assert.match(r.output, /hello/);
    assert.equal((await runCommand(`${NODE} -e "process.exit(0)"`, { cwd: dir })).code, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sweepPorts finds a server an exited parent left behind (an orphan), reports it and stops it', async () => {
  const dir = fixture();
  const port = await freePort();
  try {
    const r = await runCommand(`${NODE} parent.js ${port} orphan`, { cwd: dir, timeoutMs: 20000 });
    assert.equal(r.code, 0, 'the parent exited cleanly');
    assert.equal(
      await waitUntil(() => accepting(port)),
      true,
      'but its detached child still listens',
    );
    const orphans = sweepPorts([port]);
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].port, port);
    assert.equal(await waitUntil(async () => !(await accepting(port))), true, 'and now it is gone');
    assert.deepEqual(sweepPorts([port]), [], 'a clean port reports nothing');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('tail keeps the last lines, childEnv puts this Node first on PATH', () => {
  assert.equal(tail('a\nb\nc\nd\n\n', 2), 'c\nd');
  assert.equal(tail('only', 5), 'only');
  const env = childEnv();
  const key = Object.keys(env).find((k) => k.toLowerCase() === 'path');
  assert.equal(env[key].split(path.delimiter)[0], path.dirname(process.execPath));
  assert.equal(
    Object.keys(env).filter((k) => k.toLowerCase() === 'path').length,
    1,
    'one PATH variable, not two',
  );
});
