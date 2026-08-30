---
name: legion-upgrade
description: Migrates a pre-multiproject Legion installation after Git has updated the checkout. It resumes the singleton-to-multiproject bootstrap and never updates Git or installed modules.
---

Read `CLAUDE.md` first — the project-resolver table under "Required bootstrap for an older
installation" is this command's contract, and `.orchestrator/migration-contract.md` is the single
schema/state-machine source this skill implements. This skill orchestrates that contract; it does
not repeat or contradict either document.

```text
cutover_base: 3e390c2147eb11bde2a4bfb1ed8bae117a973ef8
```

This is the last official pre-multiproject commit on `main`. Every "is this commit official
distribution or real user data" decision in this skill compares against this literal value. Never
resolve it dynamically at runtime and never accept a placeholder — if this line is not a real,
resolvable commit hash, the command must refuse to run.

**Arguments**: none. `/legion-upgrade` takes no remote, branch, version or module argument.

Never runs `git pull`, `fetch`, `merge`, `rebase`, `reset` or `stash`. That is entirely the user's
own Git workflow, before this command is ever invoked. The one Git write this command ever performs
is `git worktree move`, confirmed and only as described in "5. Publish".

## Behavior by state

Apply `CLAUDE.md`'s project-resolver table directly. Its rows are not first-match-wins in list
order — an invalid catalog blocks regardless of marker state, so check catalog validity before
acting on any marker:

- invalid catalog (including one with a pending marker), or ambiguous history: block and show the
  exact concrete evidence, never overwrite — this overrides every bullet below, even a marker owned
  by this same session;
- both markers present: apply `migration-contract.md`'s dual-marker transaction; a verified
  completed marker wins only under that contract, otherwise block preserving both;
- catalog with projects and marker `none`/`completed`: report no-op, do not read any singleton path;
- empty catalog, no legacy evidence: direct the user to normal registration (this skill does not
  register a project itself in that case);
- legacy evidence (disk or added/modified blobs from the fixed legacy candidate commit): run the
  preflight/bootstrap below;
- pending `migration-in-progress.md` owned by this session, on an otherwise valid catalog: resume it
  (see "6. Resume and cancel");
- pending `migration-in-progress.md` owned by another session, on an otherwise valid catalog: block
  and require the explicit takeover protocol in `migration-contract.md` before any mutation;
- a coupled Git topology (see Preflight step 4 below): block unconditionally, before anything else;
- a live claim, held mutex, or activity that is not verifiable: classify per
  `migration-contract.md`'s activity table — only the first two are a hard block, anything else is
  evidence to show and a single confirmation to ask for.

## 1. Preflight (read-only, no lock)

1. Before the resolver, preview, questions, candidates, locks, or any write, run exactly
   `git -C <absolute-orchestrator-root> cat-file -e 3e390c2147eb11bde2a4bfb1ed8bae117a973ef8^{commit}`
   against **this orchestrator's own checkout** — the repo containing `CLAUDE.md` and this skill,
   never `workspace/<repo_dir>` (an unrelated project repo that has no reason to contain a Legion
   commit). An equivalent `rev-parse --verify <oid>^{commit}` against that same root is acceptable.
   Any non-zero exit blocks immediately as `CUTOVER_BASE_UNRESOLVABLE`; it cannot be overridden by
   user confirmation and creates no marker/candidate. Record the verified root and OID for the
   first-lock reread.
2. Run the resolver over the working tree.
3. Detect the single inherited repo under `workspace/` (only subdirectory with `.git`, other than
   `worktrees/`) — this is the destination project's own repo, distinct from the orchestrator root
   verified in step 1.
4. Resolve `git worktree list --porcelain` for that repo and apply the topology guard in
   `migration-contract.md` ("Git topology guard"). A single escaping link blocks unconditionally,
   before anything else in this list — report both exact paths and stop. Never run
   `git worktree repair` with explicit paths to fix it (see "Rules").
5. If an expected singleton source is missing on disk, evaluate `ORIG_HEAD` as the only candidate:
   require it to be a valid commit, an ancestor of `HEAD`, and reachable in the current checkout.
   Show its hash and the relevant legacy diff. If `ORIG_HEAD` is gone, point the user at
   `git reflog` and ask for the exact hash — never select one automatically.
6. Classify the candidate commit against `cutover_base`:
   - ancestor of `cutover_base` → its singleton blobs are official distribution, pristine by
     themselves;
   - descendant or divergent with a common ancestor → diff only the singleton allowlist between
     `merge-base(candidate, cutover_base)` and the candidate, using the equivalent of
     `git diff --diff-filter=AM --name-only <merge-base> <candidate> -- <singleton-allowlist>`;
     only added or modified blobs are significant, while deletions alone are not evidence;
   - shallow history, missing objects, no common base, or an unverifiable ref → ambiguous; require
     explicit user confirmation, never classify automatically.
   Fix the candidate, its base, and the significant paths in the preview and later in the marker.
7. Read `.orchestrator/config.md` from disk, or from the confirmed legacy commit if absent on disk.
8. Cross-check assignments, events, story claims, held mutexes and `git worktree list`; classify
   every signal strictly per `migration-contract.md`'s activity table — never by inference from free
   text alone. Only a live claim or a held mutex is a hard block here.
9. If step 8 found non-blocking evidence (unverifiable activity, pending harvest, environment-only
   dirt), add it to the preview — per story: status, last event, claim state, dirty/ahead counts —
   together with what this migration does and does not touch. Do not ask or write anything during
   preflight. The single Preview confirmation captures the activity decision; only after that is it
   persisted in the intent candidate and, after publication, in a project decision. State plainly
   that the command reads worktree and base-repo Git metadata and moves only explicitly confirmed,
   eligible worktrees with `git worktree move`; it never changes branch, commit, index, or worktree
   file content. A story with
   unverifiable activity may still have its memory migrated, but its worktree
   is never moved — it stays `deferred` (see Preflight step 12 below and
   `migration-contract.md`'s per-item states).
10. Block if the target slug or any namespaced destination already exists; never merge into or
   overwrite an existing destination.
11. Reject symlinks/junctions that escape the repo root.
12. Build the worktree inventory required by `migration-contract.md` ("Worktree reconciliation").
    The proposed namespaced path is the nested `workspace/worktrees/<project>/<Story-ID>`; validate
    its segments and target per `CLAUDE.md`'s `### Worktree path and Story-ID validation`. Per
    legacy worktree, capture current path, proposed namespaced path, real admin entry, branch/`HEAD`,
    confirmed Story ID with its evidence, `status --porcelain=v1 -z` bytes plus
    `worktree_content_manifest`, ahead/behind, and any lock/claim. A dirname/branch/admin-entry
    mismatch requires an explicit user mapping decision — never trust the dirname alone. Treat any
    `prunable` entry from `git worktree list --porcelain` as `ambiguous`, never as a normal row at
    its stale reported path, and cross-check the physical listing of `workspace/worktrees/` against
    what Git actually reports: a directory present on disk but absent from that list — the real
    destination of a rename done outside Git — is inventoried and shown, never silently skipped.
13. Build the migration inventory: every source path, whether it comes from disk or from the pinned
    legacy commit, and the global paths that stay untouched (`modules/registry.md`,
    `modules/installed/`, `workspace/<repo_dir>/`). Include, as advisory only, root-level files and
    `modules/reports/<module>/*` entries that look project-specific but sit outside any namespaced
    destination. Include D6 absolute-root references in `.claude/settings.local.json`,
    `.claude/settings.json`, and `scripts/<project>/`, plus D10 old-root references and local
    customizations under `.claude/agents/` and `.claude/skills/`, all per `migration-contract.md`.
    These are advisory/manual mappings and are never moved automatically.

Never hold `catalog.lock` during this analysis, during questions, or while waiting on the user.

## 2. Build the project entry

1. Infer `repo_dir` from the single real Git child of `workspace/`.
2. Propose and confirm a valid slug.
3. Read `base_branch`, `branch_prefix` and `max_parallel` from the old config when resolvable. If
   the old prefix embeds the placeholder (e.g. `feature/<Story-ID>`), strip it — the new resolver
   appends the Story ID itself when it creates the branch.
4. Revalidate the branch and remote against real Git.
5. Ask about any remaining placeholder or ambiguous value.
6. Store `remote` only sanitized, credential-free.

The old stack/test/migration-tool fields never produce a second config file — the new resolver
infers them from the real repo when needed. The old `config.md` is kept as backup, never deleted.

## 3. Map sources to destinations

| Old source | New destination |
|---|---|
| `requirements-to-work.md` | `requirements/<project>.md` |
| root memory files (`assignments.md`, `components.md`, `lessons-learned.md`, `reputation.md`, `metrics.md`) | `.orchestrator/projects/<project>/` |
| old `events`/`designs`/`reviews`/`decisions`/`signals`/`announcements`/`objectives`/`stories` directories | same-named subdirectory of `.orchestrator/projects/<project>/` |
| `.orchestrator/module-rules/<old-repo-name>/*.md` | `.orchestrator/projects/<project>/module-rules/*.md` |
| `docs/<old-repo-name>/` | `docs/<project>/` |
| `scripts/<old-repo-name>/` | `scripts/<project>/` |
| `workspace/worktrees/<Story-ID>` | `workspace/worktrees/<project>/<Story-ID>` via `git worktree move`, optional and confirmed — after copies are verified and before the catalog is published (`WORKTREES_RESOLVED` precedes `CATALOG_PUBLISHED`), per `migration-contract.md` |
| `.orchestrator/config.md` | no destination — kept only as backup/reference |
| `workspace/<repo_dir>/` | same path; registered, never copied |
| `modules/registry.md`, `modules/installed/` | same global paths; never touched |

If the repo name already equals the slug, `docs/`/`scripts/` may already sit at their final path —
validate and leave them as-is. Never copy an official script from the repo root into a project
namespace.

`module-rules` is copied file by file into the flat `module-rules/` destination, **stripping the
old `<old-repo-name>` directory level** — unlike `docs/`/`scripts/`, the new path never nests a
per-repo folder under it (`.orchestrator/projects/<project>/module-rules/<module-name>.md`
directly, never `.../module-rules/<old-repo-name>/<module-name>.md`). Never copy that whole old
directory as-is.

Resolve every source from disk first. If a source only exists in the confirmed legacy commit,
extract it with `git show <legacy-commit>:<path>` (never a checkout, never a stash), rematerialize
it at its original singleton path as a verified backup, and only then copy it to the new
destination. Verify both writes against the Git blob (`hash_algorithm`/`object_format` from
`migration-contract.md`) before the catalog is published. Record, per file, which of the two sources
was used and the OID.

Module reports missing a project segment (`modules/reports/<module>/*.md`) are copied — never
moved — to `modules/reports/<module>/<project>/` only when ownership is unambiguous; otherwise list
as a manual pending action.

## 4. Preview

Generate and validate a fresh canonical UUID-v4 `migration_id` for this preview. Show: the slug and catalog values; repo and base branch; every source → destination pair; the
branch-prefix/module-rules normalization applied; the worktree inventory from Preflight step 12 with its
proposed move/defer outcome; the global paths that remain untouched; any optional source that is
absent; the advisory list of loose root-level files/reports; the exact legacy commit, which files
were recovered from it, and which were plain untouched templates; and an explicit statement that
originals are kept, never moved or deleted. Ask for one confirmation covering all of the above:
activity handling, per-worktree mapping (move / leave legacy / cancel), point-of-no-return consent
for any move, D6 structured-path mappings, D10 manual advisories, and whether to archive
originals after completion (default: yes). A file that looks like a secret requires its own separate
exact confirmation, or is excluded.

## 5. Publish — two brief `catalog.lock` windows, plus unlocked worktree reconciliation and archival

Never hold the mutex during copying, hashing or verification, and never while moving worktrees or
archiving.

**First window — declare intent**

1. Use the canonical UUID-v4 `migration_id` generated for and confirmed in Preview, then create
   `migration-in-progress.md.candidate-<migration_id>` via `Write` on that exact sibling path;
   reread it and validate its fields per `migration-contract.md`'s marker schema: `migration_id`,
   `created_by_session_id`/`owner_session_id`, project, repo, `source_snapshot`, the approved
   worktree mapping, `cutover_base`, the merge-base, and the exact legacy commit fixed in the
   preflight (this is what makes the extraction resumable via `git show` if `ORIG_HEAD` later
   changes). Reject the candidate if `decisions.worktrees: move` and
   `point_of_no_return_accepted` is not exactly `true`; do not publish a weaker intent.
2. Acquire `catalog.lock`.
3. Reread the catalog, markers, activity, sources and destinations. Re-run the step-1 cutover
   command against the same resolved repo; any failure releases the lock and blocks without
   publishing intent.
4. If a precondition changed, release the lock, discard only this session's own candidates, and
   return to the preview.
5. Rename the marker candidate to `migration-in-progress.md`; reread and fully revalidate it,
   including the move/PNR invariant.
6. Release the lock.

**Unlocked work — memory**

7. Create the project's memory from `.orchestrator/projects/.template/`.
8. Rematerialize, at their original singleton paths, every source recovered from Git; verify those
   backups; then copy every source to its new destination. Never move anything.
9. Verify each file by size and OID (`hash_algorithm`/`object_format`); for directories, compare the
   relative inventory and per-file OID. If any size, inventory or hash differs, block and do not
   prepare or publish the catalog candidate — hash here is the unfiltered OID against
   `source_snapshot`, and a drift here invalidates this intent (see `migration-contract.md`).

**Unlocked work — worktree reconciliation (only if the user chose to move)**

10. Reverify the source snapshot is still intact, reread the published intent marker, and require
    that `point_of_no_return_accepted` is exactly true,
    then begin per `migration-contract.md`. Before each move, create the per-project parent
    `workspace/worktrees/<project>/` idempotently (`mkdir -p`, canonical real directory, no lock).
    Move each
    eligible worktree individually with `git worktree move`, no lock held during the move. Pass both
    operands as **absolute** paths — relative ones resolve against the repo dir, not the
    installation root — and re-verify immediately before each individual move that the target path
    does not exist at all, because Git moves the worktree *inside* an existing directory and still
    exits 0. If a move ends `move_failed_clean` and left the parent empty, `rmdir` that exact parent
    non-recursively. After each move, verify path, bidirectional Git link, branch, `HEAD`, index, `status
    --porcelain=v1 -z` bytes and `worktree_content_manifest` against the pre-move snapshot. The
    admin directory keeps its legacy basename by design; compare resolved link targets, never that
    basename.
11. Derive each item's state from Git, never from a per-item marker write:
    `moved_verified` | `move_failed_clean` | `deferred` | `ambiguous`, exactly as
    `migration-contract.md` defines them. Only `move_failed_clean` still allows cancelling that
    item; any `moved_verified` or topological deviation crosses the point-of-no-return for the
    whole reconciliation — from there only forward resume/reconciliation is offered.
12. Continue only once every item reaches `WORKTREES_RESOLVED` (all `moved_verified`/`deferred`,
    none `pending`/`move_failed_clean`/`ambiguous`).

**Unlocked work — derived views**

13. Repoint only structured cells in `assignments.md`/`components.md` (the `Worktree` cell of the
    live table, an approved `Reference` mapping) via candidate/validate/rename/reread — never a
    global replace, never narrative prose from a closed "corrida"/session, and only for worktrees
    that actually reached `moved_verified`: a `deferred` row keeps its legacy path, per
    `migration-contract.md` ("Derived views"). If the live table cannot be uniquely identified,
    leave bytes untouched and emit an advisory instead. Apply the same D6 rule to explicitly
    approved structured absolute-path fields inventoried in `.claude/settings.local.json`,
    `.claude/settings.json`, and `scripts/<project>/`; never rewrite prose, permissions, shell text,
    comments, history, or ambiguous fields.
14. Prepare and validate `.orchestrator/projects.yml.candidate-<migration_id>`.

**Second window — activate**

15. Acquire `catalog.lock` again.
16. Reread only the shared metadata: the catalog and the marker. The marker must still belong to
    this session (or have completed the explicit takeover); the catalog must still match what was
    previewed. Copies/hashes/moves were already verified right before this window; other commands
    are blocked by the marker.
17. If anything changed, release the lock and stop for reconciliation — do not publish.
18. Rename the `projects.yml` candidate into place; reread it.
19. Verify the catalog resolves to the repo and to every verified copy.
20. Build `migration-completed.md.candidate-<migration_id>` from the current intent without changing
    `intent`. Set `state: COMPLETED`; populate `result.destination_snapshot`, effective worktree
    mappings, D6 transformations, `completed_at`, and residual deferred items; set
    `completed_by_session_id` to the current owner, `owner_session_id: null`, and set
    `archive_status` to `ARCHIVE_PENDING` or `ORIGINALS_RETAINED` from the approved decision. Validate
    the complete schema, snapshots, catalog resolution, prior state `CATALOG_PUBLISHED`, migration
    identity and ownership. Rename this candidate directly to `migration-completed.md`, reread and
    revalidate it, then remove the matching `migration-in-progress.md` only after the completed
    marker is proven durable. Release the lock. A filename rename alone is never a completion
    transition, and no state may expose both markers after a successful window.

**Unlocked work — archival (only if the user chose to archive)**

21. Once `COMPLETED`, archive per `migration-contract.md` ("Archival"): a brief `catalog.lock`
    window acquires `archive_owner_session_id` on the completed marker; the file moves and hashing
    happen unlocked, one literal path at a time, never a loop/glob/`rm -r`; each marker update after
    that uses the standard candidate/verify/rename/reread pattern under a brief lock. A drift
    detected immediately before moving a file leaves it in place as `ARCHIVE_BLOCKED_DRIFT` rather
    than archiving a changed version.

The catalog is the last activation point for the core migration. No command ever consumes a partial
copy, and no expensive operation ever holds the global mutex.

## 6. Resume and cancel

- If both markers coexist after a completion crash, apply only the compare-and-delete transaction
  in `migration-contract.md` (the single normative resolver); do not reproduce or improvise it here.
- A present `in-progress` marker owned by this session blocks ordinary project-scoped commands and
  resumes automatically; owned by another session, it blocks until that session's explicit takeover
  completes (`migration-contract.md`).
- Resuming rereads the filesystem, the catalog, sources, destinations, and — if reconciliation had
  started — the real Git state of every worktree in the mapping, deriving `pending` /
  `moved_verified` / `move_failed_clean` / `deferred` / `ambiguous` fresh rather than trusting the
  marker's text. An identical copy is reused; an incomplete or different one blocks and requires
  resolution.
- If the catalog was already published, verify it and complete the marker without repeating the
  copy; if archival was in progress, resume only the remaining archive items.
- Cancelling is available only before the point-of-no-return (before any `moved_verified` or
  topological deviation) and never deletes sources, repos, worktrees or modules. Only enumerated,
  verified copies may be withdrawn, one file at a time, followed by `rmdir` on the exact empty
  directories — never `rm -r`, never a glob. Before withdrawing final copies, show the exact inventory and ask for approval on those concrete paths; there is no standing wildcard permission for this.
- After cleanup (or after deciding to keep residue), take one brief `catalog.lock` window to reread
  state and remove only the `in-progress` marker belonging to the cancelled session.
- If full ownership of a residue cannot be proven, keep it and ask for a manual decision.
- A cancel/restart before the point-of-no-return retires this intent and its candidates. Returning
  to Preview always generates a new `migration_id`; never reuse the cancelled identity.

## Rules

- Never touch Git beyond read-only inspection (`show`, `ls-tree`, `merge-base`, `rev-parse`,
  `worktree list`) and, only after explicit confirmation and only on a worktree with no lock, no
  live claim, and verifiable activity, `git worktree move` per "5. Publish". No pull, fetch, merge,
  rebase, reset, stash or push, ever.
- Never run `git worktree repair` with explicit paths from a checkout that may be a copy of another
  installation — it can rewrite the *other* installation's links instead of this one's. Detecting
  and fixing a coupled installation is out of scope for this command: report and stop.
- Never update an installed module or `modules/registry.md`.
- Never treat a commit's mere presence in `ORIG_HEAD` as consent — only its content, classified
  against `cutover_base`, decides significance.
- Never invent a migration mechanism outside the candidate/verify/rename/reread contract and the
  state machine already defined in `.orchestrator/migration-contract.md`.
- Never write a second copy of `migration-contract.md`'s schema, activity table, or state machine
  into this skill or into `CLAUDE.md` — reference it instead.
