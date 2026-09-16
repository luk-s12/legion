# Bootstrap and legacy recovery

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
| valid, has projects | any | completed + in-progress | apply the dual-marker transaction in `.orchestrator/migration-contract.md`; verified completion wins, otherwise block preserving both |
| invalid | any | any | block without overwriting |

A `completed` marker with an empty/missing catalog is itself inconsistent and blocks.
The dual-marker row is a crash-recovery case, not a normal no-op. Its only normative resolver is
`.orchestrator/migration-contract.md`; this bootstrap does not duplicate its schema or algorithm.

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
2. verify Git topology per `.orchestrator/migration-contract.md` — a worktree link that escapes
   this checkout's own repo blocks unconditionally, before anything else, and is never fixed
   automatically (`git worktree repair` with explicit paths can rewrite a *different* installation);
3. classify pending activity per that same contract's matrix — a live claim or a held mutex blocks;
   an in-progress marker owned by this session resumes, owned by another session requires the
   contract's explicit takeover; anything else (unverifiable activity, pending harvest) is evidence
   to show and a single confirmation to ask for, never a silent block;
4. ensure namespaced destinations do not exist;
5. show exact source/destination preview — including which files came from disk vs. from the
   pinned legacy commit, the worktree reconciliation mapping, and the archive-or-retain choice —
   and ask for one confirmation covering all of it.

Only then, in a first brief catalog-mutex window, publish the intent as
`.orchestrator/migration-in-progress.md` (candidate prepared beforehand, rereading current state,
atomically renamed under the lock, then the lock released). Unlocked again:

6. copy, never move, old requirements and memory (when a source only exists as a Git blob,
   rematerialize and verify it at its original singleton path first, then copy to the new one);
7. compare content and hashes against the pinned algorithm in `migration-contract.md`;
8. if the user opted to move legacy worktrees, reconcile them per that contract's state machine —
   the one Git write this command ever performs, and only after copies are reverified intact.
9. repoint D6 derived views only through approved structured fields, including inventoried absolute
   old-root paths in settings and project scripts; prose and ambiguous references remain advisory.

A second brief catalog-mutex window then publishes `projects.yml` last with
candidate/verify/rename/reread, builds and validates
`migration-completed.md.candidate-<migration_id>` with `state: COMPLETED`, its final result/snapshot,
completion identity, cleared owner and initial archive state, publishes and rereads it, retires the
matching in-progress marker only after that proof, and releases. A filename rename alone never
completes a migration. No
expensive operation — copying, hashing, moving a worktree, or waiting on the user — ever happens
while either window's lock is held. Originals are retained as backup throughout, and the completed
marker itself is permanent evidence: no command ever deletes it. Optionally, once completed, archive
the retained originals per `migration-contract.md` ("Archival") — never before the catalog is
verified to resolve every copy.

Before catalog publication, interruption blocks commands until resume or cancel/restart. Cancel
removes only verified copies and returns to setup-required. It never enables a fallback mode.

A Claude Code session started before the pull does not discover `/legion-upgrade` or this table
mid-session. Close it and start a new one on the same checkout (or use a documented action that
really reloads the skill host) before invoking the command — starting a new session runs no Git
operation and never changes the `ORIG_HEAD` the earlier pull already fixed.
