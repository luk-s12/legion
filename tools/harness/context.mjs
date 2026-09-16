import fs from 'node:fs';
import { contained, fileHash, identity, json, readJson, requireThat, stat, writeExclusive } from './core.mjs';
import { resolveProject } from './catalog.mjs';

export function context(request) {
  const p = resolveProject(request.root, request.project);
  requireThat(Array.isArray(request.sources) && request.sources.length > 0, 'EMPTY_CONTEXT', 'Explicit source paths are required');
  const tags=request.tags || {};
  requireThat(tags && typeof tags==='object' && !Array.isArray(tags) && Object.keys(tags).every(name=>request.sources.includes(name)), 'INVALID_CONTEXT', 'Tags must name selected sources');
  const sources = request.sources.map(name => {
    const file = contained(p.root, name);
    requireThat(stat(file)?.isFile(), 'MISSING_CONTEXT', 'Context source is missing');
    const labels=tags[name] || [];
    requireThat(Array.isArray(labels) && labels.every(t=>typeof t==='string'&&t.trim().length>0), 'INVALID_CONTEXT', 'Source tags must be nonempty strings');
    return { path: name, sha256: fileHash(file), bytes: fs.statSync(file).size, tags:[...new Set(labels)].sort() };
  });
  const payload = { version: 1, project: p.project, sources };
  const id = identity(payload), dest = `.orchestrator/runtime/context/${p.project}/${id}.json`;
  if (!stat(contained(p.root, dest))) writeExclusive(p.root, contained(p.root, dest), json(payload));
  requireThat(identity(readJson(contained(p.root, dest))) === id, 'INVALID_CONTEXT', 'Context index did not verify');
  return { id, path: dest, sources, instruction: 'Read relevant sources by path. This index is derived and grants no ownership or capacity.' };
}
