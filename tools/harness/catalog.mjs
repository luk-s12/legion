import fs from 'node:fs';
import { contained, rootPath, requireThat, segment, git, hash, samePath, stat } from './core.mjs';

// The distribution uses this deliberately small mapping subset. Unsupported YAML
// is rejected without rewriting it; JSON is also YAML and is accepted in full.
export function mapping(text) {
  text = text.replace(/^\uFEFF/, '');
  if (text.trim().startsWith('{')) return JSON.parse(text);
  const root = Object.create(null);
  const stack = [{ indent: -1, value: root }];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#') || raw.trim() === '---') continue;
    const m = /^( *)([A-Za-z0-9_-]+):(?: +(.*))?$/.exec(raw);
    requireThat(m && m[1].length % 2 === 0, 'UNSUPPORTED_YAML', 'Use two-space block mappings or JSON; no aliases or duplicate keys');
    const indent = m[1].length;
    while (stack.at(-1).indent >= indent) stack.pop();
    requireThat(indent === stack.at(-1).indent + (stack.length === 1 ? 1 : 2), 'UNSUPPORTED_YAML', 'Unexpected mapping indentation');
    const parent = stack.at(-1).value;
    requireThat(!Object.hasOwn(parent, m[2]) && !['__proto__', 'prototype', 'constructor'].includes(m[2]), 'DUPLICATE_KEY', 'Duplicate or reserved key');
    let value = m[3]?.trim();
    if (!value) { parent[m[2]] = Object.create(null); stack.push({ indent, value: parent[m[2]] }); continue; }
    if (value.startsWith('"')) {
      const quoted = /^("(?:[^"\\]|\\.)*")(?:\s+#.*)?$/.exec(value);
      requireThat(quoted, 'UNSUPPORTED_YAML', 'Invalid quoted scalar'); value = JSON.parse(quoted[1]);
    } else if (value.startsWith("'")) {
      const quoted = /^'((?:[^']|'')*)'(?:\s+#.*)?$/.exec(value);
      requireThat(quoted, 'UNSUPPORTED_YAML', 'Invalid quoted scalar'); value = quoted[1].replaceAll("''", "'");
    } else {
      value = value.replace(/\s+#.*$/, '');
      requireThat(!/[\[\]&*!|>]/.test(value), 'UNSUPPORTED_YAML', 'Unsupported YAML scalar');
      if (value === '{}') value = Object.create(null);
      else if (/^\d+$/.test(value)) value = Number(value);
      else requireThat(!/[{}]/.test(value) && !/^(true|false|null|~)$/i.test(value), 'UNSUPPORTED_YAML', 'Unsupported scalar');
    }
    parent[m[2]] = value;
  }
  return root;
}
export function catalog(root) {
  root = rootPath(root);
  const file = contained(root, '.orchestrator/projects.yml');
  requireThat(stat(file)?.isFile(), 'BOOTSTRAP_REQUIRED', 'Missing catalog: follow bootstrap-contract.md');
  const raw = fs.readFileSync(file, 'utf8');
  const data = mapping(raw);
  requireThat(data.version === 1 && data.projects && typeof data.projects === 'object' && !Array.isArray(data.projects) &&
    Object.keys(data).every(k => ['version', 'projects'].includes(k)), 'INVALID_CATALOG', 'Invalid catalog v1');
  for (const [slug, entry] of Object.entries(data.projects)) {
    requireThat(/^[a-z0-9][a-z0-9-]*$/.test(slug), 'INVALID_PROJECT', 'Invalid project slug'); segment(slug);
    requireThat(entry && typeof entry === 'object' && !Array.isArray(entry), 'INVALID_CATALOG', 'Invalid project entry');
    requireThat(Object.keys(entry).every(k => ['repo_dir','base_branch','branch_prefix','max_parallel','remote'].includes(k)), 'INVALID_CATALOG', 'Unknown project key');
    segment(entry.repo_dir);
    for (const key of ['base_branch','branch_prefix']) requireThat(typeof entry[key] === 'string' && /^[A-Za-z0-9][A-Za-z0-9/._-]*$/.test(entry[key]), 'INVALID_REF', 'Invalid catalog ref');
    requireThat(Number.isSafeInteger(entry.max_parallel) && entry.max_parallel > 0, 'INVALID_CATALOG', 'max_parallel must be positive');
    if (entry.remote !== undefined) requireThat(typeof entry.remote === 'string' && !/[\s@?#]/.test(entry.remote) && !entry.remote.includes('://'), 'INVALID_REMOTE', 'Remote must be credential-free host/owner/repo');
  }
  return { root, data, hash: hash(raw) };
}
export function resolveProject(root, slug, { inspectMigration = true } = {}) {
  segment(slug);
  const c = catalog(root);
  if (inspectMigration) requireThat(!stat(contained(c.root, '.orchestrator/migration-in-progress.md')), 'MIGRATION_PENDING', 'Resolve migration markers before runtime mutation');
  const entry = c.data.projects[slug];
  requireThat(entry, 'UNKNOWN_PROJECT', 'Project not registered; follow bootstrap-contract.md');
  const repo = contained(c.root, 'workspace/' + entry.repo_dir);
  requireThat(stat(repo)?.isDirectory(), 'INVALID_REPO', 'Project repository is absent');
  requireThat(samePath(git(repo, ['rev-parse', '--show-toplevel']).trim(), repo), 'INVALID_REPO', 'Catalog path must be the Git root');
  git(repo, ['check-ref-format', 'refs/heads/' + entry.base_branch]);
  git(repo, ['check-ref-format', 'refs/heads/' + entry.branch_prefix + '/probe']);
  if (entry.remote) {
    const raw = git(repo, ['remote', 'get-url', 'origin']).trim();
    let sanitized;
    if (/^[\w.-]+@[^:]+:/.test(raw)) sanitized = raw.replace(/^[^@]+@/, '').replace(':', '/');
    else { try { const u = new URL(raw); sanitized = u.host + u.pathname; } catch { sanitized = ''; } }
    requireThat(sanitized.replace(/\.git$/, '').replace(/\/$/, '') === entry.remote.replace(/\.git$/, ''), 'REMOTE_MISMATCH', 'Repository remote does not match catalog');
  }
  return { root: c.root, project: slug, repo, entry, catalog_hash: c.hash };
}
