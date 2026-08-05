# Orchestrator ↔ Agents communication channel

This folder is the multi-agent system's event bus. **Do not edit by hand during a run** — the sole exception: annotating adjustments/comments in the `designs/` files while reviewing a dry-run.

## Contents

- `config.md` — parameters specific to the destination project (base repo, stack, build/test commands, migration tooling and its ordering rule, `MAX_PARALLEL`, local files to copy to each worktree). The only file with knowledge of the concrete stack; everything else in `.claude/` is agnostic. Filled in the first time the system runs on a project (investigation + questions to the user) and reused afterward.
- `capabilities.md` — registry of the available implementing agent types (`worktree-agent` generalist + specialists `-frontend`/`-security`/`-data`/`-docs`, plus `worktree-agent-qa` and `research-agent`) with their domain, when each one activates, and their tools. The Orchestrator consults it in Phase 2 of `/legion` to resolve which `subagent_type` to launch for each story — never assumes it's always the same one.
- `assignments.md` — the **board** for the run. Written and updated by the Orchestrator on
  EVERY notification; it's also the starting point for resuming if the session gets cut off. Format:

  ```md
  | Story | Worktree | Branch | Batch | Status | Last activity | Review round |
  ```

  Statuses: `queued` / designing / designed (dry-run) / approved / in progress / in review / fixing /
  migrating / finalized / aborted.
  Below the table: the pre-analysis's **overlap matrix** (story × impact zone:
  modules/services, entities/tables, endpoints, migrations), the **batch plan** (conflict
  graph + directed edges from `## Depends on` and grouping up to `MAX_PARALLEL`), the current
  coordination points, and the migration identifiers assigned at the gate (if the project
  uses a migration tool; the counter is global and crosses batches).
- `components.md` — registry of shared components (utilities, services, helpers, factories, strategies, orchestrators, etc.) with status `pre-existing` / `planned` / `implemented` and `Reference` to the canonical implementation. **Written only by the Orchestrator**; agents consult it mandatorily during design and before creating any reusable component. It's the **architectural memory that crosses batches**: a later batch designs against what previous ones already approved.
- `events/<Story-ID>.md` — append-only log for each agent. Format per line:

  ```
  | HH:MM | TYPE | relative/path/to/worktree | brief description |
  ```

  Types: `START`, `DESIGN_PROPOSED`, `DESIGN_APPROVED`, `RESUMED`,
  `FILE_CREATED`, `FILE_MODIFIED`, `FILE_DELETED`, `FILE_MOVED`, `REFACTOR`,
  `ARCHITECTURE`, `MIGRATION`, `SIGNAL_ISSUED`, `ANNOUNCEMENT_PUBLISHED`, `FINALIZED`.

- `designs/<Story-ID>.md` — the unified design for each story, persisted by the Orchestrator
  when closing its batch's gate. Statuses: `PENDING APPROVAL` (dry-run, waiting on the user) /
  `APPROVED` / `APPROVED WITH ADJUSTMENTS` / `DISCARDED`. It's the dry-run review material
  (the user can annotate it directly), the reference the adversarial reviewer receives, the source
  of the design during a resumption, and the **architectural memory** consulted by subsequent batches.
  Kept as history across runs.
- `reviews/<Story-ID>-R<n>.md` — adversarial reviewer (`worktree-reviewer`) report per round:
  APPROVED/REJECTED verdict, re-run mechanical verification (lint/format, diff
  tests), manual architecture audit, and findings with severity (BLOCKING/MAJOR/MINOR). Written by
  the reviewer; the orchestrator triages the findings and orders the corrections.
- `decisions/DEC-NNN.md` — the Orchestrator's architectural decisions when two stories
  solve the same problem in different ways (from the same batch or different batches). Structure:
  context, alternatives compared, criteria (reuse, maintainability, simplicity, alignment with the
  architecture), decision, and orders issued to the agents.
- `signals/<ID>.md` — priority alerts that **any implementing agent** (generalist or specialist,
  see `capabilities.md`) or `worktree-reviewer` can write directly, without going through the Orchestrator first, to warn about something other active stories
  should take into account right now (security, quality, external blocker). Format:

  ```md
  # Signal <ID>
  **Type**: SECURITY | QUALITY | EXTERNAL_BLOCKER
  **Issued by**: <worktree-agent|worktree-reviewer> (Story <ID>)
  **Scope**: <what makes it relevant to other stories>
  **Severity**: HIGH | MEDIUM | LOW
  **Expires in**: <N batches without reinforcement>
  **Issued**: <date/time>
  ## Detail
  ## Expected action from whoever receives it
  ```

  Every agent consults it (filtering by `Scope`) at the start of its Stage A and again before
  `FINALIZED`. If no one reinforces it (no one reports the same problem) within its deadline, the
  Orchestrator archives it as `EXPIRED` in the next monitoring cycle — it doesn't stay active
  forever nor does it need to be deleted by hand.
- `announcements/<ID>.md` — reusable knowledge an agent discovers and shares on the fly,
  **before** a batch's gate formally consolidates it. Format:

  ```md
  # Announcement <ID>
  **Published by**: worktree-agent (Story <ID>)
  **Relevance tags**: <e.g. "authentication", "payments-http-client">
  **Description**: <what was discovered>
  ## Why it might interest another story
  ## Status
  NEW | CONSOLIDATED_INTO_COMPONENTS | DISCARDED
  ```

  Any agent from another active story with matching tags can take advantage of it right away, without
  waiting for the next gate. When 2+ stories validate it as useful, the Orchestrator promotes it to
  `components.md` (`planned`) and marks the Announcement `CONSOLIDATED_INTO_COMPONENTS`.

  **Note on Signals and Announcements**: they are the only exception to "only the Orchestrator writes in `.orchestrator/`" outside of `events/` and `reviews/` — any agent can write them directly, because they are information deposited into the shared environment, not an order or direct coordination between worktrees. The Orchestrator is still the one who decides what to do with each one (archiving an expired Signal, promoting an Announcement to `components.md`, or adjusting the batch plan if a HIGH severity Signal warrants it).
- `lessons-learned.md` — incidents (in production or any other environment) caused by a business rule not accounted for during implementation. Added with `/new-lesson`. It is permanent memory by **Zone** of the code (never resets): `research-agent` in prior-research mode, and the reinforced analysis of `/new-story`, consult it filtering by Zone before designing any new story on that same part of the code — so the same kind of surprise doesn't repeat twice in the same place.
- `objectives/OBJ-<NNN>.md` — the breakdown of a high-level objective into several stories, persisted by `/new-objective` (or by Phase -2 of `/legion`) as soon as the user confirms the split — even before specifying each story's detail. Format:

  ```md
  # Objective OBJ-<NNN>
  **Original description**: <...>
  **Date**: <filled in automatically>
  ## Proposed breakdown
  | # | Resulting story | Domain | Description | Depends on |
  ## User adjustments at confirmation
  ## Discarded split alternatives
  ```

  Permanent memory (never resets, same criterion as `decisions/`): `/new-objective` consults this folder first, filtering by related zone, before proposing a new split — so as not to rethink a similar objective from scratch and to maintain consistency with previous splits in the same area.
- `reputation.md` — **read-only audit for the user**, by agent/domain: stories from the last 20, first-round approval rate, post-closure findings (from `lessons-learned.md`), and post-closure corrections (from Phase 6). **The Orchestrator never consults it to decide anything** — there is no "lightweight gate" of any kind in this system; the file exists solely so the user can detect which agent/domain needs adjustment (prompt, patterns guide, a new specialist). Format:

  ```md
  | Agent | Domain | Story (last 20) | Approved on 1st round | Post-closure findings | Post-closure corrections (Phase 6) |
  ## Post-closure findings detail
  | Story | Agent | Related lesson | Zone |
  ## Post-closure corrections detail (Phase 6)
  | Story | Agent | What was requested | Resulting round |
  ```

  Recalculated at the Closure of each orchestration run, when `/new-lesson` records a finding with an identifiable story, and when Phase 6 adds a correction round. Permanent memory, never resets.

## Worktree infrastructure (doesn't live in `.orchestrator/`, but the board references it)

Worktrees live in `workspace/worktrees/<Story-ID>/`, created and removed exclusively by the
Orchestrator (`git worktree add/remove` on the base repo). The board (`assignments.md`) is the
source of truth for which story corresponds to which worktree; whenever in doubt, `git -C
workspace/<base-repo> worktree list` gives the real state (git is the source of truth).

## Lifecycle

When starting a **new** orchestration run, the Orchestrator resets `assignments.md` and the
`events/*.md` of the assigned stories. `config.md`, `capabilities.md`, `decisions/`, `reviews/`,
`components.md`, `lessons-learned.md`, `objectives/`, and `reputation.md` are kept as
history/configuration across runs. `signals/` and `announcements/` follow the same criterion as
`components.md`: the ones that ended up `EXPIRED` / `CONSOLIDATED_INTO_COMPONENTS` / `DISCARDED` are
kept as history; only the ones that corresponded to stories from the run being explicitly restarted
are cleaned up.

**Resumption**: if `assignments.md` has stories with a status other than `finalized`/`aborted`, there is
an interrupted run — the Orchestrator does NOT reset anything: it reconstructs the context from
the events, the `designs/`, and the real state of `git worktree list`, and relaunches only the
incomplete agents in `RESUMED` mode (they continue on their existing worktree, never recreated).

**Closure**: once the queue is empty with all stories `finalized` and `APPROVED`, the Orchestrator runs a
**read-only trial-merge** (`git merge-tree`) to verify the branches merge cleanly with each other
and against the base branch, recalculates `reputation.md`, and reports the final summary. Worktrees are **not
removed** upon closure: the uncommitted work lives only there until the user harvests it.

**Phase 6 (post-closure)**: after the final summary, the Orchestrator asks whether the user wants to request
a change on any already-`finalized` story. If so, it reconnects directly to the existing worktree/agent
(without repeating configuration/validation/pre-analysis/gate), runs a new review round,
and upon approval updates `reputation.md` (1st-round rate + post-closure corrections table). Only after
finishing all requests is the trial-merge run again and the run definitively closed.
