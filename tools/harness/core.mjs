import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export class HarnessError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export function requireThat(condition, code, message) {
  if (!condition) throw new HarnessError(code, message);
}
export const hash = data => crypto.createHash('sha256').update(data).digest('hex');
export const json = value => JSON.stringify(value, null, 2) + '\n';
export const utc = () => new Date().toISOString();
export const nonce = () => crypto.randomUUID();
export const samePath = (a, b) => process.platform === 'win32'
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
  : path.resolve(a) === path.resolve(b);
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const identity = value => hash(JSON.stringify(canonical(value)));
export function stat(file) {
  try { return fs.lstatSync(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
export function segment(value) {
  requireThat(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) &&
    !value.includes('..') && !/[. ]$/.test(value) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value), 'INVALID_SEGMENT', 'Invalid single path segment');
  return value;
}
export function relative(value) {
  requireThat(typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) &&
    !/[\\\x00-\x1f:*?"<>|]/.test(value), 'INVALID_PATH', 'Expected a relative slash-separated path');
  for (const part of value.split('/')) requireThat(part && part !== '.' && part !== '..' &&
    !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part), 'INVALID_PATH', 'Unsafe path component');
  return value;
}
export function rootPath(root) {
  const result = path.resolve(root);
  requireThat(stat(result)?.isDirectory() && !stat(result).isSymbolicLink(), 'INVALID_ROOT', 'Root must be an existing real directory');
  requireThat(samePath(fs.realpathSync(result), result), 'LINK_PATH', 'Root must be physically canonical');
  return result;
}
export function contained(root, name) {
  root = rootPath(root);
  const target = path.isAbsolute(name) ? path.resolve(name) : path.resolve(root, relative(name));
  const rel = path.relative(root, target);
  requireThat(rel && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel), 'PATH_ESCAPE', 'Path must be strictly inside its root');
  let cursor = root;
  for (const part of rel.split(path.sep)) {
    requireThat(part !== '..' && !/[\x00-\x1f:*?"<>|]/.test(part), 'INVALID_PATH', 'Invalid path component');
    cursor = path.join(cursor, part);
    const s = stat(cursor);
    requireThat(!s?.isSymbolicLink(), 'LINK_PATH', 'Symlinks and junctions are not supported: ' + rel);
    if (s && cursor !== target) requireThat(s.isDirectory(), 'NOT_DIRECTORY', 'Parent is not a directory');
  }
  return target;
}
export function ensureParent(root, file) {
  contained(root, file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  contained(root, file);
}
export function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (e) { throw new HarnessError('INVALID_RECORD', 'Cannot read JSON record: ' + path.basename(file)); }
}
export function fileHash(file) {
  const s = stat(file);
  requireThat(!s || s.isFile(), 'INVALID_FILE', 'Expected a regular file');
  return s ? hash(fs.readFileSync(file)) : null;
}
export function writeExclusive(root, file, data) {
  ensureParent(root, file);
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
export function replaceFile(root, file, data, expected) {
  contained(root, file);
  requireThat(fileHash(file) === expected, 'STALE_INPUT', 'Destination changed before publication');
  const candidate = file + '.candidate-' + nonce();
  writeExclusive(root, candidate, data);
  requireThat(fileHash(file) === expected, 'STALE_INPUT', 'Destination changed during publication; candidate retained');
  fs.renameSync(candidate, file);
  requireThat(fileHash(file) === hash(data), 'PUBLICATION_FAILED', 'Published content did not verify');
}
export function git(repo, args, options = {}) {
  const environment = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
  for (const key of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES','GIT_COMMON_DIR']) delete environment[key];
  const result = spawnSync('git', ['--no-optional-locks', '-C', repo, ...args], {
    encoding: options.binary ? null : 'utf8', input: options.input,
    windowsHide: true, timeout: 30000, maxBuffer: 128 * 1024 * 1024,
    env: environment,
  });
  requireThat(!result.error && result.status === 0, 'GIT_FAILED', 'Git inspection failed: ' + args[0]);
  return result.stdout;
}
export function commitSha(repo, ref) {
  requireThat(typeof ref === 'string' && /^[A-Za-z0-9][A-Za-z0-9/._-]*$/.test(ref), 'INVALID_REF', 'Invalid ref');
  return git(repo, ['rev-parse', '--verify', ref + '^{commit}']).trim();
}
export function worktrees(repo) {
  return git(repo, ['worktree', 'list', '--porcelain']).trim().split(/\r?\n\r?\n/).filter(Boolean).map(block => {
    const lines = block.split(/\r?\n/);
    return { path: lines.find(l => l.startsWith('worktree '))?.slice(9), branch: lines.find(l => l.startsWith('branch '))?.slice(7) };
  });
}
export function validateWorktree({ root, repo, worktree, branch, operation }) {
  const target = contained(root, worktree);
  requireThat(['create', 'move', 'reuse', 'remove'].includes(operation), 'INVALID_OPERATION', 'Unknown worktree operation');
  git(repo, ['check-ref-format', 'refs/heads/' + branch]);
  const matching = worktrees(repo).filter(w => w.branch === 'refs/heads/' + branch);
  if (operation === 'create' || operation === 'move') {
    requireThat(!stat(target), 'DESTINATION_EXISTS', 'New worktree destination already exists');
    if (operation === 'create') requireThat(matching.length === 0, 'WORKTREE_EXISTS', 'Branch already has a worktree');
    else requireThat(matching.length === 1, 'WORKTREE_MISMATCH', 'Move requires exactly one existing source');
  } else {
    requireThat(stat(target)?.isDirectory() && matching.length === 1 &&
      samePath(matching[0].path, target), 'WORKTREE_MISMATCH', 'Existing worktree identity does not match');
    if (operation === 'remove') requireThat(git(target, ['status', '--porcelain', '--untracked-files=all']).trim() === '', 'DIRTY_WORKTREE', 'Worktree contains unsaved changes');
  }
  return target;
}
