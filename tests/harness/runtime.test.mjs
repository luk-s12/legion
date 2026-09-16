import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { contained, fileHash, git, hash, json, readJson, validateWorktree } from '../../tools/harness/core.mjs';
import { mapping } from '../../tools/harness/catalog.mjs';
import { acquire, release, reserve, releaseClaim, approve, event, checkpoint, moduleAdmission, publish, refreshClaim, diagnose } from '../../tools/harness/runtime.mjs';
import { capture, verifySnapshot, loadSnapshot } from '../../tools/harness/artifacts.mjs';
import { runVerification } from '../../tools/harness/verification.mjs';
import { integrate, verifyIntegration } from '../../tools/harness/integration.mjs';
import { context } from '../../tools/harness/context.mjs';

const cli = fileURLToPath(new URL('../../tools/harness/cli.mjs', import.meta.url));
function put(root, name, data) {
  const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' || Buffer.isBuffer(data) ? data : json(data)); return file;
}
function fixture(t, { parallel = 2, dependencies = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legion-harness-test-'));
  t.after(() => {
    // Exact directory created by this test, validated against the temporary pool.
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(root), /^legion-harness-test-/);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const repo = path.join(root, 'workspace/app'); fs.mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 'fixture@example.invalid']); git(repo, ['config', 'user.name', 'Fixture']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  put(repo, 'a.txt', 'alpha\nbeta\ngamma\n'); put(repo, 'b.txt', 'one\ntwo\nthree\n');
  put(repo, '.gitignore', 'build/\n');
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'Isolated test fixture']);
  const base = git(repo, ['rev-parse', 'HEAD']).trim();
  put(root, '.orchestrator/projects.yml', { version: 1, projects: { app: { repo_dir: 'app', base_branch: 'main', branch_prefix: 'story', max_parallel: parallel } } });
  const requirements = '# Story A\n\nAdd A.\n\n---\n\n# Story B\n\nAdd B.\n' + (dependencies ? '\n## Depends on\n- A\n' : '');
  put(root, 'requirements/app.md', requirements);
  for (const story of ['A','B']) {
    put(root, `.orchestrator/projects/app/designs/${story}.md`, `# Design ${story}\nApproved scoped change.\n`);
    put(root, `.orchestrator/projects/app/plans/${story}.json`, {
      version: 1, project: 'app', story, base_sha: base, requirements_sha256: hash(requirements),
      sources: [{ path: 'workspace/app/a.txt', sha256: fileHash(path.join(repo, 'a.txt')) }],
      resources: ['repo/' + story.toLowerCase() + '.txt'], dependencies: story === 'B' && dependencies ? [{ story: 'A', kind: 'code' }] : [], checks: ['unit'],
    });
  }
  function provision(story = 'A') {
    const wt = path.join(root, 'workspace/worktrees/app', story);
    fs.mkdirSync(path.dirname(wt), { recursive: true }); git(repo, ['worktree', 'add', '-b', 'story/' + story, wt, base]); return wt;
  }
  function spec(story = 'A', external = []) { return { root, project: 'app', story, branch: 'story/' + story, base_sha: base,
    worktree: `workspace/worktrees/app/${story}`, story_file: 'requirements/app.md', design_file: `.orchestrator/projects/app/designs/${story}.md`, external }; }
  return { root, repo, base, provision, spec, request: story => ({ root, project: 'app', story, session: 'owner-' + story }) };
}
function expectCode(fn, code) { assert.throws(fn, e => e.code === code); }
async function runChild(command, request) {
  return await new Promise(resolve => {
    const child = spawn(process.execPath, [cli, command, '-'], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    let out = '', err = ''; child.stdout.on('data', b => out += b); child.stderr.on('data', b => err += b);
    child.stdin.end(JSON.stringify(request));
    child.on('close', code => resolve({ code, ...JSON.parse(code === 0 ? out : err) }));
  });
}
async function candidate(t, options = {}) {
  const f = fixture(t, options), claim = reserve(f.request('A')); const wt = f.provision();
  const baseline = capture(f.spec('A', options.external || []));
  put(wt, 'a.txt', 'changed\nbeta\ngamma\n');
  const current = capture({ ...f.spec('A', options.external || []), baseline: baseline.path });
  return { ...f, claim, wt, baseline, current };
}
async function goodCheck(f, snapshot = f.current) {
  return runVerification({ root: f.root, project: 'app', snapshot: snapshot.path, check_id: 'unit', environment_key: 'fixture-node-' + process.version,
    command: { executable: process.execPath, args: ['-e','process.exit(0)'], cwd: 'workspace/worktrees/app/A', timeout_ms: 5000 } });
}
function review(f, checks = []) {
  return put(f.root, '.orchestrator/projects/app/reviews/A-code-review-R1.json', { version: 1, verdict: 'APPROVED', snapshot_id: f.current.id, reviewer_session: 'independent-reviewer', verification: checks });
}
function approveRequest(f) { return { ...f.request('A'), lock_id: f.claim.owner.lock_id, snapshot: f.current.path, review: '.orchestrator/projects/app/reviews/A-code-review-R1.json' }; }

test('catalog accepts distribution YAML, quoted values, and rejects duplicate keys', () => {
  assert.equal(mapping('version: 1\nprojects: {}\n').version, 1);
  assert.equal(mapping('name: "with # in value" # comment\n').name, 'with # in value');
  expectCode(() => mapping('version: 1\nversion: 2'), 'DUPLICATE_KEY');
  expectCode(() => mapping('projects: &anchor'), 'UNSUPPORTED_YAML');
});
test('contained paths reject traversal and junctions, accept spaces/unicode', t => {
  const f = fixture(t); assert.equal(contained(f.root, 'docs/app/user guide-é.md'), path.join(f.root, 'docs/app/user guide-é.md'));
  expectCode(() => contained(f.root, '../escape'), 'INVALID_PATH');
  fs.symlinkSync(f.repo, path.join(f.root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  expectCode(() => contained(f.root, 'link/a.txt'), 'LINK_PATH');
});
test('lock has atomic ownership and cannot release a replacement owner', t => {
  const f = fixture(t), req = { session_id: 'one', project: 'app', command: 'test' };
  const lock = acquire(f.root, '.orchestrator/runtime/app/project.lock', req);
  expectCode(() => acquire(f.root, '.orchestrator/runtime/app/project.lock', req), 'LOCK_BUSY');
  const file = path.join(lock.dir, 'owner.md'); const owner = readJson(file); owner.lock_id = 'replacement'; put(f.root, path.relative(f.root,file), owner);
  expectCode(() => release(lock), 'OWNER_MISMATCH'); assert.ok(fs.existsSync(file));
});
test('incomplete owner and extra files are never recursively removed', t => {
  const f = fixture(t), lock = acquire(f.root, '.orchestrator/runtime/app/project.lock', { session_id: 'one', project: 'app', command: 'test' });
  put(f.root, path.relative(f.root,path.join(lock.dir,'evidence.txt')), 'keep');
  assert.throws(() => release(lock)); assert.ok(fs.existsSync(path.join(lock.dir,'evidence.txt')));
  assert.ok(fs.existsSync(path.join(lock.dir,'owner.md')));
});
test('same story reservation is idempotent for its owner and never duplicated', t => {
  const f = fixture(t), first = reserve(f.request('A')), second = reserve(f.request('A'));
  assert.equal(second.state, 'ALREADY_CLAIMED'); assert.equal(first.owner.lock_id, second.owner.lock_id);
  expectCode(() => reserve({ ...f.request('A'), session: 'other' }), 'CLAIM_EXISTS');
});
test('two real processes cannot acquire the final slot', async t => {
  const f = fixture(t, { parallel: 1 });
  const results = await Promise.all([runChild('reserve', f.request('A')), runChild('reserve', f.request('B'))]);
  assert.equal(results.filter(r => r.ok && r.result.state === 'CLAIMED').length, 1);
  assert.ok(results.every(r => r.ok || r.code === 'LOCK_BUSY' || r.code === 1));
  const entries = fs.readdirSync(path.join(f.root,'.orchestrator/runtime/app/stories')).filter(n=>n.endsWith('.lock'));
  assert.equal(entries.length,1);
});
test('incomplete story provisioning retains capacity', t => {
  const f = fixture(t,{parallel:1}); reserve(f.request('A'));
  assert.equal(reserve(f.request('B')).reason,'CAPACITY');
});
test('incomplete legacy claim blocks automated overlap decisions', t => {
  const f = fixture(t); fs.mkdirSync(path.join(f.root,'.orchestrator/runtime/app/stories/X.lock'),{recursive:true});
  expectCode(()=>reserve(f.request('A')),'INCOMPLETE_CLAIM');
});
test('overlapping resources serialize even with free capacity', t => {
  const f=fixture(t), planFile=path.join(f.root,'.orchestrator/projects/app/plans/B.json'), plan=readJson(planFile);
  plan.resources=['repo']; fs.writeFileSync(planFile,json(plan)); reserve(f.request('A'));
  assert.equal(reserve(f.request('B')).reason,'OVERLAP');
});
test('source changes invalidate a plan before any story claim', t => {
  const f=fixture(t); put(f.root,'workspace/app/a.txt','changed');
  expectCode(()=>reserve(f.request('A')),'STALE_PLAN');
  assert.ok(!fs.existsSync(path.join(f.root,'.orchestrator/runtime/app/stories/A.lock')));
});
test('reuse accepts existing identity; create and dirty removal reject it', t => {
  const f=fixture(t), wt=f.provision();
  const req={root:f.root,repo:f.repo,worktree:wt,branch:'story/A'};
  assert.equal(validateWorktree({...req,operation:'reuse'}),wt);
  expectCode(()=>validateWorktree({...req,operation:'create'}),'DESTINATION_EXISTS');
  put(wt,'new.txt','unsaved'); expectCode(()=>validateWorktree({...req,operation:'remove'}),'DIRTY_WORKTREE');
});
test('snapshot inventories new files, binary deletion, rename and external outputs', async t => {
  const f=await candidate(t,{external:['docs/app/reference.md','scripts/app/rollback.sql']});
  put(f.wt,'new file-é.bin',Buffer.from([0,255,128])); fs.renameSync(path.join(f.wt,'b.txt'),path.join(f.wt,'renamed.txt'));
  put(f.root,'docs/app/reference.md','# Actual docs'); put(f.root,'scripts/app/rollback.sql','select 1;');
  const snap=capture({...f.spec('A',['docs/app/reference.md','scripts/app/rollback.sql']),baseline:f.baseline.path});
  const value=loadSnapshot(f.root,snap.path).payload;
  assert.ok(value.state.files['new file-é.bin']); assert.equal(value.state.files['b.txt'],undefined);
  assert.ok(value.state.files['renamed.txt']); assert.equal(value.before.external['docs/app/reference.md'],null);
  assert.ok(value.state.external['scripts/app/rollback.sql']);
});
test('snapshot rejects a new untracked file or changed index after approval evidence', async t => {
  const f=await candidate(t); put(f.wt,'new.txt','unreviewed');
  expectCode(()=>verifySnapshot({root:f.root,project:'app',snapshot:f.current.path}),'STALE_SNAPSHOT');
});
test('moving the base label does not change a pinned story snapshot', async t => {
  const f=await candidate(t); put(f.repo,'base-only.txt','new base'); git(f.repo,['add','.']); git(f.repo,['commit','-m','Advance fixture base']);
  assert.equal(verifySnapshot({root:f.root,project:'app',snapshot:f.current.path}).current,true);
});
test('verification detects a formatter modifying artifacts even with exit zero', async t => {
  const f=await candidate(t);
  const result=await runVerification({root:f.root,project:'app',snapshot:f.current.path,check_id:'format',environment_key:'fixture',
    command:{executable:process.execPath,args:['-e',"require('fs').writeFileSync('a.txt','modified by formatter')"],cwd:'workspace/worktrees/app/A',timeout_ms:5000}});
  assert.equal(result.status,'MUTATED'); assert.equal(result.cache_reusable,false);
});
test('verification records nonzero and timeout as failures', async t => {
  const f=await candidate(t), request={root:f.root,project:'app',snapshot:f.current.path,check_id:'unit',environment_key:'fixture',
    command:{executable:process.execPath,args:['-e','process.exit(3)'],cwd:'workspace/worktrees/app/A',timeout_ms:5000}};
  assert.equal((await runVerification(request)).status,'FAILED');
  assert.equal((await runVerification({...request,command:{...request.command,args:['-e','setInterval(()=>{},1000)'],timeout_ms:100}})).status,'TIMEOUT');
});
test('approval requires independent reviewer and every required check', async t => {
  const f=await candidate(t); review(f);
  expectCode(()=>approve(approveRequest(f)),'MISSING_CHECK');
  const check=await goodCheck(f); review(f,[check.path]);
  const file=path.join(f.root,approveRequest(f).review), receipt=readJson(file);
  fs.writeFileSync(file,json({...receipt,reviewer_session:f.request('A').session}));
  expectCode(()=>approve(approveRequest(f)),'INVALID_REVIEW');
  fs.writeFileSync(file,json(receipt));
  const approval=approve(approveRequest(f)); assert.equal(approval.snapshot_id,f.current.id);
  put(f.wt,'a.txt','changed after approval');
  expectCode(()=>releaseClaim({...f.request('A'),lock_id:f.claim.owner.lock_id,reason:'approved'}),'STALE_SNAPSHOT');
  assert.ok(fs.existsSync(path.join(f.root,'.orchestrator/runtime/app/stories/A.lock/owner.md')));
  put(f.wt,'a.txt','changed\nbeta\ngamma\n');
  const released=releaseClaim({...f.request('A'),lock_id:f.claim.owner.lock_id,reason:'approved'});
  assert.equal(released.state,'RELEASED'); assert.equal(fs.readFileSync(path.join(f.wt,'a.txt'),'utf8'),'changed\nbeta\ngamma\n');
});
test('stale verification result cannot approve a newer candidate', async t => {
  const f=await candidate(t), check=await goodCheck(f);
  put(f.wt,'a.txt','another change'); f.current=capture({...f.spec(),baseline:f.baseline.path}); review(f,[check.path]);
  expectCode(()=>approve(approveRequest(f)),'INVALID_VERIFICATION');
});
test('approved but unintegrated dependency waits without reserving', async t => {
  const f=await candidate(t,{dependencies:true}), check=await goodCheck(f); review(f,[check.path]); approve(approveRequest(f));
  assert.equal(reserve(f.request('B')).state,'WAITING_INTEGRATION');
});
test('content integrated without original ancestry satisfies code dependency', async t => {
  const f=await candidate(t,{dependencies:true}), check=await goodCheck(f); review(f,[check.path]); approve(approveRequest(f));
  releaseClaim({...f.request('A'),lock_id:f.claim.owner.lock_id,reason:'approved'});
  put(f.repo,'a.txt',fs.readFileSync(path.join(f.wt,'a.txt'))); git(f.repo,['add','.']); git(f.repo,['commit','-m','Squash equivalent fixture']);
  const file=path.join(f.root,'.orchestrator/projects/app/plans/B.json'),plan=readJson(file);
  plan.base_sha=git(f.repo,['rev-parse','HEAD']).trim(); plan.sources[0].sha256=fileHash(path.join(f.repo,'a.txt')); fs.writeFileSync(file,json(plan));
  assert.equal(reserve(f.request('B')).state,'CLAIMED');
});
test('event IDs are idempotent and conflicting payloads are preserved', t => {
  const f=fixture(t);reserve(f.request('A'));
  const request={...f.request('A'),id:'start-1',attempt:1,type:'START',summary:'Provisioned'};
  const first=event(request); assert.equal(event(request).id,first.id);
  expectCode(()=>event({...request,summary:'Different'}),'EVENT_COLLISION');
});
test('checkpoint compare-and-replace rejects stale callers', t => {
  const f=fixture(t);reserve(f.request('A'));
  const request={...f.request('A'),stage:'DESIGN',done:[],pending:['review']};
  const first=checkpoint(request); expectCode(()=>checkpoint(request),'STALE_INPUT');
  assert.ok(checkpoint({...request,expected_sha256:first.sha256,pending:[]}).sha256);
});
test('module admission is bounded and run identity cannot be reused after finish', t => {
  const f=fixture(t),request={root:f.root,project:'app',module:'lint',run:'A-post-R1',session:'owner',limit:1};
  assert.equal(moduleAdmission(request).status,'RUNNING');
  assert.equal(moduleAdmission({...request,run:'B-post-R1',session:'other'}).status,'QUEUED');
  moduleAdmission({...request,finish:true}); expectCode(()=>moduleAdmission(request),'RUN_EXISTS');
});
test('context cache invalidates when an explicit source changes', t => {
  const f=fixture(t),request={root:f.root,project:'app',sources:['requirements/app.md']};
  const first=context(request); put(f.root,'requirements/app.md','new requirement');
  assert.notEqual(context(request).id,first.id);
});
test('integration materializes uncommitted artifacts without changing original index', async t => {
  const f=await candidate(t),check=await goodCheck(f);review(f,[check.path]);approve(approveRequest(f));
  const before=git(f.wt,['status','--porcelain']);
  const report=integrate({root:f.root,project:'app',approvals:['.orchestrator/projects/app/approvals/A.json']});
  assert.equal(report.status,'MATERIALIZED');assert.equal(report.functional_verification,'NOT_RUN');
  assert.equal(fs.readFileSync(path.join(f.root,report.tree,'a.txt'),'utf8'),'changed\nbeta\ngamma\n');
  assert.equal(git(f.wt,['status','--porcelain']),before);
});

test('integration runner preserves failed and passing checks and rejects stale inputs', async t => {
  const f=await candidate(t),check=await goodCheck(f);review(f,[check.path]);approve(approveRequest(f));
  const report=integrate({root:f.root,project:'app',approvals:['.orchestrator/projects/app/approvals/A.json']});
  const request={root:f.root,project:'app',report:report.report,environment_key:'fixture',checks:[{id:'combined',cwd:'repo',command:{executable:process.execPath,args:['-e','process.exit(4)'],timeout_ms:5000}}]};
  assert.equal((await verifyIntegration(request)).status,'FAILED');
  request.checks[0].command.args=['-e',"if(!require('fs').readFileSync('a.txt','utf8').startsWith('changed')) process.exit(1)"];
  assert.equal((await verifyIntegration(request)).status,'VERIFIED');
  put(f.wt,'a.txt','changed after approval');
  await assert.rejects(()=>verifyIntegration(request),e=>e.code==='STALE_SNAPSHOT');
});
test('integration rejects source mutations even when the checker exits zero', async t => {
  const f=await candidate(t),check=await goodCheck(f);review(f,[check.path]);approve(approveRequest(f));
  const report=integrate({root:f.root,project:'app',approvals:['.orchestrator/projects/app/approvals/A.json']});
  await assert.rejects(()=>verifyIntegration({root:f.root,project:'app',report:report.report,environment_key:'fixture',generated_paths:['a.txt'],checks:[{id:'must-not-run',cwd:'repo',command:{executable:process.execPath,args:['-e',"require('fs').writeFileSync('a.txt','bad exclusion')"],timeout_ms:5000}}]}),e=>e.code==='INVALID_EXCLUSION');
  assert.equal(fs.readFileSync(path.join(f.root,report.tree,'a.txt'),'utf8'),'changed\nbeta\ngamma\n');
  const result=await verifyIntegration({root:f.root,project:'app',report:report.report,environment_key:'fixture',checks:[{id:'formatter',cwd:'repo',command:{executable:process.execPath,args:['-e',"require('fs').writeFileSync('a.txt','mutated')"],timeout_ms:5000}}]});
  assert.equal(result.status,'MUTATED');assert.equal(fileHash(path.join(f.wt,'a.txt')),hash('changed\nbeta\ngamma\n'));
});
test('project publication checks the prior version and cannot overwrite evidence files', t => {
  const f=fixture(t);put(f.root,'.orchestrator/runtime/staging/publisher/plan.md','# Components\nComplete.');
  const request={root:f.root,project:'app',session:'publisher',source:'.orchestrator/runtime/staging/publisher/plan.md',destination:'.orchestrator/projects/app/components.md'};
  const result=publish(request);assert.ok(result.sha256);
  expectCode(()=>publish(request),'STALE_INPUT');
  expectCode(()=>publish({...request,destination:'.orchestrator/projects/app/approvals/A.json'}),'WRITE_ZONE');
});
test('claim refresh cannot expand over another writer and preserves ownership', t => {
  const f=fixture(t),a=reserve(f.request('A'));reserve(f.request('B'));
  const file=path.join(f.root,'.orchestrator/projects/app/plans/A.json'),plan=readJson(file);
  plan.resources=['repo'];fs.writeFileSync(file,json(plan));
  expectCode(()=>refreshClaim({...f.request('A'),lock_id:a.owner.lock_id}),'OVERLAP');
  plan.resources=['repo/a.txt','docs/app/readme.md'];fs.writeFileSync(file,json(plan));
  assert.equal(refreshClaim({...f.request('A'),lock_id:a.owner.lock_id}).owner.lock_id,a.owner.lock_id);
});
test('module limit changes cannot bypass another session admission', t => {
  const f=fixture(t),request={root:f.root,project:'app',module:'lint',run:'A',session:'owner',limit:1};
  moduleAdmission(request);expectCode(()=>moduleAdmission({...request,run:'B',session:'other',limit:100}),'LIMIT_CHANGED');
});

test('two individually passing stories fail their actual combined invariant', async t => {
  const f=fixture(t), snapshots=[];
  const checkCode="const fs=require('fs'); if(fs.readFileSync('a.txt','utf8').startsWith('changed') && fs.readFileSync('b.txt','utf8').startsWith('changed')) process.exit(7)";
  for(const story of ['A','B']) {
    const claim=reserve(f.request(story)),wt=f.provision(story),baseline=capture(f.spec(story));
    put(wt,story.toLowerCase()+'.txt','changed\n');
    const snapshot=capture({...f.spec(story),baseline:baseline.path}); snapshots.push(snapshot);
    const check=await runVerification({root:f.root,project:'app',snapshot:snapshot.path,check_id:'unit',environment_key:'fixture',command:{executable:process.execPath,args:['-e',checkCode],cwd:`workspace/worktrees/app/${story}`,timeout_ms:5000}});
    assert.equal(check.status,'PASSED');
    const report=`.orchestrator/projects/app/reviews/${story}.json`;
    put(f.root,report,{version:1,verdict:'APPROVED',snapshot_id:snapshot.id,reviewer_session:'reviewer',verification:[check.path]});
    approve({...f.request(story),lock_id:claim.owner.lock_id,snapshot:snapshot.path,review:report});
  }
  const report=integrate({root:f.root,project:'app',approvals:['A','B'].map(s=>`.orchestrator/projects/app/approvals/${s}.json`)});
  assert.equal(report.status,'MATERIALIZED');
  const result=await verifyIntegration({root:f.root,project:'app',report:report.report,environment_key:'fixture',checks:[{id:'invariant',cwd:'repo',command:{executable:process.execPath,args:['-e',checkCode],timeout_ms:5000}}]});
  assert.equal(result.status,'FAILED'); assert.equal(result.checks[0].exit_code,7);
  for(const s of snapshots) assert.equal(verifySnapshot({root:f.root,project:'app',snapshot:s.path}).current,true);
});

test('conflicting newly created files are detected in a reviewed integration set', async t => {
  const f=fixture(t);
  for(const story of ['A','B']) {
    const planFile=path.join(f.root,`.orchestrator/projects/app/plans/${story}.json`),plan=readJson(planFile);
    plan.resources=['repo']; fs.writeFileSync(planFile,json(plan));
    const claim=reserve(f.request(story)),wt=f.provision(story),baseline=capture(f.spec(story));
    put(wt,'new.txt',story);
    const snapshot=capture({...f.spec(story),baseline:baseline.path});
    const check=await runVerification({root:f.root,project:'app',snapshot:snapshot.path,check_id:'unit',environment_key:'fixture',command:{executable:process.execPath,args:['-e','process.exit(0)'],cwd:`workspace/worktrees/app/${story}`,timeout_ms:5000}});
    const report=`.orchestrator/projects/app/reviews/${story}.json`;
    put(f.root,report,{version:1,verdict:'APPROVED',snapshot_id:snapshot.id,reviewer_session:'reviewer',verification:[check.path]});
    approve({...f.request(story),lock_id:claim.owner.lock_id,snapshot:snapshot.path,review:report});
    releaseClaim({...f.request(story),lock_id:claim.owner.lock_id,reason:'approved'});
  }
  const result=integrate({root:f.root,project:'app',approvals:['A','B'].map(s=>`.orchestrator/projects/app/approvals/${s}.json`)});
  assert.equal(result.status,'CONFLICTED');assert.deepEqual(result.conflicts,['new.txt']);
});

test('staging unchanged working bytes invalidates the index-bound snapshot', async t => {
  const f=await candidate(t);git(f.wt,['add','a.txt']);
  expectCode(()=>verifySnapshot({root:f.root,project:'app',snapshot:f.current.path}),'STALE_SNAPSHOT');
});

test('external docs checks detect mutation and scope omissions block approval', async t => {
  const f=await candidate(t,{external:['docs/app/reference.md']});put(f.root,'docs/app/reference.md','# Reference');
  f.current=capture({...f.spec('A',['docs/app/reference.md']),baseline:f.baseline.path});
  const check=await goodCheck(f);review(f,[check.path]);expectCode(()=>approve(approveRequest(f)),'SCOPE_CHANGED');
  const result=await runVerification({root:f.root,project:'app',snapshot:f.current.path,check_id:'docs',environment_key:'fixture',command:{executable:process.execPath,args:['-e',"require('fs').writeFileSync('reference.md','changed')"],cwd:'docs/app',timeout_ms:5000}});
  assert.equal(result.status,'MUTATED');
});

test('a process exit between mkdir and owner publication preserves an incomplete mutex', t => {
  const f=fixture(t),dir=path.join(f.root,'.orchestrator/runtime/app/project.lock');
  const child=spawnSync(process.execPath,['-e',"require('fs').mkdirSync(process.argv[1],{recursive:true});process.exit(23)",dir],{windowsHide:true});
  assert.equal(child.status,23);expectCode(()=>reserve(f.request('A')),'LOCK_BUSY');
  assert.equal(diagnose({root:f.root,project:'app'}).mutex.state,'INCOMPLETE');
  assert.ok(fs.existsSync(dir));
});

test('two processes cannot admit the final module slot', async t => {
  const f=fixture(t),request={root:f.root,project:'app',module:'gate',limit:1};
  const results=await Promise.all(['one','two'].map(session=>runChild('module-admission',{...request,session,run:session})));
  assert.equal(results.filter(r=>r.ok&&r.result.status==='RUNNING').length,1);
  assert.equal(fs.readdirSync(path.join(f.root,'.orchestrator/projects/app/module-runs/gate')).length,1);
});

test('a valid candidate for a different worktree cannot approve an owned story', t => {
  const f=fixture(t),claim=reserve(f.request('A')),wt=f.provision('B');
  const spec={...f.spec('A'),worktree:'workspace/worktrees/app/B',branch:'story/B'},baseline=capture(spec);
  put(wt,'a.txt','wrong worktree');const current=capture({...spec,baseline:baseline.path});
  const story={...f,claim,current};review(story);
  expectCode(()=>approve(approveRequest(story)),'CLAIM_SNAPSHOT_MISMATCH');
});

test('a missing analyzed source cannot satisfy a null plan fingerprint', t => {
  const f=fixture(t),file=path.join(f.root,'.orchestrator/projects/app/plans/A.json'),plan=readJson(file);
  plan.sources=[{path:'workspace/app/nonexistent.txt',sha256:null}];fs.writeFileSync(file,json(plan));
  expectCode(()=>reserve(f.request('A')),'STALE_PLAN');
});

test('process interruption around publication preserves old or complete new bytes plus ownership', t => {
  for(const phase of ['before-rename','after-rename']) {
    const f=fixture(t),destination=put(f.root,'.orchestrator/projects/app/components.md','old complete bytes');
    const core=new URL('../../tools/harness/core.mjs',import.meta.url).href;
    const runtime=new URL('../../tools/harness/runtime.mjs',import.meta.url).href;
    const code="(async()=>{const fs=require('fs');const core=await import(process.argv[1]);const runtime=await import(process.argv[2]);const root=process.argv[3],destination=process.argv[4],phase=process.argv[5];runtime.acquire(root,'.orchestrator/runtime/app/project.lock',{session_id:'publisher',project:'app',command:'publish'});const rename=fs.renameSync;fs.renameSync=(...args)=>{if(phase==='before-rename')process.exit(24);rename(...args);process.exit(25)};core.replaceFile(root,destination,'new complete bytes',core.fileHash(destination));})()";
    const child=spawnSync(process.execPath,['-e',code,core,runtime,f.root,destination,phase],{windowsHide:true,timeout:10000});
    assert.equal(child.status,phase==='before-rename'?24:25);
    assert.equal(fs.readFileSync(destination,'utf8'),phase==='before-rename'?'old complete bytes':'new complete bytes');
    const candidates=fs.readdirSync(path.dirname(destination)).filter(n=>n.startsWith('components.md.candidate-'));
    assert.equal(candidates.length,phase==='before-rename'?1:0);
    assert.equal(diagnose({root:f.root,project:'app'}).mutex.owner,'publisher');
    expectCode(()=>reserve(f.request('A')),'LOCK_BUSY');
  }
});
