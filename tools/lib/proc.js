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

const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const live = new Set();
const WINDOWS = process.platform === 'win32';

/** Ends the process tree rooted at pid. Safe to call for a pid that has already gone. */
function killTree(pid) {
  if (!pid) return;
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

/** The pids listening on a TCP port (best effort: netstat on Windows, lsof elsewhere). */
function listeners(port) {
  const pids = new Set();
  if (WINDOWS) {
    // IPv4 and IPv6 are listed separately; a server bound to ::1 only (localhost on Node 18+) is in tcpv6.
    for (const protocol of ['tcp', 'tcpv6']) {
      const out =
        spawnSync('netstat', ['-ano', '-p', protocol], { encoding: 'utf8', windowsHide: true })
          .stdout ?? '';
      for (const line of out.split('\n')) {
        const cols = line.trim().split(/\s+/);
        if (cols[3] === 'LISTENING' && cols[1]?.endsWith(`:${port}`)) pids.add(Number(cols[4]));
      }
    }
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
  runCommand,
  killTree,
  killAll,
  childEnv,
  tail,
  listeners,
  waitPortsFree,
  sweepPorts,
};
