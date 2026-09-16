# Harness validation

Run from the Legion root with Node 22+ and Git:

```text
node --test --test-concurrency=1 tests/harness/runtime.test.mjs
```

No packages, network, Claude subscription or destination registration are needed. Tests create
disposable Git repositories/worktrees under the OS temporary directory, configure only those repos,
and check their physical temporary root before cleanup. Fixture-only commits build baseline/squash
scenarios; the real Legion repo and destination repositories are never staged or committed by tests.
On Windows the link test uses a junction, requiring no developer-mode symlink privilege.

`runtime.test.mjs` exercises actual filesystem, Git, commands and racing child processes. Coverage:

| Behavior | Assertions |
|---|---|
| Catalog/path compatibility | distribution YAML, duplicate mapping keys, unsupported syntax, Unicode/spaces, traversal/junction rejection |
| Claims/recovery | same-story idempotence, final-slot race, owner nonce, crashed mkdir, incomplete provisioning, preserved unexpected evidence |
| Scheduling | source invalidation, overlap, unintegrated code dependency, content-equivalent squash, plan refresh |
| Worktrees | existing reuse, occupied create, dirty removal; helpers do not perform lifecycle writes |
| Snapshots | immutable base, new/deleted/renamed/binary/external files, index-only changes, untracked mutation |
| Review | independent identity, mandatory check evidence, stale results/release, out-of-scope external files, wrong-worktree approval |
| Runner | success, nonzero, timeout, formatter mutation, external docs mutation |
| Coordination | event retries/collisions, checkpoint/publication compare-and-replace, per-project module limits across processes |
| Context | changed sources produce a new derived index, never ownership |
| Integration | originals/indexes preserved, incompatible new-file conflict, two individually green stories fail combined behavior, stale input/mutating check |

Git/OS behavior is tested rather than emulated. The CI matrix targets Windows/Ubuntu with Node 22/24;
see the [report](../../.orchestrator/benchmarks/README.md) for environments actually executed.
Do not equate a matrix definition with a successful CI run. No power-loss/distributed-lock guarantee.

## Claude Code decision corpus

`fixtures/decisions.json` fixes seven synthetic decisions and expected outcomes. The evaluator loads
baseline instructions from the pinned Git commit and candidate instructions from disk, supplies the
same cases, disables tools/hooks/MCP/skills, and records available usage, model identity and latency.
No raw credentials, source-repo data or logs are written into the report. Harness instructions are
sent to Claude's service; this requires network/account authorization and can incur model charges.

Evaluation protocol v2 uses fixture v2 with a shared action vocabulary, included identically in both
variants. REJECT is a quality-review verdict; WAIT defers an operation pending prerequisites,
capacity or authorization, including manual reconciliation. REVALIDATE concerns stale evidence;
REUSE concerns a verified existing worktree; APPROVE accepts the reviewed delivery. The seven cases
and expected answers are unchanged, and expected answers are never sent to the model. Reports record
the protocol version and vocabulary hash. Preserve earlier results as originally scored; compare
both variants again under the new protocol rather than rescoring or mixing old/new runs.

After authorization, use a pinned model ID when available:

```text
node tools/harness/evaluate.mjs <absolute-claude-executable> <report.json> <model-id>
```

Default baseline: `41db2f479389d5dd7aeec5170d6e2ac388abc456`. Default model alias: sonnet.
Each call is bounded by 45 seconds / USD 0.50. One unavailable baseline stops before candidate.
This smoke uses one call per variant, not seven independent model trials. It cannot establish p50/p95,
non-degradation statistically, story completion speed or real orchestration token savings. Provider
cache is not controlled; user-level Claude instructions may still apply despite the isolated cwd.
Never turn null usage or timeout into zero tokens, zero cost, or a failed reasoning decision.

## End-to-end pilot protocol

Before claiming a speed/token gain, execute baseline and candidate in separate disposable checkouts
of the same destination fixture with identical model, account settings, tools, machine, initial files,
acceptance and check commands. Preserve candidate/baseline source revisions and actual model IDs.
Use at least five repetitions per scenario, alternating variant order; report per-case quality,
median, tails with sample size, variance, human wait, check count, calls and available input/output/
cache tokens. Separate cold/warm runs. Test only one optimization at a time when attributing savings.

The following larger scenarios remain a pilot, not completed tests in this release:

| Scenario | Acceptance / reference inputs | Verification |
|---|---|---|
| Small story | bounded pure function, compact design | real destination unit/lint checks |
| Regression | failing edge case, defect prescribed by design | independent reproduction and rejection, then regression pass |
| Frontend | keyboard/focus/error states on a fixed UI fixture | declared browser runner and visual/interaction acceptance |
| Data migration | schema/backfill plus external rollback script | disposable database migrate/rollback checks, no live data |
| External docs | accurate API/auth examples from fixed repo | content review and configured link/lint command |
| Dependencies/overlap | approved unintegrated code, shared output path | consumer waits without claim, no duplicate implementation |
| Resumption | interruption before/after transition and legacy evidence | no lost work, no fabricated approval, preserved accepted risks |

Choose actual frontend/database fixtures and their installed tools explicitly before running these
cases; this repository has no registered destination or such application stack. Do not invent a
project or install a stack just to claim representative measurements. Keep unknown values unknown.
