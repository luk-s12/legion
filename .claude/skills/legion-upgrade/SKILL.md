---
name: legion-upgrade
description: Migrates a pre-multiproject Legion installation after Git has updated the checkout. It resumes the singleton-to-multiproject bootstrap and never updates Git or installed modules.
---

Read `CLAUDE.md` first — the project-resolver table under "Required bootstrap for an older
installation" is this command's contract. This skill implements that bootstrap; it does not repeat
or contradict its rules.

```text
cutover_base: 3e390c2147eb11bde2a4bfb1ed8bae117a973ef8
```

This is the last official pre-multiproject commit on `main`. Every "is this commit official
distribution or real user data" decision in this skill compares against this literal value. Never
resolve it dynamically at runtime and never accept a placeholder — if this line is not a real,
resolvable commit hash, the command must refuse to run.

**Arguments**: none. `/legion-upgrade` takes no remote, branch, version or module argument.

Never runs `git pull`, `fetch`, `merge`, `rebase`, `reset` or `stash`. That is entirely the user's
own Git workflow, before this command is ever invoked.

## Behavior by state

Apply `CLAUDE.md`'s project-resolver table directly:

- catalog with projects: report no-op, do not read any singleton path;
- empty catalog, no legacy evidence: direct the user to normal registration (this skill does not
  register a project itself in that case);
- legacy evidence (disk or added/modified blobs from the fixed legacy candidate commit): run the
  preflight/bootstrap below;
- pending `migration-in-progress.md` with a valid or missing catalog: resume it (see "Resume and
  cancel");
- invalid catalog (including one with a pending marker), ambiguous history, or active
  stories/claims/worktrees: block and show the exact concrete evidence, never overwrite.

## 1. Preflight (read-only, no lock)

1. Run the resolver over the working tree.
2. If an expected singleton source is missing on disk, evaluate `ORIG_HEAD` as the only candidate:
   require it to be a valid commit, an ancestor of `HEAD`, and reachable in the current checkout.
   Show its hash and the relevant legacy diff. If `ORIG_HEAD` is gone, point the user at
   `git reflog` and ask for the exact hash — never select one automatically.
3. Classify the candidate commit against `cutover_base`:
   - ancestor of `cutover_base` → its singleton blobs are official distribution, pristine by
     themselves;
   - descendant or divergent with a common ancestor → diff only the singleton allowlist between
     `merge-base(candidate, cutover_base)` and the candidate, using the equivalent of
     `git diff --diff-filter=AM --name-only <merge-base> <candidate> -- <singleton-allowlist>`;
     only added or modified blobs are significant, while deletions alone are not evidence;
   - shallow history, missing objects, no common base, or an unverifiable ref → ambiguous; require
     explicit user confirmation, never classify automatically.
   Fix the candidate, its base, and the significant paths in the preview and later in the marker.
4. Detect the single inherited repo under `workspace/` (only subdirectory with `.git`, other than
   `worktrees/`).
5. Read `.orchestrator/config.md` from disk, or from the confirmed legacy commit if absent on disk.
6. Cross-check assignments, events and `git worktree list`.
7. Block if there are active stories, live claims, or worktrees pending harvest.
8. Block if the target slug or any namespaced destination already exists; never merge into or
   overwrite an existing destination.
9. Reject symlinks/junctions that escape the repo root.
10. Build the migration inventory: every source path, whether it comes from disk or from the
    pinned legacy commit, and the global paths that stay untouched (`modules/registry.md`,
    `modules/installed/`, `workspace/<repo_dir>/`).

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
destination. Verify both writes against the Git blob before the catalog is published. Record, per
file, which of the two sources was used and the blob hash.

## 4. Preview

Show: the slug and catalog values; repo and base branch; every source → destination pair; the
branch-prefix/module-rules normalization applied; the global paths that remain untouched; any
optional source that is absent; the exact legacy commit, which files were recovered from it, and
which were plain untouched templates; and an explicit statement that originals are kept, never
moved or deleted. Ask for one confirmation after the preview. A file that looks like a secret
requires its own separate exact confirmation, or is excluded.

## 5. Publish — two brief `catalog.lock` windows

Never hold the mutex during copying, hashing or verification.

**First window — declare intent**

1. Create `migration-in-progress.md.candidate-<session>` via `Write` on that exact sibling path;
   reread it and validate its fields: `session_id`, project, repo, sources, destinations, the
   approved inventory, `cutover_base`, the merge-base, and the exact legacy commit fixed in the
   preflight (this is what makes the extraction resumable via `git show` if `ORIG_HEAD` later
   changes).
2. Acquire `catalog.lock`.
3. Reread the catalog, markers, activity, sources and destinations.
4. If a precondition changed, release the lock, discard only this session's own candidates, and
   return to the preview.
5. Rename the marker candidate to `migration-in-progress.md`; reread it.
6. Release the lock.

**Unlocked work**

7. Create the project's memory from `.orchestrator/projects/.template/`.
8. Rematerialize, at their original singleton paths, every source recovered from Git; verify those
   backups; then copy every source to its new destination. Never move anything.
9. Verify each file by size and `git hash-object --no-filters`; for directories, compare the
   relative inventory and per-file hash. If any size, inventory or hash differs, block and do not
   prepare or publish the catalog candidate.
10. Prepare and validate `.orchestrator/projects.yml.candidate-<session>`.

**Second window — activate**

11. Acquire `catalog.lock` again.
12. Reread only the shared metadata: the catalog and the marker. The marker must still belong to
    this session; the catalog must still match what was previewed. Copies/hashes were already
    verified right before this window; other commands are blocked by the marker.
13. If anything changed, release the lock and stop for reconciliation — do not publish.
14. Rename the `projects.yml` candidate into place; reread it.
15. Verify the catalog resolves to the repo and to every verified copy.
16. Rename `migration-in-progress.md` to `migration-completed.md`; reread the final marker.
17. Release the lock.

The catalog is the last activation point. No command ever consumes a partial copy, and no
expensive operation ever holds the global mutex.

## 6. Resume and cancel

- A present `in-progress` marker blocks ordinary project-scoped commands.
- Resuming rereads the filesystem, the catalog, sources and destinations. An identical copy is
  reused; an incomplete or different one blocks and requires resolution.
- If the catalog was already published, verify it and complete the marker without repeating the
  copy.
- Cancelling never deletes sources, repos, worktrees or modules. Only enumerated, verified copies
  may be withdrawn, one file at a time, followed by `rmdir` on the exact empty directories — never
  `rm -r`, never a glob. Before withdrawing final copies, show the exact inventory and ask for
  approval on those concrete paths; there is no standing wildcard permission for this.
- After cleanup (or after deciding to keep residue), take one brief `catalog.lock` window to reread
  state and remove only the `in-progress` marker belonging to the cancelled session.
- If full ownership of a residue cannot be proven, keep it and ask for a manual decision.

## Rules

- Never touch Git beyond read-only inspection (`show`, `ls-tree`, `merge-base`, `rev-parse`,
  `worktree list`). No pull, fetch, merge, rebase, reset, stash or push.
- Never update an installed module or `modules/registry.md`.
- Never treat a commit's mere presence in `ORIG_HEAD` as consent — only its content, classified
  against `cutover_base`, decides significance.
- Never invent a migration mechanism outside the candidate/verify/rename/reread contract already
  used everywhere else in `.orchestrator/`.
