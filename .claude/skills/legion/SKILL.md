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
   - worktree: `workspace/worktrees/<project>/<Story-ID>` (nested: one per-project parent, the
     Story ID directly inside it, no `--`). Recognize an existing worktree **by branch**
     (`<branch_prefix>/<Story-ID>`) against real `git worktree list --porcelain`, not only the
     nested path just calculated — this also covers a `--` or singleton worktree from an older
     `/legion-upgrade` and a `deferred` legacy worktree from a completed marker's approved mapping,
     which stays corroborating evidence, not the sole channel. If a worktree already exists for that
     branch in any layout, reconcile inside it; never create a second one. Writing through a legacy
     path requires the normal claim plus an explicit reconciliation confirmation; read-only
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
6. Treat incomplete claims conservatively as capacity until manually resolved — including a valid
   claim whose resolved nested `worktree` is not yet registered in `git worktree list --porcelain`
   (matched by branch): it holds its place, is never recreated or duplicated, and only its owning
   session retries the `worktree add` or releases it.
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

Create/reuse the exact worktree resolved in step 2 above — the nested namespaced path
`workspace/worktrees/<project>/<Story-ID>`, or the confirmed legacy path when the resolver mapped
this story to a `deferred` legacy worktree (D5). Never create a new namespaced worktree for a story
that already has one registered, legacy or not: check real `git worktree list --porcelain` by branch
(and the resolved mapping as corroboration) first, and reconcile into the existing worktree instead
of provisioning a duplicate. Validate `Story-ID`, parent and leaf per `CLAUDE.md`'s
`### Worktree path and Story-ID validation`. Create the per-project parent
`workspace/worktrees/<project>/` idempotently (`mkdir -p`, or the host shell's idempotent
equivalent) immediately before the `worktree add`, and after `worktree remove` during harvest
attempt a non-recursive `rmdir` of that exact parent — both outside any lock. Validate the base ref
and final branch with `git check-ref-format`, quote them as arguments and reject control
characters/shell separators. Never create from uncommitted
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

Each claimed story publishes `DESIGN_PROPOSED` and its agent ends its turn (Stage A complete). The owning
session rereads current components, decisions, designs, Signals and Announcements. If it must publish a
decision or planned component, use the brief project mutex and the shared-write candidate pattern.

**Design gate.** The owner gives every proposal a **level**, written in the persisted design:
- **critical**: it touches shared or persisted state under concurrency, payments or money flow,
  asynchronous consumers/events/queues, schema or data migrations, authorization, or a contract other code
  or services consume. Add any such risk the owner itself finds in the proposal.
- **large**: not critical, but big: the design touches more than about 10 production files (tests and fixtures
  do not count), adds a new public endpoint or changes the shape of an existing contract (tightening the
  validation of an existing endpoint is not that), or its estimate exceeds the repo's PR size guideline
  (about 400 changed lines when the repo's `CLAUDE.md` states one).
- **normal**: everything else.

Every message that names a persisted design or a `design-reviewer` report (when it is persisted, while the
reviewer runs and at the gate) gives it as a link the user can open, as CLAUDE.md "Questions to the user"
("Files to open") says.

1. Read each proposal's `Risk checklist` and assign the level.
2. For every critical story, launch `design-reviewer` on the persisted proposal (read-only, no approval
   needed), all in parallel. Normal and large stories skip it: no extra agent, no extra round.
3. Triage every finding as INCORPORATED (adjust the proposal), DISMISSED (with evidence) or OMITTED
   (accepted scope and reason).
4. **Plain `/legion`.** A **normal** story is approved by the owner on its own: record the triage as a decision,
   send the writer its approval (with the adjustments) via SendMessage, and say in the next message what was
   decided. A **large or critical** story is never approved by the owner alone: ask the user with the question
   tool, in ONE consolidated round for every large or critical story pending, following CLAUDE.md
   "Questions to the user". Normal stories of the same run are not held back. Right before the call, the
   chat message MUST state for each story, in the user's language: its ID; its level and why (for example
   "CRITICAL: touches payments and asynchronous events"); that the user has to review the design before
   approving; a link to the design file (`.orchestrator/projects/<project>/designs/<Story-ID>.md`) and, when
   `design-reviewer` ran, a link to its report; a one-line summary, only the part of the triage the user needs (the full triage stays in the
   design) and the open questions, in the short shape CLAUDE.md asks for. In the dialog, each story gets
   one short question with the options approve / approve with adjustments / reject / decide later and a
   recommended default; an open question that needs the user's decision is a separate question in the same round.
   "Decide later" keeps the design PENDING APPROVAL and the claim held while the other stories go on; the
   owner asks again in the next round, and at the latest before the session would close. Never invent a
   user approval or a risk acceptance.
5. **`/legion dry-run`: the user reviews and approves every story, normal ones included.** Persist each design
   as PENDING APPROVAL, ask the user to review it, and collect the decision for every pending story in ONE
   consolidated round, exactly as step 4 does: the same chat message before the call and the same questions
   and options. Send no approval until the user answers; never infer it from silence or from the run having
   started in dry-run.
6. A material change by the user to a critical story repeats only a `design-reviewer` round on the delta.
   For a normal or large story, the owner re-presents the amended design to the user for approval (always in
   dry-run, and in plain `/legion` for a large one) without launching `design-reviewer`.

While waiting for the user, do not sleep or poll. Stories already approved keep running; the question is
only about the pending ones. Waiting is the user's time, not the harness's.

Dry-run stops at the design gate above for every story, even a normal one, and sends no approval until
the user answers the question. A rejected or discarded empty dry-run worktree is removed only with explicit user
confirmation.

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
scenarios, then run `worktree-reviewer` over the real diff and approved design. Before launching it,
check that FINALIZED states the writer's format gate result; if it does not, return the story to the
writer first (a formatting-only rejection costs a full review round). The reviewer always writes its own
report at `REPORT`: the owner never writes or summarizes a reviewer's report. If the file is missing or
empty when the reviewer returns, relaunch the reviewer with the same inputs and record the incident. REJECTED findings
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
