---
name: legion
description: Orchestrates project-scoped User Stories with one worktree per story, simple cross-session claims, design approval, implementation and adversarial review.
---

# /legion

Arguments: `/legion --project <slug> [--story <ID>] [dry-run]`. If project is not supplied, ask
the user to select one. `--story` is a preference, never a bypass for capacity, dependency or
conflict checks.

Read `CLAUDE.md` first. Its project resolver, bootstrap, lock and safe-write contracts are
mandatory. The catalog entry is the sole project configuration. Never discover a singleton repo or
read old root memory after multiproject setup.

If a completed `/legion-upgrade` marker shows retained (non-archived) legacy originals for this
project, mention it once per session — they are a passive backup only, never a fallback source to
read from or write through (`.orchestrator/migration-contract.md`, "Archival").

## Resolve

1. Run `CLAUDE.md`'s project resolver and obey the action returned by its single normative table.
   Do not independently interpret catalogs, markers, or legacy evidence and never continue on old
   paths.
2. After that resolver authorizes project operation, resolve:
   - requirements: `requirements/<project>.md`;
   - memory: `.orchestrator/projects/<project>/`;
   - repo: `workspace/<repo_dir>`;
   - worktree: `workspace/worktrees/<project>--<Story-ID>`, unless a completed `/legion-upgrade`
     marker's approved mapping registers that Story ID as a `deferred` legacy worktree — reconcile
     by the confirmed mapping and real `git worktree list`, not only the namespaced path just
     calculated, and never create a second worktree for the same story/branch. Writing through a
     legacy path requires the normal claim plus an explicit reconciliation confirmation; read-only
     observation is the default;
   - branch: `<branch_prefix>/<Story-ID>`;
   - docs/scripts/module output: namespaces derived from the selected project.
3. Revalidate that the repo is Git, physically contained in `workspace/`, and matches optional
   sanitized remote. A failure blocks only this project.
4. Fetch origin before planning when present. Never pull automatically; ask before `--ff-only`.
   Divergence is a user-resolved blocker.
5. Read requirements, project assignments/components/lessons/designs/decisions/signals/
   announcements, capabilities, module registry and real Git worktree state.

## Resume and reconstruct

Git and the story diffs are authoritative. Rebuild inconsistent assignment rows from requirements,
story claims, events, reviews and `git worktree list`. A worktree with no claim is not an active
writer and consumes no capacity. A claim with missing/invalid `owner.md` is incomplete: show its
evidence and require a manual decision; never infer takeover from age.

A session resumes only claims whose `owner.md.session_id` it owns. It may observe other worktrees
read-only but cannot launch, message or write through their agents.

## Plan view

Analyze all queued stories for impacted modules, entities, endpoints and migrations. Build the
conflict graph and dependency edges and show a batch view for priority/readability. A batch is not a
barrier. Every story reservation independently revalidates requirements, dependency status,
conflicts and capacity under the project mutex.

Use `.orchestrator/capabilities.md` to select the generalist/specialist. Explicit `## Subtasks`
run sequentially in the same worktree. Installed implementer modules activate only when named by a
subtask. Risky zones may run `research-agent` first.

## Reserve one story

1. Outside locks, choose the next apparently eligible story; `--story` only biases this choice.
2. Prepare a complete project-lock owner candidate with session, command, project and UTC time.
3. Atomically create `.orchestrator/runtime/<project>/project.lock`. If it exists, show owner and
   let the user wait, cancel or explicitly resolve it; never steal it.
4. Rename the verified candidate to `owner.md` and reread it.
5. Reread requirements, assignments and claims; reconcile them with Git.
6. Treat incomplete claims conservatively as capacity until manually resolved.
7. Revalidate business dependencies and overlap conflicts.
8. Count story claims, including incomplete claims conservatively. If the count is greater than or
   equal to `max_parallel`, keep the story queued.
9. Prepare the story owner candidate with session, story, resolved worktree, branch and UTC time.
10. Atomically create `stories/<Story-ID>.lock`; rename/reread its owner.
11. Safely replace assignments via sibling candidate and destination reread.
12. Verify project-lock owner, remove that exact `owner.md`, then `rmdir` that exact lock.

If anything fails before a valid story owner is published, preserve evidence and request manual
resolution. Do not add another lock type.

## Provision and launch

Create/reuse the exact worktree resolved in step 2 above — the namespaced path, or the confirmed
legacy path when the resolver mapped this story to a `deferred` legacy worktree (D5). Never create a
new namespaced worktree for a story that already has one registered, legacy or not: check the
resolved mapping and real `git worktree list` first, and reconcile into the existing worktree instead
of provisioning a duplicate. Validate the base ref and final branch with `git check-ref-format`, quote
them as arguments and reject control characters/shell separators. Never create from uncommitted
base-repo changes. Discover gitignored
local rules/files needed by agents from the selected real repo, show exact contained
source/destination paths, and copy only user-confirmed paths. Secret-like files require a separate
exact confirmation. Do not persist this discovery in the catalog. Never commit, push or create PRs.

Launch the selected Claude agent with absolute resolved paths: `PROJECT`, `WORKTREE`, `STORY`,
`BRANCH`, `BASE_BRANCH`, `EVENTS`, `QUALITY_GUIDE`, `REGISTRY`, `SIGNALS`,
`ANNOUNCEMENTS`, and `CONFIG` (the selected catalog entry plus resolved verification facts and
`prose_language`: explicit command choice, else repo convention, else English). Add role-specific
inputs before launch: security gets `SECURITY_GUIDE`; data gets `DATA_GUIDE` and resolved
`SCRIPTS_DEST`; docs gets resolved `DOCS_DEST`; QA gets acceptance criteria and resolved test facts;
design/code reviewers get their exact `REPORT`, design and applicable security/quality inputs.
Agents never select a project or acquire/release claims. Record the exact base commit in START.

## Design and implementation

Each claimed story publishes `DESIGN_PROPOSED` and waits. Its owning session rereads current
components, decisions, designs, Signals and Announcements. If it must publish a decision or planned
component, use the brief project mutex and the shared-write candidate pattern. Approve this story
without waiting for proposals owned by other sessions.

Dry-run persists the selected story design as PENDING APPROVAL and stops before sending approval.
If the user approves it, run the existing design-review loop before implementation. A rejected or
discarded empty dry-run worktree is removed only with explicit user confirmation.

During implementation, monitor only agents belonging to claims owned by this session. On each
notification reread that story's event file, update its assignment row under the brief mutex and
process relevant Signals/Announcements. Coordination remains preventive through shared memory and
corrective through a project decision when two implementations diverge.

If the project uses schema migrations, assign final ordered identifiers at the story gate using the
project's real migration ordering rule. Never invent a migration tool.

## Module stages

Before design, resolve modules named by the story plus installed `default_activation: always`
gates. Recompute each installed module source hash and stop for explicit update/risk review on a
mismatch. For `provides_rules`, negotiate only new/changed rules for the selected project, resolve
module-vs-module or module-vs-repo conflicts, persist the verdict project-scoped and embed accepted
rules in the design. Pass selected `provides_skills` as read-only guidance.

At each declared stage, launch a gate with exactly its registered tools and declared write zone,
record pre/post diffs, and require its report at
`modules/reports/<module>/<project>/<Story-ID>-R<n>.md`. Blocking rejection shares the core
three-round correction budget; non-blocking output becomes reviewer advisory input. An explicitly
named implementer module authors only its assigned story worktree/subtask and follows the normal
design and core review gates. A module never replaces `worktree-reviewer` or writes directly to
Signals/Announcements.

## Review, QA and correction

After implementation FINALIZED, optionally run QA when acceptance criteria require functional
scenarios, then run `worktree-reviewer` over the real diff and approved design. REJECTED findings
return to the same claimed writer and produce another review round. After three unresolved rounds,
ask the user.

On reviewer APPROVED:

1. safely mark the story finalized in assignments;
2. verify claim owner;
3. remove only that claim's exact `owner.md`;
4. `rmdir` only that exact story-lock directory.

A Phase 6 correction first reacquires a story claim under the project mutex after rechecking
capacity and ownership, marks correction, delegates the writer, reviews again and releases the claim
only after approval.

## Handoff and crash

A live handoff requires both sessions and a stable checkpoint. Under the project mutex, keep the
story-lock directory present, replace `owner.md` through candidate/verify/rename/reread, update
assignments and release the mutex. A dead owner can be replaced only after the user inspects board,
events, worktree and diff and explicitly confirms takeover.

## Finish

A session may finish when it owns no story claims. It does not need other sessions to finish.

A project summary is valid only when a read under the project mutex finds no story claims, no
queued/implementing/reviewing/correction stories, and all final reviews/events. Run the read-only
trial merge, update project metrics/reputation with safe writes, and report worktree, branch, files,
review rounds, decisions, advisories and verification per story. A later new story is simply a new
run.

## Non-negotiable safety

- No lock besides catalog, project and story.
- No automatic takeover, recursive lock removal, force worktree removal, commit, push or PR.
- No automatic copy/merge of uncommitted changes between worktrees.
- No shared write without the appropriate brief mutex and verified replacement.
- `catalog.lock` is the one brief global-metadata mutex; its historical path protects exactly
  `.orchestrator/projects.yml` registration/bootstrap/replacement and serialized
  `modules/registry.md` replacement, without adding a lock type. Module-registry mutations reread, write and
  validate a sibling candidate, rename it exactly, reread the destination, then release. They do
  not hold a project mutex at the same time.
- Modules retain their declared isolation and never replace the core adversarial reviewer.
