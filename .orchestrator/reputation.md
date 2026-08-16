# Reputation by agent type / domain (read-only — audit)

Derived record, read-only for the user. **Does not change the behavior of the design gate
or any other orchestrator step** — the orchestrator does not consult this file to make
decisions. It exists so the user can see which agent/domain needs adjustment
(agent prompt, patterns guide, a new specialist, a missing lesson), instead of
having to manually read `reviews/` and `decisions/` for many stories.

Recalculated automatically (never by hand):
- In Phase 5 (Closure) of each orchestration run, with that run's results.
- Every time `/new-lesson` adds a lesson with an identifiable `story or branch that caused it`.
- Every time Phase 6 (Post-closure correction) adds a review round on a story already
  `finalized`.

It is permanent memory (never resets between runs), same criterion as `components.md`.

## Registry

| Agent | Domain | Story (last 20) | Approved on 1st round | Module gate rounds | Reviewer rounds | Post-closure findings | Post-closure corrections (Phase 6) |
|---|---|---|---|---|---|---|---|
| *(no data yet)* | | | | | | | |

`Module gate rounds`/`Reviewer rounds` (see `modules/README.md`) are separate columns on purpose — a story only counts as "approved on 1st round" if `Module gate rounds` is 0 **and** the reviewer's own first report already said `APPROVED`. A story that needed 2 module rounds before the reviewer ever saw it isn't "clean" just because the reviewer's R1 was clean. `type: generator` modules never get a row here — there's no approval verdict to measure on something that never rejects anything (see `metrics.md`'s "Standalone module runs" instead).

## Post-closure findings detail

| Story | Agent | Related lesson | Zone |
|---|---|---|---|
| *(none yet)* | | | |

## Post-closure corrections detail (Phase 6)

| Story | Agent | What was requested | Resulting round |
|---|---|---|---|
| *(none yet)* | | | |
