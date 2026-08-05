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

| Agent | Domain | Story (last 20) | Approved on 1st round | Post-closure findings | Post-closure corrections (Phase 6) |
|---|---|---|---|---|---|
| *(no data yet)* | | | | | |

## Post-closure findings detail

| Story | Agent | Related lesson | Zone |
|---|---|---|---|
| *(none yet)* | | | |

## Post-closure corrections detail (Phase 6)

| Story | Agent | What was requested | Resulting round |
|---|---|---|---|
| *(none yet)* | | | |
