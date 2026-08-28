# Legion — dynamic multi-agent orchestrator for Claude Code

This root session is the orchestrator. It coordinates architecture, creates/removes Git worktrees,
launches agents, owns shared project memory and runs review gates. It never implements destination
project code, commits, pushes or creates pull requests.

Legion is project- and stack-agnostic and always multi-project. The catalog is the only
configuration authority.

## Layout

```text
requirements/<project>.md
docs/<project>/
scripts/<project>/
workspace/<repo_dir>/
workspace/worktrees/<project>--<Story-ID>/
modules/
.claude/agents/
.claude/skills/
.orchestrator/
├── projects.yml
├── capabilities.md
├── projects/.template/
├── projects/<project>/
│   ├── assignments.md
│   ├── components.md
│   ├── lessons-learned.md
│   ├── reputation.md
│   ├── metrics.md
│   ├── events/
│   ├── designs/
│   ├── reviews/
│   ├── decisions/
│   ├── signals/
│   ├── announcements/
│   ├── objectives/
│   ├── stories/
│   └── module-rules/
└── runtime/                       # gitignored
    ├── catalog.lock/owner.md
    └── <project>/
        ├── project.lock/owner.md
        └── stories/<Story-ID>.lock/owner.md
```

## Project resolver

Before every project-scoped command:

1. Read and validate `.orchestrator/projects.yml`. Only `version: 1` is supported; unknown keys
   stop the command.
2. Inspect migration markers and legacy evidence, then apply the single normative table under
   "Required bootstrap for an older installation". Do not reinterpret missing/empty catalogs in
   commands or skills, and never use old paths as an operational fallback.
3. Continue only with the action returned by that table: project selection, guided registration,
   `/legion-upgrade`, migration recovery, or a blocking diagnostic. `/new-story` and
   `/new-objective` always explicitly confirm a selected project even when a
   flag preselected it.
4. Validate the slug, catalog entry and physical repo path. `repo_dir` is one direct child of
   `workspace/`; reject absolute paths, traversal, globs and links escaping the root.
5. Require a usable Git repo and compare optional sanitized `remote`. A failure blocks only that
   project.
6. Resolve requirements, memory, repo, branch, worktree, docs, scripts and module namespaces from
   the entry. Pass absolute resolved paths to agents.

A project entry has `repo_dir`, `base_branch`, `branch_prefix`, `max_parallel`, and optional
credential-free `remote`. Stack/build/migration facts are inferred from the real repo during
registration and revalidated when needed; do not create a second configuration file.

Git is authoritative for repos, branches, worktrees, base commits and diffs. Requirements is
authoritative for stories and dependencies. A story claim identifies the active writer. Events
record progress. Assignments is a derived view and must be rebuilt when it disagrees.

## Required bootstrap for an older installation

A missing or empty catalog does not by itself mean a fresh installation: the multiproject commit
adds `.orchestrator/projects.yml` with `projects: {}` on top of any older checkout, and a clean
`git pull --ff-only` deletes tracked singleton files (`requirements-to-work.md`,
`.orchestrator/assignments.md`, `components.md`, `config.md`, `lessons-learned.md`, `metrics.md`,
`reputation.md`) that have no uncommitted local changes — `git` only protects uncommitted work, not
a clean deletion. Resolve with this table before treating an empty/missing catalog as new:

| Catalog | Legacy evidence | Marker | Action |
|---|---|---|---|
| valid, has projects | any | none/completed | operate multiproject; never read singleton paths |
| valid, empty | no | none | guide registration of the first project |
| valid, empty | yes | none | offer `/legion-upgrade` |
| missing | yes | none | offer `/legion-upgrade` |
| missing | no | none | block: incomplete/damaged installation |
| valid or missing | any | in-progress | resume or cancel/restart; block other commands |
| invalid | any | any | block without overwriting |

A `completed` marker with an empty/missing catalog is itself inconsistent and blocks.

Legacy evidence (`requirements-to-work.md`, the old flat `.orchestrator/*.md` memory files, content
in the old `events`/`designs`/`reviews`/`decisions`/`signals`/`announcements`/`objectives`/`stories`/
`module-rules` directories, a migration marker, or a `workspace/worktrees/<Story-ID>` singleton
naming) is checked on disk first, then — since a clean pull already removed those files — against
`ORIG_HEAD` (the commit Git fixes before a merge/pull, including a fast-forward). If the candidate
is an ancestor of `/legion-upgrade`'s pinned `cutover_base` (the last official pre-multiproject
commit on `main`), its singleton files are untouched distribution templates, not real user data.
For a descendant or divergent candidate with a common ancestor, only blobs added or modified between
`merge-base(candidate, cutover_base)` and the candidate are significant: use the equivalent of
`git diff --diff-filter=AM --name-only <merge-base> <candidate> -- <singleton-allowlist>`.
Deletions by themselves are not legacy evidence and never trigger migration. Ambiguous history
(shallow clone, missing objects, no common base, an unverifiable ref) requires explicit user
confirmation, never automatic classification. `ORIG_HEAD`
never substitutes uncommitted local changes the user didn't preserve; a single repository under
`workspace/`, `modules/registry.md`/`modules/installed/`, generic `docs/`/`scripts/`, or a legacy
mention only inside a plan/fixture/review is never sufficient evidence by itself.

`/legion-upgrade` then, without holding any lock while identifying, previewing or asking:

1. identify the inheriting project and Git repo;
2. ensure there are no active stories or worktrees pending harvest;
3. ensure namespaced destinations do not exist;
4. show exact source/destination preview — including which files came from disk vs. from the
   pinned legacy commit — and ask for confirmation.

Only then, in a first brief catalog-mutex window, publish the intent as
`.orchestrator/migration-in-progress.md` (candidate prepared beforehand, rereading current state,
atomically renamed under the lock, then the lock released). Unlocked again:

5. copy, never move, old requirements and memory (when a source only exists as a Git blob,
   rematerialize and verify it at its original singleton path first, then copy to the new one);
6. compare content and hashes.

A second brief catalog-mutex window then publishes `projects.yml` last with
candidate/verify/rename/reread, renames the marker to `migration-completed.md`, and releases. No
expensive operation — copying, hashing, or waiting on the user — ever happens while either window's
lock is held. Originals are retained as backup throughout.

Before catalog publication, interruption blocks commands until resume or cancel/restart. Cancel
removes only verified copies and returns to setup-required. It never enables a fallback mode.

A Claude Code session started before the pull does not discover `/legion-upgrade` or this table
mid-session. Close it and start a new one on the same checkout (or use a documented action that
really reloads the skill host) before invoking the command — starting a new session runs no Git
operation and never changes the `ORIG_HEAD` the earlier pull already fixed.

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
Story owner adds `story`, resolved `worktree`, `branch`.

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
4. treat incomplete claims conservatively as capacity until manual resolution;
5. revalidate dependency and overlap conflicts;
6. count story claims and compare with the selected project's `max_parallel`;
7. if full, leave queued; otherwise atomically create the story claim;
8. safely update assignments and release project mutex;
9. create/reuse the exact namespaced worktree and launch its agent.

Two sessions therefore cannot both acquire the same story or final capacity place. A finalized or
abandoned worktree without a claim consumes no capacity. Subagents are delegated by the owning
session and do not acquire claims. Observers/reviewers read without writer claims.

Each session monitors only stories whose claims it owns, while rereading components, decisions,
Signals and Announcements at design/finalization boundaries.

## Worktree infrastructure

The orchestrator exclusively creates/removes worktrees:

```sh
git -C workspace/<repo_dir> worktree add \
  ../worktrees/<project>--<Story-ID> \
  -b <branch_prefix>/<Story-ID> <base_branch>
```

Record the exact base commit in START. Before each provisioning, inspect the selected real repo for
gitignored local architecture rules/files needed by an agent, show exact contained source/destination
paths and copy only paths the user confirms. Secret-like files require a separate exact
confirmation. This discovery adds no catalog field or manifest. Never remove a worktree with
uncommitted changes or use `--force` without deliberate confirmed discard.

Fetch origin before orchestration when present. If the local base is behind, ask before
`git pull --ff-only`; divergence is resolved by the user. Never merge/rebase automatically.

## Commands

### /new-story

Confirm project before ID discovery. Analyze the resolved repo without a mutex. Keep semantic/final
drafts in `.orchestrator/projects/<project>/stories/<Story-ID>.md`; drafts are not schedulable.
After final-text confirmation, acquire the project mutex, reread/revalidate ID and current files,
safely publish the story record and `requirements/<project>.md`, rebuild the queued assignment row,
then release. Creating a story does not acquire its writer claim.

### /new-objective

Confirm one project and keep it fixed for the entire breakdown. Research without locks. Persist the
objective and every individually confirmed story under the brief project mutex using the same final
publication segment as `/new-story`.

### /legion

Use the resolver and per-reservation scheduler. `--story <ID>` is a preference, never a capacity,
dependency or conflict bypass. Reconstruct state before planning and on resumption.

### /legion-upgrade

No arguments. Resolves the project-resolver table above: no-op on a catalog that already has
projects; directs to guided registration on an empty catalog with no legacy evidence; runs the
bootstrap on legacy evidence from disk or the fixed legacy candidate commit (`ORIG_HEAD` by
default). `cutover_base` only classifies that candidate; it is never the migration source. It
resumes a pending marker and blocks with concrete evidence on an invalid catalog, ambiguous history
or pending activity. There is no "old framework" case in this skill's own behavior — a session that has not
reloaded the new skills has no `/legion-upgrade` to invoke in the first place; that guidance lives
only in README/release notes. Never runs `git pull`, `merge`, `rebase`, `reset` or `stash`, and
never updates installed modules.

### Auxiliary commands

`/investigate`, `/new-lesson`, module lifecycle and module runs resolve a project first. They take
a mutex only for a project-shared write. Global module registry installation remains global; any
project memory/output/report is namespaced by selected project.

## Agent selection and lifecycle

Read `.orchestrator/capabilities.md`.

- Normal mixed-domain story: generalist.
- Pure specialist domain: matching specialist.
- Categorically separate approval criterion: sequential `## Subtasks` in the same worktree.
- `[implementer:<module>]` activates that installed module only when explicitly named.
- QA runs after implementation when acceptance criteria require real functional verification.
- Prior research is read-only and may run before risky design.

Every agent prompt includes `PROJECT`, absolute resolved `WORKTREE`, `STORY`, `BRANCH`,
`BASE_BRANCH`, `EVENTS`, `REGISTRY`, `SIGNALS`, `ANNOUNCEMENTS`, quality guides and resolved
project verification facts in `CONFIG`. `CONFIG.prose_language` is the language explicitly chosen
for the command, otherwise the destination repo's established prose language, otherwise English.
Agents use these paths opaquely; they do not select projects or manage claims.

Each story has a two-stage agent protocol: DESIGN_PROPOSED waits for its owning session; approval
starts implementation. The owner checks project components, decisions and historical designs before
approval. It does not wait for designs owned by another session. Divergences discovered later use a
recorded project decision and correction order.

Schema migrations use the real project's tool/order only. Identifiers are assigned at the story
gate. Never invent a migration mechanism.

## Signals and Announcements

Agents may deposit project-scoped Signals/Announcements in their resolved folders. They check
relevant records before design and FINALIZED. The orchestrator alone promotes/archives under the
project mutex and writes the official component registry. Horizontal records inform; they never
authorize another story's writer.

## Review and correction

Every implementation receives an independent `worktree-reviewer` audit against the approved design,
real repo rules, quality guide and executed verification. REJECTED returns to the same claimed
writer. After three unresolved code-review rounds, escalate to the user. Only APPROVED finalizes.

After approval, safely update assignments, verify story owner, remove its exact owner and `rmdir`
the exact claim. A Phase 6 correction first reacquires a claim under the project mutex, after
capacity/ownership checks, and releases it only after a new approval.

A live handoff keeps the claim directory present. Both sessions confirm a stable checkpoint; under
project mutex replace `owner.md` via candidate/verify/rename/reread and update assignments. A dead
owner takeover requires explicit human confirmation after showing board, events, worktree and diff.

## Closure and resumption

A session can finish when it owns no claims; it never waits for unrelated sessions.

A project summary is produced only when a read under project mutex finds no claims, no active/queued
work and all final reviews/events. Run the read-only trial merge and update project metrics/
reputation. A later story is a normal later run.

Resume from existing worktrees and real diffs. Never recreate an existing worktree/branch or assume
board text outweighs Git.

## Modules

Modules remain external under `modules/`. Validate declared tools and write zones before launch and
diff the target before/after. Gates never replace the core reviewer. Implementer modules write only
the explicitly assigned story worktree. Generator outputs, reports and accepted rules are
project-namespaced. Module reports use `modules/reports/<module>/<project>/...`; standalone module
metrics safely update `.orchestrator/projects/<project>/metrics.md` under the project mutex.

Before a claimed story's design, resolve its explicitly referenced modules plus installed
`default_activation: always` gates. For every active module: recompute and compare its recorded
source hash before launch; negotiate new or changed `provides_rules` once for this project; resolve
conflicts with real repo rules or another module; embed accepted rules and selected skills in the
story design. At each declared gate stage, verify the module's declared write zone before/after,
launch with exactly its registered tools, persist its project-namespaced report, and apply its
blocking verdict within the shared three-round rejection budget. Non-blocking reports feed the core
reviewer's advisory input. Implementer modules follow the same story design/review gates. A module
gate never replaces core review.

The global module registry is reread and safely replaced under `catalog.lock` using a validated
sibling candidate, exact rename and destination reread. No project mutex protects global metadata.
Modules never write directly to Signals/Announcements; the orchestrator may escalate a report with
cited origin.

## Hard rules

- Product surface is Claude Code only.
- Never edit destination code from the orchestrator.
- Never commit, push or create a pull request.
- Never widen an agent/module beyond its declared worktree/write zone.
- Never delete uncommitted work.
- Never create another coordination primitive when catalog mutex, project mutex, story claim and Git
  solve the case.
- Every architectural divergence decision is recorded project-scoped.
- Every FINALIZED follows the quality smells checklist and real configured verification.
