# Time and consumption metrics (historical — never resets)

Derived record, read-only for the user — same criterion as `reputation.md`: **the orchestrator
never consults it to decide anything**, there is no automatic behavior based on this. It exists
so you can detect bottlenecks (which phase or agent type takes longest) and have visibility into
cost (tokens consumed) per story and per full orchestration run.

Recalculated automatically (never by hand), at the close of each orchestration run (Phase 5), from
three sources the system already generates — no new instrumentation required:
- The `HH:MM` timestamps already recorded in `events/<Story-ID>.md` (`START` → `FINALIZED`, and
  every event in between) — that's where real duration and where the time went come from.
- The `subagent_tokens`, `tool_uses`, and `duration_ms` fields the `Agent` tool returns when each
  subagent completes (implementer, reviewer, QA, research) — that's where consumption comes from.
- The `model` the Orchestrator itself passed on that `Agent` call (or "inherited" if it left the
  model override unset) — that's where the per-story model comes from.

It is permanent memory (never resets between runs), same criterion as `reputation.md` and
`components.md`.

## Per orchestration run (last 20)

| Date | Stories | Total duration | Total tokens | Slowest batch |
|---|---|---|---|---|
| *(no data yet)* | | | | |

## Per story (last 20)

| Story | Agent | Model | Total duration | Time at gate (waiting on approval) | Review rounds | Tokens (implementation) | Tokens (review) |
|---|---|---|---|---|---|---|---|
| *(no data yet)* | | | | | | | |

## Per agent type (average, last 20 stories)

| Agent | Average duration | Average tokens | Stories processed |
|---|---|---|---|
| *(no data yet)* | | | |

## Bottlenecks detected (last orchestration run)

*(no data yet)*

## Standalone module runs

Invocations of `/run-module` (see `modules/README.md`) — these never belong to a story, batch,
or orchestration run, so they don't fit the tables above. Updated by `/run-module` itself right
after each invocation, from the same `Agent`-tool return values the tables above already use.

| Module | Timestamp | Ran against | Duration | Tokens |
|---|---|---|---|---|
| *(no data yet)* | | | | |
