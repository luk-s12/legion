import fs from 'node:fs';
import { capture, verifySnapshot } from './artifacts.mjs';
import { diagnose, reserve, releaseClaim, approve, event, checkpoint, moduleAdmission, publish, refreshClaim } from './runtime.mjs';
import { runVerification } from './verification.mjs';
import { integrate, verifyIntegration } from './integration.mjs';
import { context } from './context.mjs';
import { requireThat, validateWorktree } from './core.mjs';

const commands = { diagnose, reserve, release: releaseClaim, snapshot: capture, 'snapshot-check': verifySnapshot,
  approve, event, checkpoint, publish, 'refresh-claim': refreshClaim, 'module-admission': moduleAdmission, verify: runVerification, integrate, 'integration-verify': verifyIntegration, context, 'worktree-check': validateWorktree };
try {
  const [command, requestFile] = process.argv.slice(2);
  requireThat(Object.hasOwn(commands, command) && requestFile, 'USAGE', 'node tools/harness/cli.mjs <' + Object.keys(commands).join('|') + '> <request.json|->');
  const request = JSON.parse(fs.readFileSync(requestFile === '-' ? 0 : requestFile, 'utf8').replace(/^\uFEFF/, ''));
  const result = await commands[command](request);
  process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ ok: false, code: error.code || 'RUNTIME_ERROR', message: error.message }) + '\n');
  process.exitCode = 1;
}
