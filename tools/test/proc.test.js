// tools/lib/proc.js: commands end when told to, the whole process tree goes with them, and a port
// left listening is found and stopped (so `npm run verify` never leaks an emulator).
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const {
  runCommand,
  listeners,
  sweepPorts,
  tail,
  childEnv,
  killTree,
  parseProcNetTcp,
  listenersLinux,
  UNKNOWN_OWNER,
  ownerText,
} = require('../lib/proc');

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

// ---- Linux: the /proc parser and the owner lookup used by listeners() on Linux -----------------------------------------

test('proc (Linux): parseProcNetTcp finds the inode of a LISTEN socket on a port, IPv4 and IPv6', () => {
  const v4 = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:1389 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 41001 1 0000000000000000 100 0 0 10 0
   1: 0100007F:1389 0100007F:C350 01 00000000:00000000 00:00000000 00000000  1000        0 41002 1 0000000000000000 100 0 0 10 0
   2: 00000000:0016 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 41003 1 0000000000000000 100 0 0 10 0
`;
  const v6 = `  sl  local_address                         remote_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000000000000000000001000000:1389 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 41010 1 0000000000000000 100 0 0 10 0
`;
  assert.deepEqual(
    parseProcNetTcp(v4, 0x1389),
    ['41001'],
    'port 5001 listening; the ESTABLISHED row (st 01) is not',
  );
  assert.deepEqual(parseProcNetTcp(v4, 22), ['41003']);
  assert.deepEqual(parseProcNetTcp(v6, 0x1389), ['41010']);
  assert.deepEqual(parseProcNetTcp(v4, 9999), []);
  assert.deepEqual(parseProcNetTcp('', 1), []);
});

/**
 * A fake /proc for listenersLinux: `tcp` is the text of /proc/net/tcp, `procs` maps a pid to its fd table
 * ({ fd: 'socket:[inode]' }) or to 'EACCES' for a process whose fds this user may not read.
 */
function fakeProc(tcp, procs) {
  const eacces = () => Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
  const enoent = () => Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  return {
    procRoot: '/proc',
    fs: {
      readFileSync: (file) => {
        if (file === '/proc/net/tcp') return tcp;
        throw enoent();
      },
      readdirSync: (dir) => {
        if (dir === '/proc') return ['self', ...Object.keys(procs)];
        const pid = /^\/proc\/(\d+)\/fd$/.exec(dir)?.[1];
        if (pid === undefined || !(pid in procs)) throw enoent();
        if (procs[pid] === 'EACCES') throw eacces();
        return Object.keys(procs[pid]);
      },
      readlinkSync: (file) => {
        const m = /^\/proc\/(\d+)\/fd\/(\d+)$/.exec(file);
        return procs[m[1]][m[2]];
      },
    },
  };
}

const TCP = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:1389 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 41001 1 0000000000000000 100 0 0 10 0
`;

test('proc (Linux): the owner of a listening socket is found through /proc/<pid>/fd', () => {
  const io = fakeProc(TCP, {
    100: { 3: 'socket:[777]' },
    200: { 3: 'socket:[41001]', 4: 'pipe:[9]' },
  });
  assert.deepEqual([...listenersLinux(5001, io)], [200]);
  assert.deepEqual([...listenersLinux(5002, io)], [], 'a port nobody listens on is free');
});

// S7 review nit: a listener owned by ANOTHER user (its /proc/<pid>/fd is unreadable) used to be reported as
// free, so verify would start an emulator on a busy port, or call a leftover server "stopped".
test('proc (Linux): a LISTEN socket whose owner cannot be read counts as busy (UNKNOWN_OWNER), not free', () => {
  const io = fakeProc(TCP, { 100: { 3: 'socket:[777]' }, 300: 'EACCES' });
  assert.deepEqual([...listenersLinux(5001, io)], [UNKNOWN_OWNER]);
});

test('proc (Linux): a readable owner wins; an unreadable process elsewhere adds nothing', () => {
  const io = fakeProc(TCP, { 200: { 3: 'socket:[41001]' }, 300: 'EACCES' });
  assert.deepEqual([...listenersLinux(5001, io)], [200]);
});

test('killTree never signals the unknown-owner marker (a negative pid would otherwise address a process group)', () => {
  const calls = [];
  const original = process.kill;
  process.kill = (...args) => calls.push(args);
  try {
    killTree(UNKNOWN_OWNER);
    killTree(0);
    killTree(undefined);
  } finally {
    process.kill = original;
  }
  assert.deepEqual(calls, []);
});

test('ownerText names a pid, or says the owner is not readable', () => {
  assert.equal(ownerText(4242), 'pid 4242');
  assert.equal(ownerText(UNKNOWN_OWNER), 'owner not readable');
});
