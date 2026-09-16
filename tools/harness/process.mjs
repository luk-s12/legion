import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { requireThat, utc } from './core.mjs';

export function validateCommand(command) {
  requireThat(command && typeof command.executable === 'string' && path.isAbsolute(command.executable) &&
    !/\.(cmd|bat)$/i.test(command.executable) && Array.isArray(command.args) && command.args.every(a => typeof a === 'string'),
  'INVALID_COMMAND', 'Provide an absolute executable and argument array; no implicit shell or batch expansion');
  const timeout = command.timeout_ms ?? 120000;
  requireThat(Number.isInteger(timeout) && timeout >= 1 && timeout <= 3600000, 'INVALID_TIMEOUT', 'Timeout must be 1ms..1h');
  return timeout;
}

// Caller owns the log and has validated cwd/authorization. Commands are trusted
// repo checks, not arbitrary untrusted code contained by a security sandbox.
export async function execute(command, cwd, logFile) {
  const timeout = validateCommand(command);
  const log = fs.openSync(logFile, 'a'), started = Date.now();
  let timedOut = false, spawnError = false, exitCode = null, terminationConfirmed = true;
  try {
    exitCode = await new Promise(resolve => {
      const child = spawn(command.executable, command.args, { cwd, shell: false, windowsHide: true,
        detached: process.platform !== 'win32', stdio: ['ignore', log, log], env: { ...process.env, CI: '1' } });
      let cleanupTimer, fallbackTimer;
      const terminateParent = () => { try { child.kill('SIGKILL'); } catch { terminationConfirmed = false; } };
      const timer = setTimeout(() => {
        timedOut = true;
        terminationConfirmed = false;
        // A host may deny taskkill/process enumeration. Never let that make the
        // timeout itself unbounded; preserve a failed result and retain claims.
        fallbackTimer = setTimeout(terminateParent, 1000);
        cleanupTimer = setTimeout(() => { terminationConfirmed = false; child.unref(); resolve(null); }, 3000);
        if (process.platform === 'win32') {
          const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          const killerTimer = setTimeout(() => { try { killer.kill(); } catch {} killer.unref(); }, 1500);
          killer.on('error', terminateParent);
          killer.on('close', code => { clearTimeout(killerTimer); if (code === 0) terminationConfirmed = true; else terminateParent(); });
        } else { try { process.kill(-child.pid, 'SIGKILL'); terminationConfirmed = true; } catch { terminateParent(); } }
      }, timeout);
      child.once('error', () => { spawnError = true; clearTimeout(timer); resolve(null); });
      child.once('close', code => { clearTimeout(timer); clearTimeout(cleanupTimer); clearTimeout(fallbackTimer); resolve(code); });
    });
  } finally { fs.closeSync(log); }
  return { status: timedOut ? 'TIMEOUT' : spawnError ? 'SPAWN_FAILED' : exitCode === 0 ? 'PASSED' : 'FAILED',
    exit_code: exitCode, termination_confirmed: terminationConfirmed, started_at: new Date(started).toISOString(), finished_at: utc(), duration_ms: Date.now() - started };
}
