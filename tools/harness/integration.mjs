import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { contained, fileHash, hash, identity, json, nonce, readJson, relative, requireThat, stat, utc, writeExclusive } from './core.mjs';
import { assertCurrent, bytesFor, changes, loadSnapshot } from './artifacts.mjs';
import { resolveProject } from './catalog.mjs';
import { execute, validateCommand } from './process.mjs';

function treeState(root, directory) {
  const files = {};
  const start = contained(root, directory);
  if (!stat(start)) return files;
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = contained(root, path.join(dir,name)), entry = stat(file);
      if (entry.isDirectory()) walk(file);
      else {
        requireThat(entry.isFile(), 'UNSUPPORTED_ENTRY', 'Integration artifacts must be regular files');
        files[path.relative(start,file).split(path.sep).join('/')] = { sha256: fileHash(file), executable: process.platform !== 'win32' && !!(entry.mode & 0o111) };
      }
    }
  }
  walk(start); return files;
}

export function integrate(request) {
  const p = resolveProject(request.root, request.project);
  requireThat(Array.isArray(request.approvals) && request.approvals.length > 0, 'EMPTY_SET', 'Provide approved story receipts in dependency order');
  const snapshots = request.approvals.map(name => {
    requireThat(name.startsWith(`.orchestrator/projects/${p.project}/approvals/`), 'WRITE_ZONE', 'Approval must be project-scoped');
    const a = readJson(contained(p.root, name));
    const s = loadSnapshot(p.root, a.snapshot);
    requireThat(a.version === 1 && a.verdict === 'APPROVED' && a.snapshot_id === s.id && s.payload.phase === 'candidate' && s.payload.spec.project === p.project, 'INVALID_APPROVAL', 'Receipt must approve a project candidate');
    return assertCurrent(p.root, s);
  });
  requireThat(new Set(snapshots.map(s => s.payload.spec.story)).size === snapshots.length, 'DUPLICATE_STORY', 'Integration set repeats a story');
  const first = snapshots[0];
  for (const s of snapshots) requireThat(s.payload.spec.base_sha === first.payload.spec.base_sha && identity(s.payload.before.files) === identity(first.payload.before.files), 'INCOMPATIBLE_BASES', 'Integration requires the same pinned base and checkout representation');
  const id = nonce(), dirRel = `.orchestrator/runtime/integration/${id}`;
  const dir = contained(p.root, dirRel);
  fs.mkdirSync(dir, { recursive: true });
  const tree = contained(p.root, dirRel + '/repo'); fs.mkdirSync(tree);
  writeExclusive(p.root, contained(p.root, dirRel + '/owner.json'), json({ version: 1, id, project: p.project, snapshots: snapshots.map(s => s.id), at: utc() }));
  const merged = { ...first.payload.before.files };
  const external = {};
  for (const s of snapshots) for (const [name, value] of Object.entries(s.payload.before.external)) {
    requireThat(!Object.hasOwn(external, name) || identity(external[name]) === identity(value), 'INCOMPATIBLE_BASES', 'External initial versions differ'); external[name] = value;
  }
  const conflicts = [];
  function applyDelta(delta, target) {
    for (const change of delta) {
      const current = target[change.path] || null;
      if (identity(current) === identity(change.after)) continue;
      if (identity(current) === identity(change.before)) { target[change.path] = change.after; continue; }
      if (!current || !change.before || !change.after || current.mode !== change.before.mode || change.after.mode !== change.before.mode) {
        conflicts.push(change.path); continue;
      }
      const versions = [current, change.before, change.after].map(e => bytesFor(p.root, e.sha256));
      if (versions.some(b => b.includes(0))) { conflicts.push(change.path); continue; }
      const inputs = versions.map((b, i) => {
        const file = contained(p.root, dirRel + `/merge-${nonce()}-${i}`); writeExclusive(p.root, file, b); return file;
      });
      const result = spawnSync('git', ['merge-file', '-p', '--', ...inputs], { windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 30000 });
      if (result.status !== 0 || result.error) { conflicts.push(change.path); continue; }
      const sha = hash(result.stdout), object = contained(p.root, '.orchestrator/runtime/objects/' + sha);
      if (!stat(object)) writeExclusive(p.root, object, result.stdout);
      target[change.path] = { sha256: sha, mode: current.mode };
    }
  }
  for (const s of snapshots) {
    applyDelta(changes(s.payload.before.files, s.payload.state.files), merged);
    applyDelta(changes(s.payload.before.external, s.payload.state.external), external);
  }
  function materialize(entries, prefix) {
    for (const [name, entry] of Object.entries(entries)) if (entry) {
      const destination = contained(p.root, `${dirRel}/${prefix}/${name}`);
      writeExclusive(p.root, destination, bytesFor(p.root, entry.sha256));
      if (process.platform !== 'win32') fs.chmodSync(destination, entry.mode === '100755' ? 0o755 : 0o644);
    }
  }
  // All source reads and writes target distinct contained trees; no original index is touched.
  materialize(merged, 'repo'); materialize(external, 'external');
  let stale = false;
  for (const s of snapshots) { try { assertCurrent(p.root, s); } catch { stale = true; } }
  const report = { version: 1, id, project: p.project, base_sha: first.payload.spec.base_sha,
    snapshots: snapshots.map(s => s.id), approvals: request.approvals, status: stale ? 'STALE' : conflicts.length ? 'CONFLICTED' : 'MATERIALIZED',
    conflicts: [...new Set(conflicts)], tree: dirRel + '/repo', external: dirRel + '/external',
    tree_state: treeState(p.root, dirRel + '/repo'), external_state: treeState(p.root, dirRel + '/external'),
    approval_hashes: request.approvals.map(name => fileHash(contained(p.root,name))),
    checks: [], checked_at: utc(), functional_verification: 'NOT_RUN' };
  const reportRel = `.orchestrator/projects/${p.project}/integration/${id}.json`;
  writeExclusive(p.root, contained(p.root, reportRel), json(report));
  return { ...report, report: reportRel };
}

export async function verifyIntegration(request) {
  const p = resolveProject(request.root, request.project);
  requireThat(request.report?.startsWith(`.orchestrator/projects/${p.project}/integration/`), 'WRITE_ZONE', 'Integration report must be project-scoped');
  const report = readJson(contained(p.root,request.report));
  requireThat(report.version === 1 && report.project === p.project && report.status === 'MATERIALIZED', 'INVALID_INTEGRATION', 'Only a clean materialized set may run verification');
  requireThat(Array.isArray(request.checks) && request.checks.length > 0 &&
    request.checks.every(c => typeof c.id === 'string' && c.id && ['repo','external'].includes(c.cwd)) &&
    new Set(request.checks.map(c => c.id)).size === request.checks.length && typeof request.environment_key === 'string',
  'INVALID_CHECKS', 'Supply distinct required integration checks and environment identity');
  const runRoot = `.orchestrator/runtime/integration/${report.id}`;
  requireThat(report.tree === runRoot + '/repo' && report.external === runRoot + '/external', 'INVALID_INTEGRATION', 'Unexpected materialization paths');
  const owner = readJson(contained(p.root,runRoot + '/owner.json'));
  requireThat(owner.id === report.id && owner.project === p.project && identity(owner.snapshots) === identity(report.snapshots), 'INVALID_OWNER', 'Integration run identity changed');
  const currentSources = () => {
    for (let i=0;i<report.approvals.length;i++) {
      const file=contained(p.root,report.approvals[i]);
      requireThat(fileHash(file) === report.approval_hashes[i], 'STALE_INTEGRATION', 'Approval changed');
      const approval=readJson(file), snapshot=loadSnapshot(p.root,approval.snapshot);
      requireThat(snapshot.id === report.snapshots[i], 'STALE_INTEGRATION', 'Integration input changed');
      assertCurrent(p.root,snapshot);
    }
  };
  currentSources();
  requireThat(identity(treeState(p.root,report.tree)) === identity(report.tree_state) &&
    identity(treeState(p.root,report.external)) === identity(report.external_state), 'STALE_INTEGRATION', 'Materialized content changed before verification');
  request.checks.forEach(c => validateCommand(c.command));
  // Validate exclusions before executing anything, and never let them hide source inputs.
  const generated=request.generated_paths || [];
  requireThat(Array.isArray(generated), 'INVALID_EXCLUSION', 'Generated paths must be an explicit list');
  for(const name of generated) {
    relative(name);
    contained(p.root,runRoot + '/repo/' + name);
    requireThat(!Object.keys(report.tree_state).some(f=>f===name||f.startsWith(name+'/')), 'INVALID_EXCLUSION', 'Generated paths cannot exclude source inputs');
  }
  const id=nonce(), results=[];
  for (const check of request.checks) {
    const log=`.orchestrator/projects/${p.project}/integration/${id}-${results.length}.log`;
    writeExclusive(p.root,contained(p.root,log),'');
    const result=await execute(check.command,contained(p.root,check.cwd === 'repo' ? report.tree : report.external),contained(p.root,log));
    results.push({ id:check.id,command:check.command,cwd:check.cwd,log,...result });
    if (result.status !== 'PASSED') break;
  }
  let stale=false;
  try { currentSources(); } catch { stale=true; }
  const after=treeState(p.root,report.tree);
  for(const name of Object.keys(after)) if(generated.some(g=>name===g||name.startsWith(g+'/'))) delete after[name];
  const mutated=identity(after)!==identity(report.tree_state)||identity(treeState(p.root,report.external))!==identity(report.external_state);
  const status=stale?'STALE':mutated?'MUTATED':results.length===request.checks.length&&results.every(r=>r.status==='PASSED')?'VERIFIED':'FAILED';
  const receipt={version:1,id,set_id:report.id,report:request.report,snapshots:report.snapshots,status,checks:results,
    environment_key:request.environment_key,generated_paths:generated,checked_at:utc(),cache_reusable:false};
  const dest=`.orchestrator/projects/${p.project}/integration/${id}-verification.json`;
  writeExclusive(p.root,contained(p.root,dest),json(receipt));
  return {...receipt,path:dest};
}
