# Legion — Claude Code orchestration

The root session orchestrates projects: resolve, plan, reserve, provision, delegate, verify and
review. It never implements destination code, commits, pushes or creates PRs. Projects are isolated
under workspace/<repo_dir>; stories under workspace/worktrees/<project>/<Story-ID>.

## Authorities and invariants

- .orchestrator/projects.yml (version 1) is the only project configuration. Requirements owns story
  definitions/dependencies; Git owns repos, branches, worktrees, base commits and diffs; claims own
  active writers; events/reviews record evidence. Assignments and indexes are derived views.
- Never widen agent/module write zones, delete uncommitted work, force-remove worktrees, steal locks
  by age, or create another coordination lock. No automatic merging/rebasing into original repos.
- Use absolute validated paths and separate command arguments. Reject escaping links/junctions.
- Keep only catalog mutex, project mutex and durable story claims. Never hold a mutex during user
  interaction, analysis, design, implementation, testing, review or worktree Git operations.
- Every delivery requires independent approval tied to actual artifact evidence. A design cannot
  shield a demonstrated behavioral/security defect. Explicit accepted risks remain scoped and cited.
- Apply real repo rules and verification tools; never invent a stack, migration tool or test command.

## Project resolver

Before a project-scoped command, validate catalog v1, slug, direct-child repo_dir, refs and optional
sanitized remote. Validate physical containment and a usable Git repo. A failure blocks that project.
Reuse a project explicitly selected in this session/command; ask when identity is missing or changes.

### Required bootstrap for an older installation

The single normative table and legacy detection algorithm are in
.orchestrator/bootstrap-contract.md. Inspect catalog and migration markers first. A valid populated
catalog with no pending marker takes the ordinary path; empty/missing/invalid catalog or pending,
completed-inconsistent or dual markers require that contract before any operational mutation.
Never classify an empty catalog as new by itself, fall back to singleton paths or lose legacy evidence.
Migration schema, topology, takeover, copying, hashing and crash recovery stay exclusively in
.orchestrator/migration-contract.md. Registration and migration use catalog.lock.

## Runtime and worktree contracts

Read only the contract needed for the operation; preserve its exact rules:

| Operation | Normative source |
|---|---|
| Mutexes, claims, publication, concurrency | .orchestrator/runtime-contract/README.md |
| Worktree creation, movement, reuse, retirement | .orchestrator/worktree-contract.md |
| Snapshot, dependency readiness, external artifacts | .orchestrator/artifact-contract.md |
| Checks and reviewer evidence | .orchestrator/verification-contract.md |
| Events, checkpoints, legacy resumption | .orchestrator/event-contract.md |
| Story context and design depth | .orchestrator/context-contract.md |
| Temporary combined checks | .orchestrator/integration-contract.md |

### Worktree path and Story-ID validation

Use the subsection of this exact title in .orchestrator/worktree-contract.md. Creation/movement
require an absent new destination; reuse/removal require matching existing identity. Never apply
one operation's existence condition to another. Recognize existing worktrees by branch via Git,
including approved legacy mappings; do not provision duplicates from a path-only check.

The Node helpers in tools/harness/README.md provide structured diagnosis, claims, snapshots,
checks, events and integration. They do not register projects, classify ambiguous migrations,
provision worktrees or authorize handoffs. Missing/unsupported evidence stops the operation; do not
silently rerun a failed mutation as hand-written shell commands. Reconcile the real state first.

## Commands

/new-story and /new-objective analyze without locks, keep project-scoped drafts and preserve semantic
and exact-text confirmation before publication. Reuse already-given authorization; group independent
missing fields. Publish confirmed requirements/records under the brief project mutex and rebuild
assignments. Creating a story never takes its writer claim.

/legion resolves and reconstructs before scheduling. --story biases priority, never bypasses
capacity/dependencies/conflicts. A batch is a view, not a barrier. Reserve individually under the
project mutex. WAITING_INTEGRATION is not an active writer: reviewed code dependencies must be
available in the pinned base before their consumers start. Cosecha/harvest remains manual.

/legion-upgrade uses bootstrap/migration contracts, never pull/merge/rebase/reset/stash or module
updates; its only Git write is the explicitly confirmed worktree move defined by that contract.
/investigate, /new-lesson and module commands resolve their project and take a mutex only for shared
publication. Module registry lifecycle is global under catalog.lock.

## Agent lifecycle

Use .orchestrator/capabilities.md: generalist for normal mixed work, specialist for its own domain,
sequential subtasks only for distinct acceptance gates. Implementer modules require explicit naming.
QA runs after implementation when functional scenarios need independent verification.

Pass PROJECT, WORKTREE, STORY, BRANCH, BASE_BRANCH, immutable BASE_SHA, execution-plan path,
EVENTS, selected REGISTRY/SIGNALS/ANNOUNCEMENTS, quality references and verified CONFIG. Include
artifact baseline/candidate paths, external artifact inventory and check IDs when available.
CONFIG.prose_language is explicit choice, else established repo language, else English.
Agents do not select projects/manage claims. The owner persists their transition notifications.

DESIGN_PROPOSED waits for owner approval. Choose compact/full depth by risk, preserving quality.
At approval boundaries read relevant components, decisions, signals and announcements, then publish
planned components/decisions under the project mutex. Approve each owned story without waiting for
other sessions' designs. Assign migration identifiers using the repo's real ordering rule.

Implementation completion is IMPLEMENTATION_DONE, QA completion QA_DONE; neither finalizes a story.
The reviewer reads all actual outputs including inventoried docs/scripts outside the worktree, runs
checks and issues evidence plus a snapshot-bound receipt. REJECTED returns to the claimed writer.
Three unresolved correction rounds across core/blocking module gates escalate to the user.
Only a current APPROVED receipt permits release as approved. Corrections after release reacquire
capacity and ownership and require new review. Never accept bare legacy FINALIZED as approval.

## Signals, modules and resumption

Agents can publish urgent Signals/Announcements in their assigned project folders. They check
relevant records before design and completion; only the owner promotes/archives shared knowledge
under the project mutex. Records never authorize another story's writer.

For modules, recheck source hash, negotiate changed rules project-scoped and resolve conflicts
before design. Pass exact registered tools/write zones, compare before/after and persist reports.
Core review is never replaced. Per-project module admission and report identities follow the
runtime contract; limits are resolved from the manifest, not invented by a caller.

Live handoff requires both sessions at a stable checkpoint; replace owner under project mutex while
keeping the claim directory present. Dead-owner takeover requires explicit human confirmation with
board/events/worktree/diff evidence. Helpers never automate takeover. Incomplete claims retain
capacity; only the owning session reconciles incomplete provisioning against Git before retrying.

A session can finish when it owns no claims; it never waits for unrelated sessions. Check ready
integration sets without waiting for an endlessly replenished queue. Report exactly the set and
snapshot tested. A global closure additionally requires a fresh mutex-protected check of no active
or pending work and all current reviews/events. Temporary integration may materialize snapshots
only under runtime/integration; it never modifies or merges into original repos/worktrees.
