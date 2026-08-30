---
name: run-module
description: Invokes a type generator module on demand — not story-scoped, runs outside the /legion cycle entirely. Reads the base repo (or a specific story's worktree) and produces a standalone artifact in modules/output/. Use /new-module first to install the module.
---
## Mandatory project scope

Resolve or confirm the project through `.orchestrator/projects.yml` before reading project state.
The selected catalog entry is the sole configuration authority. Use only
`requirements/<project>.md`, `.orchestrator/projects/<project>/...`, `workspace/<repo_dir>` and
namespaced worktrees. A missing or empty catalog is never assumed new or old — apply exclusively
`CLAUDE.md`'s project-resolver table under "Required bootstrap for an older installation" (empty
and missing resolve differently) and never permit old singleton paths.

For a project-shared write, acquire the brief project mutex, reread current state, write and validate
a sibling candidate, rename it to the known destination, reread, then release the owned mutex.
Do not hold a mutex while interviewing, researching, testing, reviewing or waiting. Catalog and global `modules/registry.md` writes instead use the brief global metadata mutex. Never acquire or release a story claim unless this skill
is `/legion` performing a reservation.


Run a `type: generator` module (see `modules/README.md`) — a module that doesn't validate or
accompany any particular story, it reads code and produces a stable artifact (e.g. a generated
API collection). Never offered inside `## Modules` on a story (that list is `type: gate` only,
see `new-story/SKILL.md`) — this is the only way a `generator` ever runs.

**Arguments**: `/run-module <name> [worktree:<Story-ID>]`.

## Step 1 — Resolve the target

- **No `worktree:` argument** (`scope: base-repo`, the default): target is `workspace/<repo_dir>`
  on its base branch, read-only over the code.
- **`worktree:<Story-ID>`**: target is that story's worktree instead. Before launching, check
  `.orchestrator/projects/<project>/assignments.md` — only proceed if the story's status has no active agent
  (`finalized`/`queued`/`aborted`); if it's `in progress`/`in review`/`fixing`, reject and say
  why (a module and a story agent must never be active on the same worktree at once — same
  isolation rule already applied to `## Subtasks`).

## Step 2 — Version/contract check

Same source-hash check described in `legion/SKILL.md`, "Module stages" — this is
one mechanism triggered by "about to launch this module's code", regardless of the entry point:
recompute the source content hash (`module.md` + `agent_entrypoint` + `provides_rules` +
`provides_skills`, re-resolved fresh from `source` in `modules/installed/<name>/.legion-source.md`)
and compare it to the recorded `source_hash`. If it differs, `AskUserQuestion` to update (never
automatic) and re-run `/new-module`'s risk-preview flow if `tools`/`output`/`type` changed. If the
module is `deprecated` in `modules/registry.md`, reject with that reason instead of running it.

## Step 3 — Launch

- `max_concurrent` does **not** apply here — it's scoped to `type: gate` only. `/run-module` is a
  manual, synchronous invocation; concurrency between two manual invocations of the same module
  is outside this system's scope (same as nobody prevents running `/investigate` twice at once).
- Resolve `output` to `modules/output/<module-name>/<project>/` — the base-repo namespace
  is added automatically by the orchestrator, the module doesn't need to know the project it's
  running against.
- Prompt, depending on the target from Step 1:
  - **No `worktree:`**: `BASE_REPO` (path to `workspace/<repo_dir>`) + `OUTPUT`. Rule: "do not
    modify anything inside `BASE_REPO`; write artifacts to `OUTPUT` and your own execution report
    to `modules/reports/<module-name>/<project>/<timestamp>.md` — those are the only two write zones."
  - **`worktree:<Story-ID>`**: `WORKTREE` (that story's, no `STORY`/`BRANCH`/`EVENTS` — it isn't
    part of that story's cycle) + `OUTPUT`. Rule: "read from the worktree, never modify it; write
    artifacts to `OUTPUT` and your own execution report to
    `modules/reports/<module-name>/<project>/<timestamp>.md` — those are the only two write zones."
  - Neither mode gets the module's internal `CLAUDE.md` read or passed — same as `gate` modules.
- **Isolation check, `scope: base-repo` only**: `git -C workspace/<repo_dir> status --porcelain`
  before and after the run. Anything new that isn't exactly what `output` declares (which lives
  outside the base repo anyway) is an **incident** — same severity as a worktree isolation
  violation (`legion/SKILL.md`, "Module stages"): protect legitimate work, revert only the exact
  unexplained paths and inform the user.

## Step 4 — Report

**The module writes its own report** — it has the real execution detail (what it detected, what
it produced, why), Legion doesn't re-derive that from outside. Path:
`modules/reports/<module-name>/<project>/<timestamp>.md` — no `Story-ID`, no round number (a `generator`
never produces a verdict to reject). Minimum content the module's own instructions must cover:
status (`OK`/`FAILED`), timestamp, what it ran against (`base-repo` or `worktree:<Story-ID>`),
error detail if it failed. If it ran with `worktree:<Story-ID>`, that's metadata *inside* the
file, never part of the filename — keeping the two report shapes (`gate`'s `<Story-ID>-Rn.md` vs.
`generator`'s `<timestamp>.md`) unambiguous. **`/run-module` itself never writes a second,
competing report file** — if the module's completion message doesn't point at a real file under
that path, that's a finding to surface to the user (the module isn't honoring its own contract),
not something to paper over by writing one yourself.

Read whatever report the module wrote, then acquire the project mutex and safely update
`.orchestrator/projects/<project>/metrics.md` through reread + validated sibling candidate + exact
rename + destination reread. Append one row to "Standalone module runs" (module, timestamp,
duration, tokens from the Agent return), then release the verified mutex.

## Rules

- Never offer `type: generator` modules in `/new-story`'s `## Modules` list.
- Never apply `max_concurrent`, `max_rejection_rounds`, or `blocking` — none of those fields
  apply to this type (see `modules/README.md`).
- Never write inside `workspace/<repo_dir>` or the target worktree — only `output` and, for the
  module's own execution report, `modules/reports/<module-name>/<project>/`.
