// Opt-in model decision smoke test. Not an end-to-end performance benchmark.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { git, hash, json, requireThat } from './core.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const [executable,output,model='sonnet',baseline='41db2f479389d5dd7aeec5170d6e2ac388abc456']=process.argv.slice(2);
requireThat(executable&&path.isAbsolute(executable)&&output,'USAGE','node tools/harness/evaluate.mjs <absolute claude executable> <output.json> [model] [baseline commit]');
requireThat(/^[a-f0-9]{40,64}$/.test(baseline),'INVALID_BASE','Pass an immutable baseline commit');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/harness/fixtures/decisions.json'),'utf8'));
requireThat(fixture.version===2 && fixture.action_vocabulary?.version===1,'INVALID_FIXTURE','Expected decision fixture v2 with action vocabulary v1');
// Shared evaluation vocabulary, not variant-specific harness instructions or expected answers.
const actionVocabulary=JSON.stringify(fixture.action_vocabulary.labels);
const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'legion-decision-eval-'));
const settings=path.join(cwd,'settings.json');fs.writeFileSync(settings,json({disableAllHooks:true}));
const files=['CLAUDE.md','.claude/agents/worktree-reviewer.md'];
const contracts=['.orchestrator/artifact-contract.md','.orchestrator/worktree-contract.md','.orchestrator/runtime-contract/README.md'];
const read=(name,base)=>base?git(root,['show',`${baseline}:${name}`]):fs.readFileSync(path.join(root,name),'utf8');
const prompts={baseline:files.map(f=>read(f,true)).join('\n\n'),candidate:[...files,...contracts].map(f=>read(f,false)).join('\n\n')};
const version=spawnSync(executable,['--version'],{encoding:'utf8',windowsHide:true,timeout:10000}).stdout?.trim()||null;
const report={version:1,evaluation_protocol_version:2,kind:'decision-smoke-NOT-end-to-end',baseline,fixture_sha256:hash(json(fixture)),action_vocabulary_sha256:hash(actionVocabulary),
  environment:{node:process.version,git:git(root,['--version']).trim(),claude:version,os:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,logical_cpus:os.cpus().length,memory_bytes:os.totalmem()},
  configuration:{model_requested:model,concurrency:1,repetitions:1,tools:[],hooks:false,mcp:false,max_budget_usd_per_call:0.5,timeout_ms:45000,cache:'provider state not controlled',auto_discovery:'isolated temp cwd; user-level Claude instructions may still apply'},results:[]};
try {
  for(const [variant,instructions] of Object.entries(prompts)) {
    const prompt='Evaluate these synthetic cases using the supplied harness instructions. Do not call tools or access files. Return only JSON {"decisions":[{"id":"case-id","action":"REJECT|REVALIDATE|WAIT|REUSE|APPROVE","reason":"brief evidence"}]}. Use the following shared vocabulary to label your conclusion; it defines output meanings, not which harness policy to apply. Do not use REJECT as a generic synonym for cannot proceed.\n\nACTION VOCABULARY:\n'+actionVocabulary+'\n\nHARNESS INSTRUCTIONS:\n'+instructions+'\n\nCASES:\n'+JSON.stringify(fixture.cases.map(({id,scenario})=>({id,scenario})));
    const started=Date.now();
    const child=spawnSync(executable,['--print','--output-format','json','--model',model,'--max-budget-usd','0.5','--tools','','--disable-slash-commands','--no-session-persistence','--setting-sources','','--settings',settings,'--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--system-prompt','You are evaluating a Claude Code harness. Follow the supplied instructions and decide the synthetic cases. No tools are available.'],
      {cwd,input:prompt,encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:4*1024*1024});
    let result=null,decisions=null;
    try {result=JSON.parse(child.stdout);decisions=JSON.parse(result.result?.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{}
    const row={variant,instructions_sha256:hash(instructions),prompt_bytes:Buffer.byteLength(prompt),duration_ms:Date.now()-started,exit_code:child.status,
      process_error:child.error?.code||null,cli_error:result?.is_error??null,usage:result?.usage||null,model_usage:result?.modelUsage||null,cost_usd:result?.total_cost_usd??null,
      cases:fixture.cases.map(c=>({id:c.id,expected:c.expected,actual:decisions?.decisions?.find(d=>d.id===c.id)?.action||null,reason:decisions?.decisions?.find(d=>d.id===c.id)?.reason||null}))};
    row.status=child.status!==0||!decisions?'UNAVAILABLE':row.cases.every(c=>c.actual===c.expected)?'PASSED':'FAILED';
    // No raw stderr/auth/config output is persisted. Only synthetic case answers and usage.
    row.diagnostic=child.error?'CLI process unavailable or timed out':result?.is_error?'CLI returned an error':!decisions?'No parseable decision result':null;
    report.results.push(row);process.stdout.write(json({variant,status:row.status,duration_ms:row.duration_ms}));
    if(row.status==='UNAVAILABLE') break;
  }
}finally {
  fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,json(report));
  // Only the exact temporary directory created above, never user data.
  requireThat(path.dirname(fs.realpathSync(cwd))===fs.realpathSync(os.tmpdir())&&path.basename(cwd).startsWith('legion-decision-eval-'),'PATH_ESCAPE','Refuse unexpected cleanup path');
  fs.rmSync(cwd,{recursive:true,force:true});
}
if(report.results.some(r=>r.status!=='PASSED')||report.results.length!==2)process.exitCode=1;
