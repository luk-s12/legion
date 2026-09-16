import fs from 'node:fs';
import path from 'node:path';
import { commitSha, contained, fileHash, git, hash, identity, json, nonce, readJson, replaceFile, requireThat, samePath, segment, stat, utc, worktrees, writeExclusive } from './core.mjs';
import { catalog, resolveProject } from './catalog.mjs';
import { assertCurrent, changes, loadSnapshot } from './artifacts.mjs';

export function acquire(root, lock, owner) {
  const dir = contained(root, lock);
  requireThat(owner.session_id && owner.command && owner.project, 'INVALID_OWNER', 'Owner requires session, command and project');
  const value = { version: 1, ...owner, lock_id: nonce(), acquired_at: utc() };
  const candidate = dir + '.owner.candidate-' + value.lock_id;
  writeExclusive(root, candidate, json(value));
  try { fs.mkdirSync(dir); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    fs.unlinkSync(candidate);
    requireThat(false, 'LOCK_BUSY', 'Lock already exists; inspect owner, retry later, never steal by age');
  }
  fs.renameSync(candidate, path.join(dir, 'owner.md'));
  requireThat(identity(readJson(path.join(dir, 'owner.md'))) === identity(value), 'INVALID_OWNER', 'Published owner did not verify');
  return { root, dir, value };
}
export function release(lock) {
  const file = contained(lock.root, path.join(lock.dir, 'owner.md'));
  const owner = readJson(file);
  requireThat(owner.session_id === lock.value.session_id && owner.lock_id === lock.value.lock_id, 'OWNER_MISMATCH', 'Lock owner changed; preserving evidence');
  requireThat(fs.readdirSync(lock.dir).every(name=>name==='owner.md'), 'INCOMPLETE_LOCK', 'Unexpected lock contents; preserving owner and evidence');
  fs.unlinkSync(file);
  fs.rmdirSync(lock.dir);
}
function projectLock(p, request, action) {
  return acquire(p.root, `.orchestrator/runtime/${p.project}/project.lock`, { session_id: request.session, project: p.project, command: action });
}
function claims(p) {
  const dir = contained(p.root, `.orchestrator/runtime/${p.project}/stories`);
  if (!stat(dir)) return [];
  return fs.readdirSync(dir).filter(n => n.endsWith('.lock')).sort().map(n => {
    const d = contained(p.root, path.join(dir, n));
    let owner = null;
    try { owner = readJson(contained(p.root, path.join(d, 'owner.md'))); } catch { /* incomplete claims retain capacity */ }
    return { story: n.slice(0, -5), dir: d, owner };
  });
}
function validClaim(c) { return c.owner?.version === 1 && c.owner.lock_id && c.owner.session_id && c.owner.story === c.story && Array.isArray(c.owner.resources); }
function storyBlock(text, story) {
  const blocks = text.split(/(?=^# Story )/m).filter(b => b.startsWith('# Story '));
  const matching = blocks.filter(b => b.split(/\r?\n/)[0].trim() === '# Story ' + story);
  requireThat(matching.length === 1, 'INVALID_STORY', 'Story must exist exactly once in requirements');
  return matching[0];
}
function readPlan(p, request, checkBase = true) {
  const expected = `.orchestrator/projects/${p.project}/plans/${segment(request.story)}.json`;
  const file = contained(p.root, expected), plan = readJson(file);
  requireThat(plan.version === 1 && plan.project === p.project && plan.story === request.story, 'INVALID_PLAN', 'Execution plan identity/version mismatch');
  const requirements = contained(p.root, `requirements/${p.project}.md`);
  requireThat(plan.requirements_sha256 === fileHash(requirements), 'STALE_PLAN', 'Requirements changed; reanalyze before reserving');
  const block = storyBlock(fs.readFileSync(requirements, 'utf8'), request.story);
  const section = /## Depends on[^\n]*\r?\n([\s\S]*?)(?=\n## |\n---|$)/.exec(block)?.[1] || '';
  const required = section.split(/\r?\n/).filter(l => l.trim()).map(l => {
    const m = /^- ([A-Za-z0-9][A-Za-z0-9._-]*)\s*$/.exec(l);
    requireThat(m, 'INVALID_DEPENDENCY', 'Dependency section must contain story IDs'); return segment(m[1]);
  }).sort();
  requireThat(Array.isArray(plan.dependencies) && identity(plan.dependencies.map(d => d.story).sort()) === identity(required), 'INVALID_DEPENDENCY', 'Execution plan must cover every declared dependency');
  requireThat(Array.isArray(plan.sources) && plan.sources.length > 0, 'INVALID_PLAN', 'Plan must identify analyzed source evidence');
  for (const source of plan.sources) requireThat(typeof source.sha256 === 'string' && /^[a-f0-9]{64}$/.test(source.sha256) && fileHash(contained(p.root, source.path)) === source.sha256, 'STALE_PLAN', 'An analyzed source is absent or changed');
  if (checkBase) requireThat(plan.base_sha === commitSha(p.repo, p.entry.base_branch), 'BASE_CHANGED', 'Selected base changed; refresh analysis');
  requireThat(Array.isArray(plan.resources) && plan.resources.length > 0, 'INVALID_PLAN', 'Plan requires conflict resources');
  for (const r of plan.resources) {
    requireThat(r === 'repo' || r.startsWith('repo/') || r.startsWith(`docs/${p.project}/`) || r.startsWith(`scripts/${p.project}/`), 'INVALID_RESOURCE', 'Resource must be repo or project docs/scripts');
    contained(p.root, r);
  }
  requireThat(Array.isArray(plan.checks) && plan.checks.every(c => typeof c === 'string') && new Set(plan.checks).size === plan.checks.length, 'INVALID_PLAN', 'Plan must list unique required check IDs');
  return { file, plan, hash: fileHash(file) };
}
export function overlaps(a, b) {
  return a.some(x => b.some(y => {
    x = x.toLowerCase(); y = y.toLowerCase();
    return x === y || x.startsWith(y + '/') || y.startsWith(x + '/');
  }));
}
function dependencyReady(p, dependency, base) {
  segment(dependency.story);
  requireThat(['order','code'].includes(dependency.kind), 'INVALID_DEPENDENCY', 'Dependency kind must be order or code');
  const receipt = contained(p.root, `.orchestrator/projects/${p.project}/approvals/${dependency.story}.json`);
  if (!stat(receipt)) return false;
  const approval = readJson(receipt);
  if (approval.version !== 1 || approval.verdict !== 'APPROVED') return false;
  if (dependency.kind === 'order') return true;
  const snapshot = loadSnapshot(p.root, approval.snapshot);
  requireThat(snapshot.id === approval.snapshot_id && snapshot.payload.phase === 'candidate', 'INVALID_APPROVAL', 'Dependency approval is not bound to candidate evidence');
  const delta = changes(snapshot.payload.before.files, snapshot.payload.state.files);
  const selected = dependency.paths || delta.map(c => c.path);
  requireThat(selected.length > 0 && selected.every(n => delta.some(c => c.path === n)), 'INVALID_DEPENDENCY', 'Required paths must identify changed dependency artifacts');
  for (const name of selected) {
    const expected = delta.find(c => c.path === name).after;
    const listing = git(p.repo, ['ls-tree', '-z', base, '--', name]);
    if (!expected) { if (listing) return false; continue; }
    if (!listing) return false;
    const m = /^(\d+) blob ([a-f0-9]+)\t/.exec(listing);
    if (!m || m[1] !== expected.mode) return false;
    // Git normalizes CRLF according to attributes. This conservative comparison
    // can require explicit revalidation after transformations, never a false OK.
    if (hash(git(p.repo, ['cat-file', 'blob', m[2]], { binary: true })) !== expected.sha256) return false;
  }
  return true;
}
function board(p) {
  const records = claims(p);
  const requirements = fs.readFileSync(contained(p.root, `requirements/${p.project}.md`), 'utf8');
  const stories = [...new Set([...requirements.matchAll(/^# Story ([^\r\n]+)\s*$/gm)].map(m => m[1].trim()))];
  const rows = stories.map(story => {
    segment(story);
    const c = records.find(c => c.story === story);
    const approval = stat(contained(p.root, `.orchestrator/projects/${p.project}/approvals/${story}.json`));
    let state = c ? validClaim(c) ? 'CLAIMED' : 'INCOMPLETE' : approval ? 'REVIEWED_VERIFY_BEFORE_HARVEST' : 'QUEUED_REVALIDATE';
    return `| ${story} | ${c?.owner?.session_id || '-'} | ${state} |`;
  });
  for (const c of records.filter(c => !stories.includes(c.story))) rows.push(`| ${c.story} | unknown | ORPHAN_CLAIM |`);
  const content = '# Assignments — ' + p.project + '\n\nDerived view; revalidate readiness, legacy events and approval evidence before acting.\n\n| Story | Session | State |\n|---|---|---|\n' + rows.join('\n') + '\n';
  const file = contained(p.root, `.orchestrator/projects/${p.project}/assignments.md`);
  if (fileHash(file) !== hash(content)) replaceFile(p.root, file, content, fileHash(file));
}
export function reserve(request) {
  const p = resolveProject(request.root, request.project);
  segment(request.story); segment(request.session);
  const lock = projectLock(p, request, 'reserve');
  try {
    const all = claims(p), existing = all.find(c => c.story === request.story);
    const { plan, hash: planHash } = readPlan(p, request, !existing);
    if (existing) {
      requireThat(validClaim(existing) && existing.owner.session_id === request.session && existing.owner.plan_sha256 === planHash, 'CLAIM_EXISTS', 'Story already claimed or incomplete');
      return { state: 'ALREADY_CLAIMED', owner: existing.owner, provisioning: 'Inspect Git by branch; never duplicate' };
    }
    for (const d of plan.dependencies) if (!dependencyReady(p, d, plan.base_sha)) return { state: d.kind === 'code' ? 'WAITING_INTEGRATION' : 'WAITING_DEPENDENCY', dependency: d.story };
    requireThat(all.every(validClaim), 'INCOMPLETE_CLAIM', 'Incomplete claim blocks automatic overlap decisions and consumes capacity');
    if (all.length >= p.entry.max_parallel) return { state: 'QUEUED', reason: 'CAPACITY' };
    if (all.some(c => overlaps(plan.resources, c.owner.resources))) return { state: 'QUEUED', reason: 'OVERLAP' };
    const branch = p.entry.branch_prefix + '/' + request.story;
    const target = contained(p.root, `workspace/worktrees/${p.project}/${request.story}`);
    const matching = worktrees(p.repo).filter(w => w.branch === 'refs/heads/' + branch);
    requireThat(matching.length === 0 || (matching.length === 1 && samePath(matching[0].path,target)), 'LEGACY_WORKTREE', 'Existing branch mapping requires explicit reconciliation');
    const claim = acquire(p.root, `.orchestrator/runtime/${p.project}/stories/${request.story}.lock`, {
      session_id: request.session, project: p.project, command: 'legion', story: request.story,
      worktree: target, branch, base_sha: plan.base_sha, resources: plan.resources, plan_sha256: planHash,
    });
    board(p);
    return { state: 'CLAIMED', owner: claim.value, provisioned: matching.length === 1 };
  } finally { release(lock); }
}
export function releaseClaim(request) {
  const p = resolveProject(request.root, request.project);
  segment(request.story); segment(request.session);
  requireThat(['approved','abandoned-preserved'].includes(request.reason), 'INVALID_RELEASE', 'Release requires approved receipt or explicit abandonment preserving all work');
  const approvalFile = contained(p.root, `.orchestrator/projects/${p.project}/approvals/${request.story}.json`);
  let checkedApproval;
  if (request.reason === 'approved') {
    const receipt = readJson(approvalFile), s = loadSnapshot(p.root, receipt.snapshot);
    requireThat(receipt.verdict === 'APPROVED' && receipt.snapshot_id === s.id && receipt.claim_id === request.lock_id, 'INVALID_APPROVAL', 'Receipt does not approve this claim');
    assertCurrent(p.root, s); checkedApproval = fileHash(approvalFile);
  }
  const lock = projectLock(p, request, 'release');
  try {
    const c = claims(p).find(c => c.story === request.story);
    requireThat(validClaim(c || {}) && c.owner.session_id === request.session && c.owner.lock_id === request.lock_id, 'OWNER_MISMATCH', 'Claim belongs to another owner');
    if (request.reason === 'approved') {
      requireThat(fileHash(approvalFile) === checkedApproval, 'STALE_APPROVAL', 'Approval changed before release');
    }
    release({ root: p.root, dir: c.dir, value: c.owner }); board(p);
    return { state: 'RELEASED', worktree_preserved: true };
  } finally { release(lock); }
}
export function approve(request) {
  const p = resolveProject(request.root, request.project);
  const s = loadSnapshot(p.root, request.snapshot);
  requireThat(s.payload.phase === 'candidate' && s.payload.spec.story === request.story && s.payload.spec.project === p.project, 'INVALID_SNAPSHOT', 'Approval requires this story candidate');
  assertCurrent(p.root, s);
  const reviewPath = contained(p.root, request.review), review = readJson(reviewPath);
  const reviewHash = fileHash(reviewPath);
  requireThat(request.review.startsWith(`.orchestrator/projects/${p.project}/reviews/`), 'WRITE_ZONE', 'Review must be project-scoped');
  requireThat(review.version === 1 && review.verdict === 'APPROVED' && review.snapshot_id === s.id &&
    review.reviewer_session && review.reviewer_session !== request.session && Array.isArray(review.verification), 'INVALID_REVIEW', 'Independent approved review must identify this snapshot');
  const lock = projectLock(p, request, 'approve');
  try {
    requireThat(fileHash(reviewPath) === reviewHash, 'STALE_REVIEW', 'Review changed before approval publication');
    const c = claims(p).find(c => c.story === request.story);
    requireThat(validClaim(c || {}) && c.owner.session_id === request.session && c.owner.lock_id === request.lock_id, 'OWNER_MISMATCH', 'Approval requires current writer claim');
    requireThat(samePath(contained(p.root,s.payload.spec.worktree),c.owner.worktree) && s.payload.spec.branch === c.owner.branch && s.payload.spec.base_sha === c.owner.base_sha,
      'CLAIM_SNAPSHOT_MISMATCH', 'Candidate must identify the claimed worktree, branch and pinned base');
    const { plan, hash: planHash } = readPlan(p, request, false);
    requireThat(c.owner.plan_sha256 === planHash, 'STALE_PLAN', 'Claim plan changed');
    const touched = [...changes(s.payload.before.files, s.payload.state.files).map(c => 'repo/' + c.path), ...changes(s.payload.before.external, s.payload.state.external).map(c => c.path)];
    requireThat(touched.every(r => overlaps([r], plan.resources)), 'SCOPE_CHANGED', 'Changed artifacts exceed reserved conflict resources');
    const checks = review.verification.map(name => {
      requireThat(name.startsWith(`.orchestrator/projects/${p.project}/verification/`), 'WRITE_ZONE', 'Verification must be project-scoped');
      const result = readJson(contained(p.root, name));
      requireThat(result.version === 1 && result.snapshot_id === s.id && result.status === 'PASSED' && result.exit_code === 0 && !result.mutated, 'INVALID_VERIFICATION', 'Verification evidence is missing, stale or failed');
      return result.check_id;
    });
    requireThat(plan.checks.every(id => checks.includes(id)) && (plan.checks.length > 0 || typeof review.no_checks_reason === 'string' && review.no_checks_reason.length > 10), 'MISSING_CHECK', 'Required checks must have matching evidence');
    const receipt = { version: 1, verdict: 'APPROVED', snapshot: request.snapshot, snapshot_id: s.id, claim_id: c.owner.lock_id,
      review: request.review, review_sha256: reviewHash, approved_at: utc() };
    const dest = contained(p.root, `.orchestrator/projects/${p.project}/approvals/${request.story}.json`);
    replaceFile(p.root, dest, json(receipt), fileHash(dest));
    return receipt;
  } finally { release(lock); }
}
export function event(request) {
  const p = resolveProject(request.root, request.project);
  segment(request.story); segment(request.session); segment(request.id);
  const allowed = ['START','DESIGN_PROPOSED','DESIGN_APPROVED','IMPLEMENTATION_DONE','QA_DONE','REVIEW_APPROVED','REVIEW_REJECTED','BLOCKED','RESUMED','DECISION','SIGNAL_ISSUED','ANNOUNCEMENT_PUBLISHED','INTEGRATION_CHECKED'];
  requireThat(allowed.includes(request.type) && Number.isInteger(request.attempt) && request.attempt > 0 && typeof request.summary === 'string', 'INVALID_EVENT', 'Event must identify transition, attempt and summary');
  const lock = projectLock(p, request, 'event');
  try {
    const owner = claims(p).find(c => c.story === request.story)?.owner;
    requireThat(owner?.session_id === request.session, 'OWNER_MISMATCH', 'Owner session publishes events on behalf of delegated roles');
    const payload = { story: request.story, session: request.session, attempt: request.attempt, type: request.type, snapshot_id: request.snapshot_id || null, summary: request.summary };
    const dest = contained(p.root, `.orchestrator/projects/${p.project}/events/${request.story}/${request.id}.json`);
    if (stat(dest)) requireThat(identity(readJson(dest).payload) === identity(payload), 'EVENT_COLLISION', 'Event ID already describes another action');
    else writeExclusive(p.root, dest, json({ version: 1, id: request.id, at: utc(), payload }));
    return { path: path.relative(p.root, dest), id: request.id };
  } finally { release(lock); }
}
export function checkpoint(request) {
  const p = resolveProject(request.root, request.project);
  segment(request.story); segment(request.session);
  requireThat(Array.isArray(request.done) && Array.isArray(request.pending) && typeof request.stage === 'string', 'INVALID_CHECKPOINT', 'Checkpoint requires stage, done and pending');
  const lock = projectLock(p, request, 'checkpoint');
  try {
    requireThat(claims(p).find(c => c.story === request.story)?.owner?.session_id === request.session, 'OWNER_MISMATCH', 'Checkpoint requires owning session');
    const file = contained(p.root, `.orchestrator/projects/${p.project}/checkpoints/${request.story}.json`);
    replaceFile(p.root, file, json({ version: 1, at: utc(), stage: request.stage, done: request.done, pending: request.pending,
      blocker: request.blocker || null, snapshot: request.snapshot || null, design: request.design || null }), request.expected_sha256 ?? null);
    return { sha256: fileHash(file), path: path.relative(p.root, file) };
  } finally { release(lock); }
}
export function moduleAdmission(request) {
  const p = resolveProject(request.root, request.project);
  segment(request.module); segment(request.run); segment(request.session);
  requireThat(request.limit === null || Number.isSafeInteger(request.limit) && request.limit > 0, 'INVALID_LIMIT', 'Resolve the per-project manifest limit; null means explicitly unlimited');
  const lock = projectLock(p, request, 'module-admission');
  try {
    const dir = contained(p.root, `.orchestrator/projects/${p.project}/module-runs/${request.module}`);
    const dest = contained(p.root, path.join(dir, request.run + '.json'));
    if (request.finish) {
      const run = readJson(dest);
      requireThat(run.session === request.session, 'OWNER_MISMATCH', 'Module run belongs to another session');
      replaceFile(p.root, dest, json({ ...run, status: 'FINISHED', finished_at: utc() }), fileHash(dest));
      return { status: 'FINISHED' };
    }
    const running = stat(dir) ? fs.readdirSync(dir).filter(n => n.endsWith('.json')).map(n => readJson(contained(p.root, path.join(dir,n)))).filter(r => r.status !== 'FINISHED') : [];
    if (stat(dest)) {
      const old = readJson(dest);
      requireThat(old.session === request.session && old.status === 'RUNNING', 'RUN_EXISTS', 'Do not reuse a completed/foreign run ID');
      return { status: 'ALREADY_RUNNING', run: request.run };
    }
    requireThat(running.every(r => r.version === 1 && r.limit === request.limit), 'LIMIT_CHANGED', 'Active module runs have unknown or different limits; reconcile before launch');
    if (request.limit !== null && running.length >= request.limit) return { status: 'QUEUED' };
    writeExclusive(p.root, dest, json({ version: 1, session: request.session, run: request.run, limit: request.limit, status: 'RUNNING', at: utc() }));
    return { status: 'RUNNING', run: request.run };
  } finally { release(lock); }
}

export function refreshClaim(request) {
  const p = resolveProject(request.root,request.project);
  segment(request.story); segment(request.session);
  const lock = projectLock(p,request,'refresh-claim');
  try {
    const all = claims(p), c = all.find(c => c.story === request.story);
    requireThat(validClaim(c || {}) && c.owner.session_id === request.session && c.owner.lock_id === request.lock_id, 'OWNER_MISMATCH', 'Only the owner can refresh a quiescent claim');
    const {plan,hash:planHash} = readPlan(p,request,false);
    requireThat(c.owner.base_sha === plan.base_sha, 'BASE_CHANGED', 'Replanning cannot change the provisioned base');
    requireThat(all.filter(other=>other!==c).every(other=>validClaim(other)&&!overlaps(other.owner.resources,plan.resources)), 'OVERLAP', 'New scope conflicts with an active/incomplete claim');
    requireThat(plan.dependencies.every(d=>dependencyReady(p,d,plan.base_sha)), 'WAITING_DEPENDENCY', 'New dependencies are not ready in this base');
    const file=contained(p.root,path.join(c.dir,'owner.md'));
    const updated={...c.owner,resources:plan.resources,plan_sha256:planHash};
    replaceFile(p.root,file,json(updated),fileHash(file));
    const previousApproval=contained(p.root,`.orchestrator/projects/${p.project}/approvals/${request.story}.json`);
    if(stat(previousApproval)) replaceFile(p.root,previousApproval,json({...readJson(previousApproval),verdict:'STALE',reason:'PLAN_REFRESH'}),fileHash(previousApproval));
    return {state:'CLAIM_REFRESHED',owner:updated};
  } finally { release(lock); }
}

export function publish(request) {
  const p = resolveProject(request.root,request.project);
  segment(request.session);
  const dest=contained(p.root,request.destination), source=contained(p.root,request.source);
  requireThat(request.source.startsWith(`.orchestrator/runtime/staging/${request.session}/`), 'WRITE_ZONE', 'Publication source must be an explicitly staged session file');
  const projectPrefix=`.orchestrator/projects/${p.project}/`;
  const sharedNames=['assignments.md','components.md','lessons-learned.md','metrics.md','reputation.md'];
  const sharedDirectories=['plans','stories','objectives','decisions','module-rules'];
  const relativeName=request.destination.startsWith(projectPrefix)?request.destination.slice(projectPrefix.length):null;
  const external=request.destination.startsWith(`docs/${p.project}/`)||request.destination.startsWith(`scripts/${p.project}/`);
  const allowed=request.destination===`requirements/${p.project}.md`||relativeName&&(sharedNames.includes(relativeName)||sharedDirectories.some(d=>relativeName.startsWith(d+'/')));
  requireThat(allowed||external,'WRITE_ZONE','Publication cannot replace runtime evidence or arbitrary files');
  const data=fs.readFileSync(source);
  requireThat(data.length>0&&data.length<=8*1024*1024,'INVALID_PUBLICATION','Candidate must be complete and at most 8 MiB');
  if(request.destination.endsWith('.json')) {
    const value=JSON.parse(data.toString('utf8'));
    requireThat(value.version===1,'INVALID_RECORD','Unknown candidate schema version');
  }
  const lock=projectLock(p,request,'publish');
  try {
    if(external) {
      const c=claims(p).find(c=>c.story===request.story);
      requireThat(validClaim(c||{})&&c.owner.session_id===request.session&&c.owner.lock_id===request.lock_id&&
        overlaps([request.destination],c.owner.resources),'OWNER_MISMATCH','External publication requires its reserved story owner and scope');
    }
    replaceFile(p.root,dest,data,request.expected_sha256??null);
    return {path:request.destination,sha256:fileHash(dest)};
  } finally { release(lock); }
}
export function diagnose(request) {
  const c = catalog(request.root);
  if (!request.project) return { version: 1, projects: Object.keys(c.data.projects), action: Object.keys(c.data.projects).length ? 'SELECT_PROJECT' : 'FOLLOW_BOOTSTRAP_TABLE', mutations: false };
  const p = resolveProject(request.root, request.project, { inspectMigration: false });
  const records=claims(p), trees=worktrees(p.repo);
  const requirements=contained(p.root,`requirements/${p.project}.md`);
  const stories=stat(requirements)?[...new Set([...fs.readFileSync(requirements,'utf8').matchAll(/^# Story ([^\r\n]+)$/gm)].map(m=>m[1].trim()))]:[];
  const readiness=stories.map(story=>{
    try {
      const claim=records.find(c=>c.story===story);
      const {plan}=readPlan(p,{story},!claim);
      const waiting=plan.dependencies.filter(d=>!dependencyReady(p,d,plan.base_sha)).map(d=>({story:d.story,kind:d.kind}));
      return {story,plan:'CURRENT',waiting};
    } catch(e) { return {story,plan:e.code||'INVALID_RECORD'}; }
  });
  const approvals=[];
  const approvalDir=contained(p.root,`.orchestrator/projects/${p.project}/approvals`);
  if(stat(approvalDir)) for(const name of fs.readdirSync(approvalDir).filter(n=>n.endsWith('.json'))) {
    try {
      const receipt=readJson(contained(p.root,path.join(approvalDir,name))),snapshot=loadSnapshot(p.root,receipt.snapshot);
      requireThat(receipt.version===1&&receipt.verdict==='APPROVED'&&receipt.snapshot_id===snapshot.id,'INVALID_APPROVAL','Approval is not current');
      assertCurrent(p.root,snapshot); approvals.push({story:name.slice(0,-5),state:'CURRENT'});
    } catch(e) { approvals.push({story:name.slice(0,-5),state:e.code||'INVALID_RECORD'}); }
  }
  const mutexDir=contained(p.root,`.orchestrator/runtime/${p.project}/project.lock`);
  let mutex=null;
  if(stat(mutexDir)) { try { mutex={state:'PRESENT',owner:readJson(contained(p.root,path.join(mutexDir,'owner.md'))).session_id}; } catch { mutex={state:'INCOMPLETE'}; } }
  return {version:1,project:p.project,max_parallel:p.entry.max_parallel,mutex,
    claims:records.map(c=>({story:c.story,valid:!!validClaim(c),owner:c.owner?.session_id||null,
      provisioning:trees.some(w=>w.branch==='refs/heads/'+c.owner?.branch)?'REGISTERED':'RECONCILE'})),
    worktrees:trees,readiness,approvals,
    migration_pending:!!stat(contained(p.root,'.orchestrator/migration-in-progress.md')),
    migration_completed_marker:!!stat(contained(p.root,'.orchestrator/migration-completed.md')),mutations:false};
}
