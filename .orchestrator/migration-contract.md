# Migration contract for `/legion-upgrade`

Single normative schema and state machine for a singleton → multiproject migration. `CLAUDE.md`'s
project-resolver table and `.claude/skills/legion-upgrade/SKILL.md` delegate all of this here instead
of repeating it — two documents describing the same contract in different prose is the "second
resolver" this repository forbids elsewhere.

**Frontier with `.orchestrator/runtime-contract/README.md`**: that file describes only
`catalog.lock`/`project.lock`/story claims (unchanged, its normal scope). Everything below —
`migration_id`, session identity, ownership, takeover, hashing, snapshots, worktree reconciliation,
archival — lives exclusively here.

## Identity and ownership

- `migration_id`: UUID v4, canonical lowercase, generated during the confirmed preview before any
  candidate is created, then fixed atomically when the intent marker is first published. It
  identifies that intent and never changes across resumes. A cancel/restart before the
  point-of-no-return discards that intent and its candidates; the new preview generates a new
  `migration_id` rather than reusing the cancelled one.
- `created_by_session_id` / `owner_session_id` / `completed_by_session_id` / `archive_owner_session_id`:
  opaque, non-empty session identifiers. The session ID comes from the host; if the host does not
  expose one, generate a UUID v4 for that session. Not required to look like a UUID — validated as an
  opaque, bounded value with no path separators. Never used raw in a candidate filename; candidates
  use `migration_id`.
- Only `owner_session_id` may continue a migration automatically. Any other session must block, show
  the current owner and real state, and offer takeover only after explicit confirmation that the
  prior writer is not still active. Takeover rereads marker/catalog/locks under a brief `catalog.lock`
  window, replaces the marker with a verified candidate, updates `owner_session_id`, and appends to
  `resume_history` — never by age.
- `resume_history`: append-only list of `{previous_owner, new_owner, at, evidence, user_decision}`.
- `owner_session_id` becomes `null` atomically when the marker reaches `COMPLETED`
  (`completed_by_session_id` records who published it). `archive_owner_session_id` becomes `null`
  atomically on reaching `ARCHIVED` or `ORIGINALS_RETAINED`; it stays set through `ARCHIVE_PENDING`,
  `ARCHIVE_PARTIAL` and `ARCHIVE_BLOCKED_DRIFT`.
- A `migration-completed.md` created by `/legion-upgrade` is permanent evidence: no command or skill
  ever deletes it. A native multiproject installation that never ran `/legion-upgrade` may legitimately
  have no marker at all — that is a valid state, never one that gets a synthetic marker.

## Cutover-base gate

Before any resolver action, preview, question, candidate, lock, or write, execute
`git -C <absolute-orchestrator-root> cat-file -e <cutover_base>^{commit}` (or the equivalent
`rev-parse --verify` against that same root) against **the orchestrator's own checkout** — the repo
containing `CLAUDE.md` and the skill, never `workspace/<repo_dir>`, which is an unrelated project
repo with no reason to contain a Legion commit. Non-zero exit is the non-overridable
`CUTOVER_BASE_UNRESOLVABLE` blocker: do not preview as actionable and create no candidate or marker.
Re-run the same check against that same root after acquiring the first `catalog.lock`, before
publishing intent; a failure releases the lock and blocks without mutation.

## Hashing

- `hash_algorithm: git-hash-object-no-filters-v1`, always paired with `object_format` (read via
  `git rev-parse --show-object-format`, typically `sha1`). Every OID in this contract is computed
  with `git hash-object --no-filters`; never mix filtered and unfiltered OIDs, and never assume SHA-1
  in a repo with a different object format.
- `source_snapshot[]`: one entry per source — `source`, `destination`, `source_mode` (`disk` or
  `git`), byte size, and the unfiltered OID. Paths are relative, use `/`, never contain `..`, are
  never absolute, and are re-checked for containment on every read.
- Sources are reread against this snapshot immediately before copying, immediately before the first
  worktree move, and immediately before publishing the catalog. A drift detected before the
  point-of-no-return (see below) invalidates the intent — cancel this migration's own candidates and
  restart preview with a new `migration_id`. A drift detected after the point-of-no-return blocks as
  `SOURCE_DRIFT_AFTER_PNR`: never publish, never overwrite, preserve both versions and the worktrees
  already moved, and require manual reconciliation forward.
- `destination_snapshot[]`: populated only in `result`, after publication. Each entry has exactly
  `source`, `destination`, `source_mode` (`written` or `transformed`), byte `size`, and the final
  unfiltered `oid` of what was actually written, including any approved transformation (e.g. a
  repointed cell in `assignments.md`). It uses the same path/OID containment rules and never mutates
  `source_snapshot`.

## Worktree reconciliation (D3/D4)

Before preview, build one row per legacy worktree with: current path, proposed namespaced path
(`workspace/worktrees/<project>/<Story-ID>` — one per-project parent directory, the Story ID
nested directly inside it, no `--` separator), the real admin entry from
`git worktree list --porcelain`, branch and `HEAD`, the Story ID with the evidence used to confirm it
(dirname, branch, requirements, board — never the dirname alone when they disagree), a
`status --porcelain=v1 -z` byte snapshot plus a `worktree_content_manifest` OID (tracked + untracked +
ignored content, computed by the canonical algorithm below, never written with `-w`), ahead/behind
against the base when resolvable, and any Git lock or live claim.

`git worktree list --porcelain` is the enumeration source, but it is not self-verifying: a worktree
directory renamed or moved outside Git (never via `git worktree move`) leaves the admin entry pointing
at a path that no longer exists, which Git itself flags with a trailing `prunable <reason>` line. Any
`prunable` entry is never treated as a normal row with its stale reported path — it is always
`ambiguous`, since Git's own registry contradicts the filesystem, and it is never pruned by this
command. Separately, cross-check every physical entry under `workspace/worktrees/` against the paths
`git worktree list --porcelain` actually reports: a directory that exists on disk but is not reported
at all (the real destination of an out-of-band rename, now invisible to Git as a worktree) is exactly
the "collisions or discrepancies of name" case the Story ID mapping already requires the user to
resolve explicitly — it is inventoried and shown, never silently omitted from the preview.

`worktree_content_manifest` is a deterministic byte stream, not a file count or prose summary:

1. Enumerate the union of tracked paths (`git ls-files -z`) and all present untracked/ignored paths
   (`git ls-files --others --ignored --exclude-standard -z` plus the non-ignored `--others` set).
   Normalize every relative path to `/`, reject NUL, `..`, absolute paths and case/normalization
   collisions, deduplicate by normalized path, then sort by the unsigned UTF-8 bytes of that path.
2. Emit exactly one entry per path as four NUL-delimited fields followed by a final NUL:
   `path\0type\0size\0oid\0`. Decimal `size` is the byte size of the represented payload. `oid` is
   lowercase `git hash-object --no-filters` output using the recorded `object_format`.
3. `type=file` hashes file bytes. `type=symlink` hashes the UTF-8 bytes of the link target and uses
   that target's byte length, without following it; an escaping target makes the manifest
   incomplete. `type=submodule` uses size `0` and the checked-out commit OID only when the submodule
   is clean and its recursive content/status is verifiable; otherwise incomplete. Directories are
   implicit and never get entries. Junctions, devices, sockets, FIFOs, inaccessible entries,
   undecodable paths, and any unsupported type make the manifest incomplete.
4. Hash the complete entry stream once with `git hash-object --stdin` (without `-w`). Store the
   resulting OID plus entry count and byte length so truncation is detectable. Empty worktrees still
   hash the empty stream. Pre- and post-move use exactly the same encoding and enumeration.

An inaccessible file, an unsupported special file type, a symlink/junction that escapes the
worktree root, or a dirty submodule without a verifiable recursive snapshot makes that item's
`worktree_content_manifest` incomplete. Such an item is never moved: it is `deferred` if a
complete pre-move snapshot exists for everything else and the unresolved entry is otherwise inert,
or `ambiguous` if it cannot be established which. It is never degraded to comparing only
`status --porcelain=v1 -z` or a file count as a substitute for the full manifest.

The post-preview confirmation offers exactly: (1) move eligible worktrees to the namespaced path
(recommended); (2) leave them with legacy naming, registered as pending reconciliation; (3) cancel
without writing anything.

If (1): the intent and approved mapping publish into `migration-in-progress.md` as immutable — they
are never rewritten per move. A `migration-in-progress.md` already published before this contract
retargeted D3/D4 to the nested layout is resumed with its `worktree_mappings` exactly as published
(a `--` destination); it is never reinterpreted to the nested path. Only an intent published after
the retarget lands on `workspace/worktrees/<project>/<Story-ID>`. Before each `git worktree move`,
create the per-project parent `workspace/worktrees/<project>/` idempotently (`mkdir -p`, canonical
parent — not a symlink, real contained directory) and validate segments and target per `CLAUDE.md`'s
`### Worktree path and Story-ID validation`. Each worktree then moves individually with
`git worktree move`, no global lock held during the move. After each move, verify path, the
bidirectional Git link, branch, `HEAD`, index, and both the `status --porcelain=v1 -z` bytes and the
`worktree_content_manifest` against the pre-move snapshot. If a move ends `move_failed_clean` and the
parent was left empty, attempt a non-recursive `rmdir` of that exact parent; never under a lock,
never recursive.

Three Git behaviours are load-bearing here and are verified, never assumed:

- **Both arguments are absolute paths.** `git worktree move` resolves relative paths against the
  repository directory, not the installation root, so the `git -C <repo_dir>` form used elsewhere
  silently fails (`fatal: ... No such file or directory`) or, worse, resolves somewhere unintended.
  Build both operands as absolute, canonicalized paths.
- **The target must not exist at all.** Given an existing directory — even an empty one — Git moves
  the worktree *inside* it (`.../<project>/<Story-ID>/<Story-ID>`) and still exits 0. That nested
  result is not the approved mapping, so the target's absence is re-verified immediately before each
  individual move, not only during preflight. An existing target aborts that item as
  `move_failed_clean` without invoking Git; a post-move path that differs from the approved target by
  even one segment is `ambiguous`, never `moved_verified`.
- **The administrative directory keeps its legacy basename.** After moving
  `worktrees/<Story-ID>` to `worktrees/<project>/<Story-ID>`, the admin entry stays
  `.git/worktrees/<Story-ID>` and only its `gitdir` file is rewritten to the new location. This is
  correct and expected: verification compares the bidirectional link's *resolved targets*, never the
  admin directory's basename, which would otherwise fail every successful move.

Resuming derives each item's real state from Git — never from a per-item marker write:

- `pending`: not yet attempted.
- `moved_verified`: the source path is gone and `git worktree list --porcelain` registers this
  worktree at *exactly* the approved target path — not merely a directory existing there, which is
  also true of the nested result Git produces when the target already existed — and every invariant
  matches.
- `move_failed_clean`: source still present, target absent, snapshot and links intact — `git worktree
  move` failed but nothing changed. Only `move_failed_clean` items still allow cancelling; record the
  failure once (stderr, classification) under a brief `catalog.lock` window, then offer retry-exact or
  leave `deferred`.
- `deferred`: locked, claimed, activity not verifiable, or the user chose not to move it. Never moved.
  `/legion` recognizes it **by branch** (`<branch_prefix>/<Story-ID>`) against
  `git worktree list --porcelain`, with the approved `worktree_mappings` and the derived view as
  mandatory corroborating evidence — Git is authoritative over worktrees, the mapping records the
  intent, not the state. All three must agree that the worktree is still at its legacy path; if they
  disagree it is `ambiguous` (manual block), never a second worktree for the same story/branch. This
  is a deliberate change of the authoritative recognition channel (from "via the approved mapping"),
  recorded as an architecture decision; the state machine, schema and hashing are unchanged.
- `ambiguous`: source and target both present, both absent, cross-linked, or any HEAD/status/manifest
  mismatch against the snapshot. Blocks activation; requires manual reconciliation, never resume.

**Point-of-no-return**: crossed by the first item observed `moved_verified`, or by any topological
deviation from the pre-move snapshot — never by a separate marker write "announcing" it. Before that
point, cancelling is available (it discards only this session's own verified candidates). After it,
only forward resume/reconciliation is offered; `move_failed_clean`, being provably intact, is the one
exception that still allows cancelling that specific item.

`WORKTREES_RESOLVED` is reached once every item is `moved_verified` or `deferred` (zero moves
attempted is also `WORKTREES_RESOLVED`, trivially — nothing to reconcile). It never hides `pending`,
`move_failed_clean` or `ambiguous`, and it explicitly allows a mix of `moved_verified` and `deferred`
in the same migration. Only `WORKTREES_RESOLVED` with a fully revalidated `source_snapshot` enters the
final catalog-activation window.

## Derived views (D6)

`assignments.md`/`components.md` repoint **only structured cells** — the `Worktree` cell of the live
assignment table, the `Reference` cell in `components.md` when it holds an approved mapping — via
candidate/validate/rename/reread. Never a global find-replace.

A cell is repointed only when its worktree actually reached `moved_verified`. A `deferred` item was
never moved and still lives at its legacy path: repointing it would publish a path that does not
exist and would defeat D5, which requires `git worktree list --porcelain` (authoritative, matched by
branch), the derived view and the completed marker to all agree that the worktree is still at its
legacy path — a disagreement is `ambiguous`, never a duplicate worktree. Items that are `pending`,
`move_failed_clean` or `ambiguous` never
reach this step at all, since `WORKTREES_RESOLVED` gates it. When a migration mixes outcomes, only
the moved subset is rewritten and the deferred rows keep their original bytes. If the live table cannot be uniquely
identified, or a path reference only appears in prose, do not edit it automatically: leave the bytes
untouched and emit an advisory. Narrative prose describing a closed "corrida"/session (including one
that mentions a legacy path) is history, exactly like `events/`/`reviews/`/`designs/`/`decisions/` —
never rewritten. A `destination_snapshot` entry records, for each edited file, the final size/OID and
the exact mapping that explains the delta.

Also inventory absolute-path references containing the old installation root in
`.claude/settings.local.json`, `.claude/settings.json`, and every file below `scripts/<project>/`.
This inventory is advisory by default and records file, structured field (when identifiable), old
value and proposed mapping. Automatically rewrite only an explicitly approved, uniquely parsed
structured path field through candidate/validate/rename/reread. Never rewrite permission patterns,
shell fragments, free text, comments, generated history or an entire file by global replacement;
ambiguous references remain unchanged as manual actions.

Module reports (`modules/reports/<module>/*.md` missing a project segment) are copied — never moved —
to `modules/reports/<module>/<project>/` only when ownership is unambiguous; otherwise list as a
manual pending action, same as any other advisory in D10.

## Loose-root and local-customization inventory (D10)

The preview inventories, without moving anything automatically: project-looking root files,
un-namespaced module reports, every absolute path that still contains the previous installation
root, and local customizations/additions under `.claude/agents/` and `.claude/skills/` relative to
the pinned distribution baseline. Each item is classified as global, project-owned, ambiguous, or
manual mapping required, with evidence and a proposed destination when one is safe. These are
advisories only: D6 may update an explicitly approved structured path field, but D10 never moves,
deletes, merges, or rewrites these files automatically.

## Archival (D7)

The preview asks, alongside its main confirmation, whether to archive originals after the core
completes (default: yes) or keep them in place as passive backup.

If archiving: destination is
`.orchestrator/_legacy-backup-<yyyyMMddTHHmmssZ>-<migration_id>/` — the timestamp segment is
filesystem-safe (no `:`, never raw ISO-8601) and the `migration_id` suffix rules out any path
collision; a collision blocks rather than reusing or merging into another backup. Relative paths are
preserved. A `README.md` inside states the inventory, algorithm/object format, `source_snapshot`,
`destination_snapshot`, sizes, OIDs, origin, active destination and when it is safe to delete.

Rules: `migration-completed.md` must exist and the catalog must already resolve every copy before
archiving starts; each move uses one literal, previously approved path — never a loop, glob, or
`rm -r`; immediately before each move, the source is reverified against the intent's snapshot — a
mismatch leaves it untouched and marks that item `ARCHIVE_BLOCKED_DRIFT` (never archives the
drifted version automatically); after each move, verify size/OID in the backup and the origin's
absence; the completed marker records `archive_status`, `archived_to` and the per-item inventory.
Acquiring `archive_owner_session_id` and every subsequent marker update use the standard brief
`catalog.lock` window plus candidate/verify/rename/reread; the file moves and hashing themselves stay
unlocked. An interruption leaves `archive_status: ARCHIVE_PARTIAL` — `/legion-upgrade` can resume only
the archival while `/legion` already operates on the published project. If the user leaves originals
in place, `/legion` mentions once per session that they are passive backup, never a fallback source.

## State machine

```text
PREVIEWED
  → INTENT_PUBLISHED
  → COPIES_VERIFIED
  → WORKTREES_RESOLVED                 # zero moves attempted; everything deferred
    | WORKTREE_RECONCILIATION_STARTED  # point-of-no-return: first moved_verified or any
                                        # topological deviation from the pre-move snapshot
      → WORKTREES_RESOLVED             # mixed moved_verified / deferred results allowed
  → CATALOG_PUBLISHED
  → COMPLETED

COMPLETED.archive_status:
  ARCHIVE_PENDING | ARCHIVE_PARTIAL | ARCHIVE_BLOCKED_DRIFT | ARCHIVED | ORIGINALS_RETAINED

Blocking substates before CATALOG_PUBLISHED:
  AMBIGUOUS | MOVE_FAILED_CLEAN | SOURCE_DRIFT_AFTER_PNR
```

- Before `CATALOG_PUBLISHED`, `migration-in-progress.md` blocks other project-scoped commands.
- After `COMPLETED`, the project operates normally regardless of `archive_status`.
- Every transition validates the prior state and rereads the destination before writing.
- The `CATALOG_PUBLISHED -> COMPLETED` transition is a data transition, never merely a filename
  rename. Under one brief `catalog.lock` window, build
  `migration-completed.md.candidate-<migration_id>` from the current intent, preserve `intent`, set
  `state: COMPLETED`, populate the complete `result` including `destination_snapshot` and
  `completed_at`, set `completed_by_session_id` to the current owner, clear `owner_session_id`, and
  set the approved initial `archive_status`. Validate the candidate and current catalog/marker,
  rename the candidate directly to `migration-completed.md`, reread/revalidate it, and only then
  remove the matching `migration-in-progress.md`. A successful window exposes exactly one completed
  marker; interruption before its durable reread leaves the in-progress marker authoritative. An
  interruption after that reread but before the in-progress marker is removed transiently leaves both
  files present — resume treats a verified `migration-completed.md` as authoritative in that case: the
  migration is already done, and resuming only finishes the leftover removal, never repeats the copy,
  moves, or catalog publication. "Verified" here requires both complete marker schemas, equal
  `migration_id`, a valid populated catalog resolving the intended project/repo, and revalidated
  source and destination snapshots. If the IDs differ, the completed marker is incomplete/corrupt,
  or any catalog/snapshot evidence is inconsistent, the state is ambiguous: block and preserve both
  markers without cleanup or forward work.
- The dual-marker decision and cleanup are one compare-and-delete transaction under a brief
  `catalog.lock`: acquire the lock first, then reread the catalog and both marker bytes, validate
  both complete schemas and all current snapshots, and compare their immutable `intent` and
  `migration_id`. No pre-lock classification authorizes a deletion. Only the matching verified case
  removes the exact `.orchestrator/migration-in-progress.md`; it immediately rereads that the path is
  absent before releasing the lock. The precheck is advisory and never participates in the cleanup
  predicate: only the fresh evidence reread after valid lock acquisition decides. Different
  IDs/intents, an invalid schema, a mutation before that locked reread that makes current evidence
  inconsistent, or any stale snapshot blocks and preserves both files.
- Resume always recomputes real evidence (Git, files, hashes) — it never trusts the marker's text
  alone as proof of current state.
- Cancelling is available only while every attempted move is provably `pending` or
  `move_failed_clean`; after any `moved_verified` or topological deviation, only forward
  resume/reconciliation is offered.
- There is no automatic rollback after the catalog publishes: complete or reconcile forward, never
  destroy a published project.

## Marker schema (minimal, `schema_version: 1`)

An unknown `schema_version` is rejected before writing anything. The schema below is normative,
not illustrative. Validation is recursive: validating only root keys or extracting duplicate keys
with `sed` is invalid. Keys are unique; arrays contain structured entries of the shapes defined in
the snapshot/worktree sections; paths are normalized relative paths contained by the checkout (no
absolute path, `..`, symlink/junction escape or NUL); OIDs are lowercase hex of exactly 40
characters for `sha1` or 64 for `sha256`; and `migration_id` is lowercase canonical UUID v4
(`xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx`). `object_format` must equal
`git rev-parse --show-object-format`, and every OID is recomputed with the recorded
`git-hash-object-no-filters-v1` algorithm before it is accepted.

```yaml
schema_version: 1
migration_id: <uuid-v4>
state: <state-from-above>
created_at: <rfc3339-utc>
created_by_session_id: <opaque-id>
owner_session_id: <opaque-id-or-null>
completed_by_session_id: <opaque-id-or-null>
hash_algorithm: git-hash-object-no-filters-v1
object_format: <sha1-or-sha256>
intent:
  project: { project_id: <slug>, repo_dir: <dir> }
  catalog_entry: { base_branch: <branch>, branch_prefix: <prefix>, max_parallel: <int>, remote: <sanitized-url> }
  git: { cutover_base: <oid>, legacy_candidate: <oid>, merge_base: <oid> }
  decisions: { activity: <decision>, worktrees: <move-or-defer>, backup: <archive-or-retain>, point_of_no_return_accepted: <boolean> }
  source_snapshot: []
  worktree_mappings: []
diagnostics: []
resume_history: []
result: null
archive_status: <ARCHIVE_PENDING-or-ORIGINALS_RETAINED>
archive_owner_session_id: null
archived_to: null
archive_items: []
```

- `diagnostics[]`: exceptional failure/drift annotations only — UTC, session, item, classification,
  exit code, evidence, stderr redacted to at most 4096 bytes plus a truncation flag. Append-only via
  candidate/rename under lock.
- `result`: appears only at completion — `destination_snapshot`, effective mappings, D6
  transformations, `completed_at`, and any residual `deferred` items. Never changes `intent`.
- All timestamps are RFC 3339 UTC except the filesystem segment used in the backup dirname
  (`yyyyMMddTHHmmssZ`). No field ever holds credentials, unredacted commands, or full file contents.
  The completed marker keeps this schema — never compacted into free text.
- `point_of_no_return_accepted` records the preview decision; it is not hardcoded. It may remain
  `false` when all worktrees are deferred and no move is attempted. Immediately before the first
  `git worktree move`, it must be `true`; otherwise moving is forbidden and the migration either
  remains no-move/deferred or returns to preview for explicit confirmation. This is also a durable
  schema invariant: if `decisions.worktrees` is `move`, `point_of_no_return_accepted` must be exactly
  `true` before the intent candidate may publish. Validate it when rereading the candidate, again
  after publishing `migration-in-progress.md`, and again by rereading that marker immediately before
  the first move. A `move + false` marker is corrupt/blocking, never authorization to proceed.
- State invariants are exact: pre-completion states have `result: null`, non-null
  `owner_session_id`, null `completed_by_session_id`, null `archive_owner_session_id`, null
  `archived_to`, and only the initially approved `ARCHIVE_PENDING`/`ORIGINALS_RETAINED` archive
  status. `COMPLETED` has a complete non-null `result` with `destination_snapshot`, effective
  mappings, D6 transformations, `completed_at` and deferred items; null `owner_session_id`; non-null
  `completed_by_session_id`; and preserves the byte-equivalent immutable `intent`. An archive owner
  is non-null only while an archival transition is actively owned; `archived_to` is non-null only
  for `ARCHIVED`/`ARCHIVE_PARTIAL`; archive items and status must agree. Any violated invariant makes
  the marker corrupt and blocks mutation.

## Activity classification (D2)

| Evidence | Classification | Action |
|---|---|---|
| `catalog.lock`, `project.lock`, or a story claim with a valid owner | live writer/mutex | block, show owner |
| An incomplete lock/claim | unsafe state | block, require manual resolution — never steal by age |
| `migration-in-progress.md` owned by this session | resumable | resume per this contract |
| `migration-in-progress.md` owned by another session | takeover required | block until the explicit takeover above completes |
| Non-terminal story status with no claim (implementing/in review/Fase 6) | unverifiable activity | ask once; if the user continues, memory migrates but that worktree stays `deferred` — never assume liveness from a time threshold or from prose alone |
| `finalized`/approved, worktree dirty/ahead, no claim | pending harvest | inform only, never block — this is the normal terminal state of a successful story |
| Dirty only inside `local_files_to_copy` | environment noise | inform separately, never block |
| No claim, no relevant diff | inert | inform |

Board/event text is never itself a hard block — only a live claim, a held mutex, or another session's
marker is. Everything else is evidence to show and a single confirmation to ask for, recorded in the
marker (`intent.decisions.activity`) and, after publication, in a project decision.

## Git topology guard (D1)

For the inherited repo under `workspace/<repo_dir>`, resolve `git worktree list --porcelain`. For
every linked worktree: canonicalize its path, its `.git` file, the declared `gitdir`, and the
`git-common-dir`; require the primary worktree to be exactly `workspace/<repo_dir>` and every linked
worktree plus both administrative link targets to resolve inside this checkout's own
`workspace/worktrees/` and `workspace/<repo_dir>/.git/worktrees/`; verify the bidirectional
relationship (`.git` → admin dir, `<admin>/gitdir` → that same `.git`); reject any symlink/junction or
canonicalization that escapes those roots; cross-check the result against `git worktree list
--porcelain` itself.

If a single link escapes this checkout's own repo, this checkout shares Git state with another
installation — block unconditionally, before the preview and before any marker, showing both exact
paths. Never run `git worktree repair` with explicit paths to fix this: invoked that way, Git follows
the worktree's `.git` to whichever repo it currently points at and repairs *that* repo — if this
checkout is the copy, it silently rewrites the original installation's links instead of this one's.
The only safe fix is inspecting and rewriting both link files by hand outside this command, or
`git worktree repair` invoked with no path arguments from within the affected repo; either way it is
out of `/legion-upgrade`'s scope — report and stop.
