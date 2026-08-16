---
name: run-module
description: Invokes a type generator module on demand — not story-scoped, runs outside the /legion cycle entirely. Reads the base repo (or a specific story's worktree) and produces a standalone artifact in modules/output/. Use /new-module first to install the module.
---

Run a `type: generator` module (see `modules/README.md`) — a module that doesn't validate or
accompany any particular story, it reads code and produces a stable artifact (e.g. a generated
API collection). Never offered inside `## Modules` on a story (that list is `type: gate` only,
see `new-story/SKILL.md`) — this is the only way a `generator` ever runs.

**Arguments**: `/run-module <name> [worktree:<Story-ID>]`.

## Step 1 — Resolve the target

- **No `worktree:` argument** (`scope: base-repo`, the default): target is `workspace/<base-repo>`
  on its base branch, read-only over the code.
- **`worktree:<Story-ID>`**: target is that story's worktree instead. Before launching, check
  `.orchestrator/assignments.md` — only proceed if the story's status has no active agent
  (`finalized`/`queued`/`aborted`); if it's `in progress`/`in review`/`fixing`, reject and say
  why (a module and a story agent must never be active on the same worktree at once — same
  isolation rule already applied to `## Subtasks`).

## Step 2 — Version/contract check

Same shared check `legion/SKILL.md` runs before a `gate` module launch (step 22bis) — this is
one mechanism triggered by "about to launch this module's code", regardless of the entry point:
`git fetch` read-only on `modules/installed/<name>/`, `AskUserQuestion` to `git pull --ff-only`
if behind, re-run `/new-module`'s risk-preview flow if `tools`/`output`/`type` changed. If the
module is `deprecated` in `modules/registry.md`, reject with that reason instead of running it.

## Step 3 — Launch

- `max_concurrent` does **not** apply here — it's scoped to `type: gate` only. `/run-module` is a
  manual, synchronous invocation; concurrency between two manual invocations of the same module
  is outside this system's scope (same as nobody prevents running `/investigate` twice at once).
- Resolve `output` to `modules/output/<module-name>/<base-repo-name>/` — the base-repo namespace
  is added automatically by the orchestrator, the module doesn't need to know the project it's
  running against.
- Prompt, depending on the target from Step 1:
  - **No `worktree:`**: `BASE_REPO` (path to `workspace/<base-repo>`) + `OUTPUT`. Rule: "do not
    modify anything inside `BASE_REPO`, only write to `OUTPUT`."
  - **`worktree:<Story-ID>`**: `WORKTREE` (that story's, no `STORY`/`BRANCH`/`EVENTS` — it isn't
    part of that story's cycle) + `OUTPUT`. Rule: "read from the worktree, write only to
    `OUTPUT`, never modify the worktree."
  - Neither mode gets the module's internal `CLAUDE.md` read or passed — same as `gate` modules.
- **Isolation check, `scope: base-repo` only**: `git -C workspace/<base-repo> status --porcelain`
  before and after the run. Anything new that isn't exactly what `output` declares (which lives
  outside the base repo anyway) is an **incident** — same severity as a worktree isolation
  violation (step 22bis in `legion/SKILL.md`): revert it (`git checkout --`/targeted `clean`,
  careful not to touch anything legitimate) and inform the user.

## Step 4 — Report

Write `modules/reports/<module-name>/<timestamp>.md` — no `Story-ID`, no round number (a
`generator` never produces a verdict to reject). Minimum content: status (`OK`/`FAILED`),
timestamp, what it ran against (`base-repo` or `worktree:<Story-ID>`), error detail if it failed.
If it ran with `worktree:<Story-ID>`, that's metadata *inside* the file, never part of the
filename — keeping the two report shapes (`gate`'s `<Story-ID>-Rn.md` vs. `generator`'s
`<timestamp>.md`) unambiguous.

Also append one row to `metrics.md`'s "Standalone module runs" section (module, timestamp,
duration, tokens — from the same `Agent`-tool return values `/legion` already uses) — this data
doesn't belong to any story/batch/run, so it gets its own section instead of being forced into
those tables.

## Rules

- Never offer `type: generator` modules in `/new-story`'s `## Modules` list.
- Never apply `max_concurrent`, `max_rejection_rounds`, or `blocking` — none of those fields
  apply to this type (see `modules/README.md`).
- Never write inside `workspace/<base-repo>` or the target worktree — only `output`.
