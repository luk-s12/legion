# Isolated integration v1

The owner may materialize reviewed snapshots ONLY below `runtime/integration/<unique-id>/`.
This is the narrow exception to the ban on automatic copying/combining uncommitted work. It never
writes into story worktrees/base repositories, their indexes or branches, and creates no commits.
No extra coordination lock is introduced. Expensive materialization/tests happen outside mutexes.

`integrate` receives project-scoped approval paths in dependency order. Every receipt must approve
a current candidate, and candidates must share BASE_SHA and the same baseline checkout bytes.
Different bases, symlinks, submodules or missing historical evidence require explicit handling;
the helper does not silently rebase. External artifact baselines must agree for shared paths.

The helper combines before/after manifests including new files, deletions, modes and binaries.
Identical edits coalesce. Competing text edits use a three-way merge; binary/delete/mode conflicts
are reported conservatively. It retains owner identity, inputs and a project report. Sources are
rechecked after materialization. MATERIALIZED, CONFLICTED and STALE are not functional approvals.

Run `integration-verify` with the exact required check set resolved from real project commands.
Checks execute only against the temporary repo/external trees; fingerprints and source receipts
are checked before/after. VERIFIED is tied to the input IDs and materialized tree, not a global
claim that every queued story is complete. New queue entries do not prevent checks of a ready set.
Only the owner can declare project closure after revalidating no pending work under its mutex.

Correction reacquires the appropriate story claim, delegates its writer and requires new review.
An integration copy must never become a replacement story worktree or source of unreviewed harvest.
Temporary retention is explicit: this release retains integration evidence by default. Cleanup must
verify the exact run owner, path containment and inactivity; no broad recursive deletion, no force
worktree removal, no deletion of originals. Never delete the only remaining evidence of a failure.
