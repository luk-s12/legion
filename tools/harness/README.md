# Claude Code harness helpers

Requires **Node 22+ and Git**. No npm install, Python, daemon, model SDK or additional project
configuration. These helpers support Legion's Claude Code workflow; they are not a Codex adapter.
Read the [runtime decision](../../.orchestrator/decisions/harness-runtime.md) for platform limits.

From the Legion root:

```text
node tools/harness/cli.mjs <command> request.json
node --test --test-concurrency=1 tests/harness/runtime.test.mjs
```

Use `-` for JSON on stdin. Success is `{ "ok": true, "result": ... }`; failure is exit 1 with
`{ "ok": false, "code": "...", "message": "..." }` on stderr. QUEUED/WAITING are successful
admission decisions, not authorization to launch. File input accepts a UTF-8 BOM (PowerShell).
All relative paths use `/` and resolve under `root`, an existing physical absolute Legion root.
Requests are data, never strings interpolated into a shell. Windows executable paths in JSON need
escaped backslashes or `/`. IDs use safe single segments; real filenames may contain spaces/Unicode.

## Operations

Every project operation requires `root` and `project`. Mutations affecting coordination additionally
require the owning `session` except snapshot/verification, which publish unique evidence files.

| Command | Additional request fields | Result / authority |
|---|---|---|
| diagnose | optional project | Read-only catalog, claims, worktrees, plan readiness, approval freshness, markers |
| reserve | story, session | Uses the story's plan; returns claim owner/lock_id or a wait state |
| refresh-claim | story, session, lock_id | Revalidates a changed plan for a quiescent owned claim; base stays fixed |
| worktree-check | root, repo (absolute), worktree, branch, operation | Validates create/move/reuse/remove; never performs Git writes |
| snapshot | story, branch, base_sha, worktree, story_file, design_file, external; optional baseline, sensitive | Publishes baseline/candidate with immutable id/path |
| snapshot-check | snapshot | Checks current artifacts, index, context and pinned HEAD |
| verify | snapshot, check_id, environment_key, command | Runs an independent bounded check and records evidence |
| approve | story, session, lock_id, snapshot, review | Validates independent review/checks/scope and publishes approval |
| release | story, session, lock_id, reason | approved or abandoned-preserved; preserves worktree/files |
| event | story, session, id, attempt, type, summary; optional snapshot_id | Unique transition; identical retries are idempotent |
| checkpoint | story, session, stage, done, pending; optional blocker, snapshot, design, expected_sha256 | Compact recovery state, compare-and-replace |
| publish | session, source, destination, expected_sha256; story/lock_id for external output | Staged, bounded project publication |
| module-admission | session, module, run, limit; optional finish | Per-project gate admission; null explicitly means unlimited |
| context | sources (root-relative file array); optional tags mapping paths to string arrays | Content-versioned index; caller selects relevant context |
| integrate | approvals (ordered receipt paths) | Materializes a fixed reviewed set in an isolated temporary tree |
| integration-verify | report, environment_key, checks; optional generated_paths | Runs actual combined checks; returns VERIFIED only for unchanged inputs |

`worktree-check` is a path/Git precondition checker, not ownership or harvest authorization. Check
the caller's claim/approved migration mapping first. `move` also requires inspection of the exact
registered source per [worktree contract](../../.orchestrator/worktree-contract.md).

## A story lifecycle

1. Follow [bootstrap](../../.orchestrator/bootstrap-contract.md) before mutations. Diagnose an
   already registered project. This distribution's empty catalog is not a test destination.
2. Read actual requirements/repo rules, pin `BASE_SHA`, and publish a source-backed plan at
   `.orchestrator/projects/<project>/plans/<story>.json` under project.lock. Example shape:

```json
{
  "version": 1,
  "project": "shop",
  "story": "SHOP-142",
  "base_sha": "<full commit SHA from the selected base>",
  "requirements_sha256": "<SHA-256 of requirements/shop.md bytes>",
  "sources": [{"path": "workspace/shop/package.json", "sha256": "<SHA-256>"}],
  "resources": ["repo/src/payment", "repo/tests/payment", "docs/shop/payments.md"],
  "dependencies": [{"story": "SHOP-141", "kind": "code", "paths": ["src/payment/client.js"]}],
  "checks": ["unit-payment", "lint"]
}
```

The dependency list must exactly cover the story's `Depends on` IDs. Use `repo` when affected scope
is unknown. Source hashes describe analyzed inputs; keep them minimal and relevant. Unknown check
commands must be resolved before review. Checks may be empty only with a reviewer-supported reason.

3. Reserve with `{root, project, story, session}`. Save returned `owner.lock_id`. If admitted,
   validate/provision from BASE_SHA outside the mutex; helpers never create branches/worktrees.
4. Approve the design, then capture the clean baseline before writing:

```json
{
  "root": "C:/path/to/legion",
  "project": "shop",
  "story": "SHOP-142",
  "branch": "claude/shop/SHOP-142",
  "base_sha": "<full commit SHA>",
  "worktree": "workspace/worktrees/shop/SHOP-142",
  "story_file": "requirements/shop.md",
  "design_file": ".orchestrator/projects/shop/designs/SHOP-142.md",
  "external": ["docs/shop/payments.md"]
}
```

5. Implement/QA, publish final external drafts through the owner, then submit the same snapshot
   request plus `baseline: "<returned baseline path>"`. Keep the writer quiescent through review.
   Neither new files nor external artifacts are inferred from `git diff` alone.
6. The independent reviewer runs each planned check with the candidate path. For example, only
   if this command actually exists in the destination repo:

```json
{
  "root": "C:/path/to/legion",
  "project": "shop",
  "snapshot": "<candidate path>",
  "check_id": "unit-payment",
  "environment_key": "node-24.15.0-lockfile-<sha>-test-config-v1",
  "command": {
    "executable": "C:/Program Files/nodejs/node.exe",
    "args": ["--test", "tests/payment.test.mjs"],
    "cwd": "workspace/worktrees/shop/SHOP-142",
    "timeout_ms": 120000
  }
}
```

Commands are separate executable/argv, no implicit shell or `.cmd`/`.bat`. Choose platform-specific
installed paths. Log files stay local; no credentials in arguments or environment_key. A successful
exit that modifies an inventoried artifact is MUTATED and cannot approve. Timeout never releases
claims. If `termination_confirmed` is false, inspect owned descendants before retrying.

7. The reviewer writes its human report plus JSON `{version:1, verdict:"APPROVED", snapshot_id,
   reviewer_session:"<distinct reviewer identity>", verification:["<result path>", ...]}`.
   The owner calls approve, then release with reason approved. Any stale evidence returns to review.
   Legacy work without baseline/current receipts requires explicit revalidation; never fake hashes.

## External publication, events and module gates

Drafts stay in each specialist's assigned external staging subtree. The owner copies complete bytes
to `.orchestrator/runtime/staging/<session>/...`, then calls publish with that `source`, final
`destination`, exact prior SHA (or null if absent), story and lock_id. The helper checks resources
and performs a candidate replacement under project.lock. The same operation can publish confirmed
requirements/shared project memory without a story claim. It cannot overwrite runtime evidence.
Catalog and global registry changes still use the existing catalog.lock contract.

Use event types from [event-contract.md](../../.orchestrator/event-contract.md), stable IDs per
transition and incremented attempts. For checkpoint, pass the last returned SHA on replacement.
On resume, read legacy history alongside the checkpoint and inspect Git; neither proves approval.

Before a module gate starts call module-admission with its manifest-resolved limit and a unique
`run`, e.g. `SHOP-142-post-implementation-R1`. After completion call with the same owner/run and
`finish: true`. A crashed RUNNING record retains its slot. Reports include story, stage and round.

## Integration and recovery

Pass current approval paths in dependency order to integrate. Different bases/checkout bytes are
rejected. New/deleted/binary/external files are materialized under runtime/integration; originals
are unchanged. MATERIALIZED means merge succeeded, never that combined behavior is correct.
Call integration-verify with `report` from integrate and checks shaped as
`{id, cwd:"repo"|"external", command:{executable,args,timeout_ms}}`. Generated build directories may
be declared in `generated_paths` (relative to the temporary repo); they cannot exclude source inputs.
No build/setup commands are invented. Git-dependent builds may require an explicit test recipe
because the materialization is files, not a Git checkout.

LOCK_BUSY means wait/reconcile; missing owners, unknown schemas and stale sources require diagnosis.
No automatic stale-lock expiry, retries that duplicate provisioning, takeover, cleanup or deletion.
Retain failed candidates/logs. Runtime objects are necessary to reconstruct artifacts: do not delete
them while approvals/integration evidence refer to them. Use the owning version to reconcile active
claims before rolling back helpers; start a fresh Claude Code session to load changed instructions.

`.claude/settings.json` is intentionally unchanged: do not blanket-allow `node` or verification
commands that themselves execute repository programs. Use the normal Claude Code permission policy.
These helpers coordinate cooperating sessions; they are not a sandbox against malicious processes.

