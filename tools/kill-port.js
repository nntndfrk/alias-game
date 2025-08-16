#!/usr/bin/env node

/**
 * Cross-platform script to kill a process that is listening on a specific TCP port.
 *
 * Usage: node tools/kill-port.js <port>
 * - Exits with code 0 if nothing is listening on the port (idempotent).
 * - Attempts to kill the owning process forcefully when found.
 */

const { execSync, spawnSync } = require('child_process');

function log(msg) {
  console.log(`[kill-port] ${msg}`);
}

function warn(msg) {
  console.warn(`[kill-port] ${msg}`);
}

function fail(msg) {
  console.error(`[kill-port] ${msg}`);
}

function getPortArg() {
  const portStr = process.argv[2];
  if (!portStr) {
    fail('Port argument is required. Usage: node tools/kill-port.js <port>');
    process.exit(2);
  }
  const port = Number(portStr);
  if (!Number.isInteger(port) || port <= 0) {
    fail(`Invalid port: ${portStr}`);
    process.exit(2);
  }
  return port;
}

function killOnUnix(port) {
  // Try lsof first
  try {
    const pidsStr = execSync(`lsof -t -i tcp:${port}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const pids = pidsStr
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (pids.length === 0) return false;

    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch (_) {
        // ignore
      }
    }

    // Give it a moment, then SIGKILL any survivors
    const start = Date.now();
    while (Date.now() - start < 1000) {
      // busy wait a little
    }

    let anyAlive = false;
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 0);
        anyAlive = true;
      } catch (_) {}
    }
    if (anyAlive) {
      for (const pid of pids) {
        try {
          process.kill(Number(pid), 'SIGKILL');
        } catch (_) {}
      }
    }
    return true;
  } catch (e) {
    // lsof not available or no matches; try fuser
    try {
      const res = spawnSync('fuser', ['-k', `${port}/tcp`], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      // Exit code 0 means killed; 1 means no process matched; treat both as handled
      return res.status === 0;
    } catch (e2) {
      // Neither lsof nor fuser worked; assume nothing to kill
      return false;
    }
  }
}

function killOnWindows(port) {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, {
      shell: 'cmd.exe',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();

    if (!output) return false;

    // Parse netstat lines, extract last column PID
    const pids = new Set();
    output.split(/\r?\n/).forEach((line) => {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) pids.add(pid);
    });

    if (pids.size === 0) return false;

    pids.forEach((pid) => {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      } catch (_) {}
    });
    return true;
  } catch (e) {
    // findstr returned nothing or netstat failed
    return false;
  }
}

(function main() {
  const port = getPortArg();
  const platform = process.platform;
  log(`Ensuring no process is listening on port ${port}...`);

  let killed = false;
  if (platform === 'win32') {
    killed = killOnWindows(port);
  } else {
    killed = killOnUnix(port);
  }

  if (killed) {
    log(`Killed process(es) on port ${port}.`);
  } else {
    log(`No process found on port ${port}.`);
  }
  // Always exit 0 for idempotency
  process.exit(0);
})();
