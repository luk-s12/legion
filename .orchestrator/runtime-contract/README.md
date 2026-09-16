# Runtime coordination

## Minimal locks

Only three lock forms exist.

- `catalog.lock`: the one brief global-metadata mutex. Its historical path protects exactly two
  shared surfaces: catalog registration/bootstrap/replacement in `.orchestrator/projects.yml` and
  serialized replacement of `modules/registry.md`; it is not another lock type.
- `project.lock`: brief mutex for project-shared writes and story-claim acquisition/release.
- `<Story-ID>.lock`: durable writer claim covering the story, branch and worktree.

The only allowed acquisition order is catalog then project, and only for a future reconfiguration of
an existing project. Module-registry writes hold only the catalog lock. Normal story work never
holds both.

### Acquire and release

Prepare a complete owner candidate before atomic leaf `mkdir` when feasible. Validate its required
fields, atomically create the exact lock directory, rename the candidate to `owner.md`, and reread
it. If the leaf exists, show owner and let the user wait, cancel or manually resolve it. Never steal
by age.

To release: reread owner, verify the current `session_id`, remove only that exact `owner.md`, then
`rmdir` only that exact lock directory. Recursive deletion is forbidden. A missing/invalid owner is
incomplete evidence and requires a manual decision.

Project owner fields: `session_id`, `command`, `project`, `acquired_at`.
Story owner adds `story`, resolved `worktree`, `branch`. The resolved `worktree` is the nested
path `workspace/worktrees/<project>/<Story-ID>` and may not yet exist on disk while provisioning
is in progress.

### Shared writes

While holding the appropriate brief mutex:

1. reread current destination;
2. apply the change to that version;
3. write a sibling candidate;
4. validate completeness;
5. rename candidate to the known destination;
6. reread destination;
7. release the verified mutex.

Never hold a mutex while interviewing, analyzing, designing, implementing, testing, reviewing or
waiting. Requirements is authoritative; if a crash occurs between requirements and assignments,
rebuild the board rather than replaying a multi-file transaction.

Signals and Announcements use unique files. Promotion/archival and shared component/decision writes
use the project mutex.

## Story reservation and concurrency

A batch is only a planning view of priority and conflicts. It is never a synchronous launch or
design-gate barrier.

For every individual reservation:

1. outside locks, choose an apparently eligible story;
2. acquire project mutex;
3. reread requirements, board, events and claims; reconcile against `git worktree list`;
4. treat incomplete claims conservatively as capacity until manual resolution. A valid claim
   whose resolved `worktree` is not registered in `git worktree list --porcelain` (matched by
   branch `<branch_prefix>/<Story-ID>`, not only by the just-computed nested path) is an
   incomplete provisioning: it still counts as a capacity place, it is never recreated or
   duplicated, and only its owning session retries the `worktree add` or releases the claim,
   disambiguating with `EVENTS`;
5. revalidate dependency and overlap conflicts;
6. count story claims and compare with the selected project's `max_parallel`;
7. if full, leave queued; otherwise atomically create the story claim;
8. safely update assignments and release project mutex;
9. create/reuse the exact namespaced worktree and launch its agent. Create the per-project parent
   `workspace/worktrees/<project>/` idempotently (`mkdir -p`, or the host shell's idempotent
   equivalent) immediately before the `worktree add`; after `worktree remove` during harvest,
   attempt a non-recursive `rmdir` of that exact parent (see `worktree-contract.md`, "Worktree path and Story-ID
   validation"). None of this — `worktree add/move/remove`, `mkdir`/`rmdir` — runs while the
   project mutex is held.

Two sessions therefore cannot both acquire the same story or final capacity place. A finalized or
abandoned worktree without a claim consumes no capacity. Subagents are delegated by the owning
session and do not acquire claims. Observers/reviewers read without writer claims.

Each session monitors only stories whose claims it owns, while rereading components, decisions,
Signals and Announcements at design/finalization boundaries.

## Runtime helpers v1

`tools/harness/README.md` documents structured requests. Node 22+ and Git are required. Follow the
bootstrap table before calling a mutating helper; diagnosis reports evidence, not migration authorization.
New owner.md records are JSON with `version: 1`, `lock_id` (random nonce), the fields above, and for
story claims `base_sha`, `resources`, `plan_sha256`. Release verifies session AND nonce. Unknown legacy
owners and missing owners retain capacity and require explicit reconciliation; never convert by age.

Plan sources are hashed outside long-running work, then revalidated under the project mutex at
reservation. `reserve` returns CLAIMED, ALREADY_CLAIMED, QUEUED, WAITING_DEPENDENCY or
WAITING_INTEGRATION. It never provisions a worktree. The caller inspects Git before any retry.
`refresh-claim` supports an owned, quiescent plan change with the same provisioned base, rechecking
scope overlap/dependencies and invalidating prior approval. Re-review any changed design.

Keep writers and verification processes quiescent from candidate capture through approval/release.
Expensive artifact hashing and check execution occur outside project.lock. A mutex does not freeze
another process's files. User edits or non-cooperating writers invalidate evidence; stop and recapture.
Run snapshot-check again before harvest/resumption. Helpers never commit, stage, push or open PRs.

`publish` consumes a completed session staging file, expected prior SHA (null means absent), and an
allowed project destination. Catalog/module-registry publication keeps its existing catalog.lock
contract. `event`/`checkpoint` require the story's owner session; IDs and expected hashes prevent
duplicate transitions/stale replacements. Run diagnose after an interrupted mutation before retrying.

Assignments are a derived view: CLAIMED, INCOMPLETE, REVIEWED_VERIFY_BEFORE_HARVEST or
QUEUED_REVALIDATE. These labels never infer approval from a filename or readiness from legacy text.
Consult requirements, plan dependencies, reviews, events and current Git evidence before scheduling.

## Module admission

Gate `max_concurrent` is **per module, per project**, shared across sessions under project.lock.
Resolve the manifest's value before calling module-admission: omitted means 1 for nonempty writes_to,
otherwise null (explicit unlimited). Reserve before launching, with a unique story-stage-attempt run ID.
Records live at `projects/<project>/module-runs/<module>/<run>.json`; RUNNING consumes admission,
FINISHED does not. Only the owning session finishes a run. Changed limits/unknown active versions
block automatic admission; incomplete or crashed RUNNING records remain until reconciled.

No new lock type is used. Do not count report files or in-memory agents for admission. External
resources shared across projects require separately declared coordination; this limit is not global.
Review work that can release a writer takes priority over launching more work. Expensive suite
concurrency remains conservative until CPU/RAM/latency measurements justify increasing it.
On no progress, save a checkpoint and diagnose; wait for completion/source changes or user input,
without tight polling, stealing claims, or cancelling foreign writers.

## Handoff and recovery

Live handoff requires both sessions at a stable checkpoint. Under project.lock, preserve the story
directory and replace owner through the candidate protocol, recording the agreed session/nonce and
current plan; update assignments. Dead-owner takeover requires explicit user confirmation after
inspection of board, events, worktree and diff. Helpers do not automate either takeover.
Stage transitions and legacy reading follow event-contract.md. Retain incomplete candidates,
unknown owners and failure logs; failed release is not permission for recursive deletion.
