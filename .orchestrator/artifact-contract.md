# Artifact evidence v1

The orchestrator pins PROJECT, STORY, BRANCH, BASE_SHA and absolute WORKTREE. BASE_BRANCH
is descriptive only. Every story has a confirmed design and an execution plan at
`projects/<project>/plans/<Story-ID>.json` (paths in this document are relative to `.orchestrator/`).
Plans are derived execution evidence, not another project configuration. Catalog v1 stays authoritative.

Before reservation, the plan identifies `version: 1`, `project`, `story`, `base_sha`,
`requirements_sha256`, `sources: [{path, sha256}]`, `resources`, `dependencies`, and `checks`.
Source paths are root-relative evidence used during analysis. At least one source is required.
Resources are conservative conflict keys: `repo` for unknown/full scope, `repo/src/path`,
`docs/<project>/file.md`, or `scripts/<project>/file`. Parent/child paths conflict. Include
external output paths before reservation. When scope grows, stop writing and have the owner
reconcile the plan and claim under the project mutex; never continue outside reserved resources.

## Dependency readiness

`Depends on` remains a list of story IDs. The execution plan classifies every dependency:
`{story, kind: "order"}` requires a verified approval; `{story, kind: "code", paths: [...]}`
also requires those approved changes in the pinned base. Omitted paths mean all changed repo files.
Explain this classification in the design; no silent reinterpretation of ambiguous requirements.
An approved but unintegrated code dependency yields WAITING_INTEGRATION, with no new claim.
Do not copy its uncommitted changes, fabricate replacements, merge or commit on behalf of the user.
The helper compares approved content and Git modes in the selected base, so a squash can qualify
without branch ancestry. Content transformations (including line-ending normalization) require
explicit inspection if exact evidence differs; never convert a failed match into automatic approval.

## Baseline and candidate

Use `snapshot` once after design approval and before writing, then with `baseline` pointing to
that immutable record after implementation/QA. Inputs: `root`, `project`, `story`, `worktree`,
`branch`, full `base_sha`, `story_file`, `design_file`, `external: [root-relative files]`.
The baseline requires a clean worktree. Snapshot context and external path sets must stay identical;
a deliberate redesign requires a newly reviewed baseline/recovery decision, not an overwritten record.

The helper inventories all tracked and nonignored untracked regular files, deletion by absence,
Git index state, executable modes, external files (including initially absent outputs), story and
design hashes. Renames are represented as before/after paths; binaries are hashed byte-for-byte.
Gitignored configuration is not silently included. Sensitive-looking files require an exact
`sensitive` path list authorized by the user. Symlinks, gitlinks/submodules, unmerged indexes and
unrecognized entries stop automated snapshots with a diagnostic; use explicit reviewed handling.

Snapshots live at `projects/<project>/artifacts/<story>/<sha256>.json`; content-addressed bytes
live under `runtime/objects/`. These are evidence/storage, not coordination locks. They are not
sent wholesale to agents: pass the snapshot ID/path and relevant diff paths. Never edit a snapshot.
Protect this local evidence like the source repo; it may contain proprietary source. Do not publish
object contents, raw logs, or sensitive input files in summaries or benchmark reports.

## Review and finalization

The reviewer may READ all inventoried external artifacts, their baseline bytes and relevant source
code, in addition to the worktree. This is a bounded read exception, not permission to edit another
story. A docs-only story with an empty repo diff still needs content and link review of its outputs.
Docs linters run through the reviewer/verification runner; docs writers have no Bash and do not
claim to have executed them. Writers prepare external edits under the exact owner-assigned
`DOCS_DEST/.staging/<session>/<story>/` or `SCRIPTS_DEST/.staging/<session>/<story>/` subtree,
within their existing write zone. They return a draft-to-final path mapping. Only final paths are
deliverables in the baseline/candidate and reserved resources. The owner copies completed draft
bytes to its runtime session staging and calls publish with the expected final-path hash. These
drafts are never read as accepted output. Never hold a mutex while drafting.

Write the human review plus a sibling JSON receipt with `version: 1`, `verdict`, `snapshot_id`,
`reviewer_session`, `verification: [result paths]`, and (only if the repo has no applicable checks)
an evidence-based `no_checks_reason`. The reviewer identity must differ from the owning session.
The owner's `approve` validates current artifacts, scope, required checks and claim before publishing
`approvals/<story>.json`. Then `release` with reason `approved` verifies that receipt again.
Abandonment uses reason `abandoned-preserved`; it releases capacity and leaves every file intact.

Neither a legacy FINALIZED event nor a green test log is an approval. If prior baseline/approval
evidence is unavailable, preserve work and revalidate explicitly; never invent historical hashes.
A user commit/harvest or any index/source/design change can make evidence stale. Revalidate the
actual delivered content before reporting an approval as current. A reviewer receipt records a
decision; runtime helpers are not a security boundary against a malicious process forging records.
