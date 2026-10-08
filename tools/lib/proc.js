// Running child processes without leaving orphans (used by `npm run verify`).
//
// On Windows a command such as `firebase.cmd emulators:...` is cmd.exe -> node -> more node
// processes, and killing the first one leaves the rest running (and holding their ports). So every
// command is tracked by pid and ended with `taskkill /T /F` (the whole tree); POSIX uses a process
// group. killAll() is called on a timeout, on Ctrl-C and at exit. sweepPorts() is the proof: after a
// check that may have started servers, no listener may remain on its ports.
//
// Plain CommonJS, no dependencies, any Node >= 22.
'use strict';

const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const live = new Set();
const WINDOWS = process.platform === 'win32';
/**
 * What listeners() reports for a listening socket whose owner cannot be read (Linux: another user's process,
 * so its /proc/<pid>/fd is closed to us). It counts as busy, and it is never a pid: killTree ignores it.
 */
const UNKNOWN_OWNER = -1;

/** "pid 123", or why there is no pid: how a message names the owner of a listening socket. */
const ownerText = (pid) => (pid === UNKNOWN_OWNER ? 'owner not readable' : `pid ${pid}`);

/** Ends the process tree rooted at pid. Safe to call for a pid that has already gone, or for none. */
function killTree(pid) {
  if (!(pid > 0)) return; // none, 0, or UNKNOWN_OWNER: a negative number would address a process group
  if (WINDOWS) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  for (const target of [-pid, pid]) {
    try {
      process.kill(target, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

/** Ends every command this process started and has not seen finish. */
function killAll() {
  for (const pid of live) killTree(pid);
  live.clear();
}

/** PATH with the directory of the running Node first, so child `node` and `npm` match this Node. */
function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
  env[key] = [path.dirname(process.execPath), env[key]].filter(Boolean).join(path.delimiter);
  return env;
}

/** The last `lines` lines of some text. */
function tail(text, lines = 30) {
  const all = String(text).replace(/\r/g, '').split('\n');
  while (all.length && all[all.length - 1].trim() === '') all.pop();
  return all.slice(-lines).join('\n');
}

/**
 * Runs a shell command line and resolves when it ends (never rejects).
 * @param {string} commandLine
 * @param {{ cwd?: string, env?: object, timeoutMs?: number }} [opts]
 * @returns {Promise<{ code: number|null, timedOut: boolean, output: string }>}
 */
function runCommand(commandLine, { cwd, env, timeoutMs = 10 * 60_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(commandLine, {
      shell: true,
      cwd,
      env: env ?? childEnv(),
      windowsHide: true,
      detached: !WINDOWS, // own process group, so the whole tree can be signalled
    });
    live.add(child.pid);
    let output = '';
    let timedOut = false;
    const take = (chunk) => {
      output += chunk;
      if (output.length > 2_000_000) output = output.slice(-1_000_000);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);
    let finished = false;
    const finish = (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      live.delete(child.pid);
      killTree(child.pid); // a finished shell can still have left children behind
      resolve({ code, timedOut, output });
    };
    child.on('error', (err) => {
      output += `\n${err.message}`;
      finish(null);
    });
    // 'close' waits for every stdio pipe to end, and a grandchild that outlives its parent (an emulator
    // shutting down) holds them for a long time. So resolve shortly after 'exit'; the caller then checks
    // the ports itself (sweepPorts).
    child.on('exit', (code) => setTimeout(() => finish(code), 500));
    child.on('close', (code) => finish(code));
  });
}

/** Resolves true when nothing listens on any of the ports, or false after `ms`. */
async function waitPortsFree(ports, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (ports.every((p) => listeners(p).length === 0)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return ports.every((p) => listeners(p).length === 0);
}

/**
 * The socket inodes listening on `port` in the text of /proc/net/tcp or /proc/net/tcp6 (Linux).
 * Each line is "sl local_address rem_address st ... inode"; local_address is HEXIP:HEXPORT and state
 * 0A is LISTEN.
 */
function parseProcNetTcp(text, port) {
  const inodes = [];
  for (const line of String(text).split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 10 || cols[3] !== '0A') continue;
    if (Number.parseInt(cols[1].split(':')[1], 16) === port) inodes.push(cols[9]);
  }
  return inodes;
}

/**
 * Linux, without lsof or ss: the sockets in /proc/net/tcp* mapped to their owners through /proc/<pid>/fd.
 * A LISTEN socket that no readable process owns is reported as UNKNOWN_OWNER (busy, owner not ours to see).
 * `io` is the file system and the /proc folder, a seam for the tests (a fake /proc).
 */
function listenersLinux(port, io = { fs, procRoot: '/proc' }) {
  const { fs: fsApi, procRoot } = io;
  const wanted = new Set();
  for (const file of ['net/tcp', 'net/tcp6']) {
    try {
      parseProcNetTcp(fsApi.readFileSync(`${procRoot}/${file}`, 'utf8'), port).forEach((i) =>
        wanted.add(i),
      );
    } catch {
      // no IPv6 table, or unreadable
    }
  }
  const pids = new Set();
  if (wanted.size === 0) return pids;
  const owned = new Set();
  for (const pid of fsApi.readdirSync(procRoot).filter((n) => /^\d+$/.test(n))) {
    let fds;
    try {
      fds = fsApi.readdirSync(`${procRoot}/${pid}/fd`);
    } catch {
      continue; // gone, or another user's: an inode nobody readable owns is caught below
    }
    for (const fd of fds) {
      try {
        const m = /^socket:\[(\d+)\]$/.exec(fsApi.readlinkSync(`${procRoot}/${pid}/fd/${fd}`));
        if (m && wanted.has(m[1])) {
          pids.add(Number(pid));
          owned.add(m[1]);
        }
      } catch {
        // the fd closed meanwhile
      }
    }
  }
  if ([...wanted].some((inode) => !owned.has(inode))) pids.add(UNKNOWN_OWNER);
  return pids;
}

/**
 * The pids listening on a TCP port: netstat on Windows (IPv4 and IPv6 are listed separately), the
 * /proc tables on Linux, lsof elsewhere (macOS). The Linux and macOS branches have not run on this
 * Windows machine; parseProcNetTcp is unit-tested on real-format text, and CI exercises the rest.
 */
function listeners(port) {
  let pids = new Set();
  if (WINDOWS) {
    for (const protocol of ['tcp', 'tcpv6']) {
      const out =
        spawnSync('netstat', ['-ano', '-p', protocol], { encoding: 'utf8', windowsHide: true })
          .stdout ?? '';
      for (const line of out.split('\n')) {
        const cols = line.trim().split(/\s+/);
        if (cols[3] === 'LISTENING' && cols[1]?.endsWith(`:${port}`)) pids.add(Number(cols[4]));
      }
    }
  } else if (fs.existsSync('/proc/net/tcp')) {
    pids = listenersLinux(port);
  } else {
    const out =
      spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout ?? '';
    for (const pid of out.split('\n').filter(Boolean)) pids.add(Number(pid));
  }
  pids.delete(0);
  return [...pids];
}

/**
 * Proof that nothing is left on `ports`: returns the orphans it found (and ends them), so the
 * caller can report them as a failure instead of letting them leak into the next run.
 * @returns {Array<{ port: number, pid: number }>}
 */
function sweepPorts(ports) {
  const found = [];
  for (const port of ports) {
    for (const pid of listeners(port)) {
      found.push({ port, pid });
      killTree(pid);
    }
  }
  return found;
}

module.exports = {
  parseProcNetTcp,
  listenersLinux,
  UNKNOWN_OWNER,
  ownerText,
  runCommand,
  killTree,
  killAll,
  childEnv,
  tail,
  listeners,
  waitPortsFree,
  sweepPorts,
};
