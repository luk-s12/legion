import fs from 'node:fs';
import path from 'node:path';
import { contained, fileHash, git, hash, identity, json, readJson, requireThat, segment, stat, utc, validateWorktree, writeExclusive } from './core.mjs';
import { resolveProject } from './catalog.mjs';

function blob(root, bytes) {
  const id = hash(bytes), file = contained(root, '.orchestrator/runtime/objects/' + id);
  if (!stat(file)) { try { writeExclusive(root, file, bytes); } catch (e) { if (e.code !== 'EEXIST') throw e; } }
  requireThat(fileHash(file) === id, 'CORRUPT_OBJECT', 'Object content does not match hash');
  return id;
}
export function bytesFor(root, id) {
  requireThat(/^[a-f0-9]{64}$/.test(id), 'INVALID_HASH', 'Expected SHA-256');
  const bytes = fs.readFileSync(contained(root, '.orchestrator/runtime/objects/' + id));
  requireThat(hash(bytes) === id, 'CORRUPT_OBJECT', 'Object content does not match hash');
  return bytes;
}
function worktreeFiles(worktree, store, root, sensitive) {
  const indexed = git(worktree, ['ls-files', '--stage', '-z']);
  const modes = new Map();
  for (const line of indexed.split('\0').filter(Boolean)) {
    const m = /^(\d+) [a-f0-9]+ (\d)\t([\s\S]+)$/.exec(line);
    requireThat(m && m[2] === '0' && ['100644','100755'].includes(m[1]), 'UNSUPPORTED_ENTRY', 'Unmerged entries, symlinks and submodules require manual handling');
    modes.set(m[3], m[1]);
  }
  const names = [...new Set(git(worktree, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))].sort();
  const files = {};
  for (const name of names) {
    const file = contained(worktree, name), s = stat(file);
    if (!s) continue;
    requireThat(s.isFile(), 'UNSUPPORTED_ENTRY', 'Only regular artifacts are supported');
    requireThat(!/(^|\/)(\.env(?:\..*)?|id_rsa|id_ed25519|[^/]*\.pem)$/i.test(name) || sensitive.includes(name), 'SENSITIVE_ARTIFACT', 'Explicit inclusion required for a sensitive-looking artifact');
    const bytes = fs.readFileSync(file);
    files[name] = { sha256: store ? blob(root, bytes) : hash(bytes), mode: process.platform === 'win32' ? (modes.get(name) || '100644') : (s.mode & 0o111 ? '100755' : '100644') };
  }
  return { files, index_sha256: hash(indexed) };
}
function externals(root, project, names, store, sensitive) {
  const result = {};
  for (const name of [...names].sort()) {
    requireThat(name.startsWith('docs/' + project + '/') || name.startsWith('scripts/' + project + '/'), 'WRITE_ZONE', 'External artifact must be in project docs/scripts');
    const file = contained(root, name), s = stat(file);
    requireThat(!s || s.isFile(), 'UNSUPPORTED_ENTRY', 'External artifact must be a regular file');
    requireThat(!s || !/(^|\/)(\.env(?:\..*)?|id_rsa|id_ed25519|[^/]*\.pem)$/i.test(name) || sensitive.includes(name), 'SENSITIVE_ARTIFACT', 'Explicit inclusion required for a sensitive-looking external artifact');
    result[name] = s ? { sha256: store ? blob(root, fs.readFileSync(file)) : fileHash(file), mode: '100644' } : null;
  }
  return result;
}
function state(root, spec, store) {
  const worktree = contained(root, spec.worktree);
  const branch = git(worktree, ['branch', '--show-current']).trim();
  requireThat(branch === spec.branch, 'BRANCH_MISMATCH', 'Story branch changed');
  requireThat(git(worktree, ['rev-parse', 'HEAD']).trim() === spec.base_sha, 'BASE_CHANGED', 'Worktree HEAD is not its pinned base');
  const content = worktreeFiles(worktree, store, root, spec.sensitive || []);
  const storyFile = contained(root, spec.story_file), designFile = contained(root, spec.design_file);
  requireThat(fileHash(storyFile) && fileHash(designFile), 'MISSING_CONTEXT', 'Story and approved design evidence are required');
  const commonDir = path.resolve(worktree, git(worktree, ['rev-parse','--git-common-dir']).trim());
  contained(root, commonDir);
  return { ...content, git_common_dir: commonDir, external: externals(root, spec.project, spec.external_paths, store, spec.sensitive || []), story_sha256: fileHash(storyFile), design_sha256: fileHash(designFile) };
}
export function loadSnapshot(root, name) {
  const s = readJson(contained(root, name));
  requireThat(s.version === 1 && s.id === identity(s.payload), 'INVALID_SNAPSHOT', 'Unknown version or corrupt snapshot');
  return s;
}
export function capture(request) {
  const p = resolveProject(request.root, request.project);
  segment(request.story);
  const spec = { project: request.project, story: request.story,
    worktree: path.relative(p.root, contained(p.root, request.worktree)).split(path.sep).join('/'),
    branch: request.branch, base_sha: request.base_sha, story_file: request.story_file, design_file: request.design_file,
    external_paths: request.external || [], sensitive: request.sensitive || [] };
  requireThat(/^[a-f0-9]{40,64}$/.test(spec.base_sha), 'INVALID_BASE', 'BASE_SHA must be a full immutable commit id');
  requireThat(spec.worktree.startsWith('workspace/worktrees/' + request.project + '/'), 'WRITE_ZONE', 'Snapshot requires the namespaced project worktree');
  validateWorktree({ root:p.root,repo:p.repo,worktree:spec.worktree,branch:spec.branch,operation:'reuse' });
  const base = request.baseline ? loadSnapshot(p.root, request.baseline) : null;
  if (base) requireThat(base.payload.phase === 'baseline' && identity(base.payload.spec) === identity(spec), 'BASELINE_MISMATCH', 'Baseline context changed; reapprove the design and recapture explicitly');
  else requireThat(git(contained(p.root, spec.worktree), ['status', '--porcelain', '--untracked-files=all']).trim() === '', 'DIRTY_BASELINE', 'Baseline requires a clean provisioned worktree');
  const current = state(p.root, spec, true);
  requireThat(identity(current) === identity(state(p.root, spec, false)), 'UNSTABLE_SNAPSHOT', 'Sources changed during snapshot');
  const payload = { version: 1, phase: base ? 'candidate' : 'baseline', spec, baseline_id: base?.id || null, state: current,
    before: base ? { files: base.payload.state.files, external: base.payload.state.external } : null };
  const id = identity(payload), name = `.orchestrator/projects/${request.project}/artifacts/${request.story}/${id}.json`;
  const file = contained(p.root, name);
  if (!stat(file)) writeExclusive(p.root, file, json({ version: 1, id, captured_at: utc(), payload }));
  requireThat(loadSnapshot(p.root, name).id === id, 'INVALID_SNAPSHOT', 'Snapshot publication failed');
  return { id, path: name, phase: payload.phase, artifacts: Object.keys(current.files).length + Object.keys(current.external).length };
}
export function assertCurrent(root, snapshot) {
  requireThat(identity(snapshot.payload.state) === identity(state(root, snapshot.payload.spec, false)), 'STALE_SNAPSHOT', 'Artifacts, index, story or design changed after capture');
  return snapshot;
}
export function verifySnapshot(request) {
  const p = resolveProject(request.root, request.project);
  const s = loadSnapshot(p.root, request.snapshot);
  requireThat(s.payload.spec.project === request.project, 'PROJECT_MISMATCH', 'Snapshot belongs to another project');
  assertCurrent(p.root, s);
  return { id: s.id, current: true, phase: s.payload.phase };
}
export function changes(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().filter(name => identity(before[name] || null) !== identity(after[name] || null))
    .map(name => ({ path: name, before: before[name] || null, after: after[name] || null }));
}
