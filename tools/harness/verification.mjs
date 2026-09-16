import path from 'node:path';
import { execute, validateCommand } from './process.mjs';
import { contained, identity, json, nonce, requireThat, writeExclusive } from './core.mjs';
import { assertCurrent, loadSnapshot } from './artifacts.mjs';
import { resolveProject } from './catalog.mjs';

export async function runVerification(request) {
  const p = resolveProject(request.root, request.project);
  const snapshot = loadSnapshot(p.root, request.snapshot);
  requireThat(snapshot.payload.spec.project === request.project, 'PROJECT_MISMATCH', 'Snapshot project mismatch');
  assertCurrent(p.root, snapshot);
  const command = request.command;
  validateCommand(command);
  requireThat(typeof request.check_id === 'string' && request.check_id.length > 0 && typeof request.environment_key === 'string', 'INVALID_CHECK', 'Check ID and non-secret environment identity are required');
  const cwd = contained(p.root, command.cwd);
  const allowedCwd = [contained(p.root, snapshot.payload.spec.worktree), contained(p.root, 'docs/' + p.project), contained(p.root, 'scripts/' + p.project)];
  requireThat(allowedCwd.some(d => cwd === d || cwd.startsWith(d + path.sep)), 'WRITE_ZONE', 'Verification cwd is outside story artifact zones');
  const run = nonce();
  const logRel = `.orchestrator/projects/${p.project}/verification/${run}.log`;
  const logFile = contained(p.root, logRel);
  writeExclusive(p.root, logFile, '');
  const execution = await execute(command, cwd, logFile);
  let mutated = false;
  try { assertCurrent(p.root, snapshot); } catch { mutated = true; }
  const record = { version: 1, run, check_id: request.check_id, snapshot_id: snapshot.id,
    command, environment_key: request.environment_key, inputs_id: identity({ snapshot: snapshot.id, command, environment_key: request.environment_key }),
    ...execution, status: mutated ? 'MUTATED' : execution.status, mutated,
    log: logRel, cache_reusable: false };
  const resultRel = `.orchestrator/projects/${p.project}/verification/${run}.json`;
  writeExclusive(p.root, contained(p.root, resultRel), json(record));
  return { ...record, path: resultRel };
}
