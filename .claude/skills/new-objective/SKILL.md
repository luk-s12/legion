---
name: new-objective
description: Assistant for splitting a high-level objective (not yet shaped into User Stories) into several concrete User Stories. Researches the base repo, proposes a split with evidence, confirms it with the user, persists the decision in .orchestrator/objectives/, and specifies each resulting User Story with the same depth as /new-story - one at a time, saving them into requirements-to-work.md as soon as each one is confirmed.
---

Guide the user from a business intent ("I want X") to a set of well-specified User Stories in `requirements-to-work.md`, ready for `/legion`. It's the same spirit as `/new-story` (detect gaps before an agent discovers them mid-implementation), one level higher up: here the gap to detect is "how many User Stories are needed, and where's the boundary between them?".

**It does not implement code or run `/legion`** — its work ends as soon as the User Stories are written.

## Step 1 — Receive the objective

Take the objective's description as the user gives it (free text, no format needed). If it's concrete enough that it's really already a single story (not an objective that needs splitting), tell them so and suggest `/new-story` directly instead of this command.

## Step 2 — Check previous decompositions

Before researching from scratch, check `.orchestrator/objectives/` (if it exists) for any zone related to this objective. If there's something, use it as a starting point — don't repeat an analysis that's already been done, and stay consistent with previous splits in the same area unless there's a concrete reason to change it (if there is, state it explicitly in the Step 4 proposal).

## Step 3 — Research the base repo

Use the base repo (the single subdirectory with `.git` inside `workspace/`, aside from `worktrees/`) as reference. Exploratory research, broader than for a single story: what modules/flows currently exist related to the objective, what it already partially solves, where the concrete opportunities are. Read real code — don't generate generic candidates without evidence.

## Step 4 — Propose the decomposition

Apply these splitting criteria, in order:

1. **Delivery independence**: each candidate has to be closeable and have value on its own, with its own verifiable acceptance criteria.
2. **Minimize cross dependencies, favoring parallelism**: the system is optimized to run User Stories in parallel batches — prefer splits that take advantage of that. **Important**: two candidates touching the same code (overlap) is NOT a reason to merge them into a single story with `## Subtasks` — that only makes `/legion` serialize them into different batches, they remain separate User Stories. `## Subtasks` is only for when one part needs to block the other with its own approval criterion (a gate), not for sharing files.
3. **Alignment with `.orchestrator/capabilities.md`**: each candidate should be able to infer a reasonably clear domain (even if it ends up going to the generalist agent). If one mixes so many domains it can't even be estimated, it's badly split — too broad.
4. **Reasonable size**: neither an entire objective as one giant story (loses parallelism) nor User Stories so small that coordinating them costs more than the work itself. More than ~8-10 candidates is a sign of over-decomposition — consider grouping.
5. **Business-order dependencies**: if a candidate doesn't make sense before another exists (even if they don't share code), that's a real dependency — it's declared with `## Depends on` in the final story, it doesn't change the split itself.

Present the proposal with concrete evidence per candidate (file/line/real behavior found), in a report like:

```
I propose splitting it into N User Stories:

1. [domain] <title>
   <why, citing the real code>

2. [domain] <title>
   <why>
   Depends on: 1 (if applicable)

Does this split make sense? I can merge, split further, remove one, or add something I missed.
```

## Step 5 — Confirm the split

`AskUserQuestion` with options: **Confirm as is** / **Adjust** (the user states what to change, in free text) / **Rethink** (if the user gives business context the code couldn't show, go back to Step 4 with that incorporated).

With the split confirmed, persist it **immediately** — before specifying any story in detail — in `.orchestrator/objectives/OBJ-<NNN>.md` (next available number):

```md
# Objective OBJ-<NNN>

**Original description**: <what the user wrote>
**Date**: <current system date — never asked>

## Proposed decomposition
| # | Resulting story | Domain | Description | Depends on |
|---|---|---|---|---|
| 1 | <filled in when assigned an ID in Step 6> | ... | ... | ... |

## User adjustments during confirmation
<what changed relative to the initial proposal, or "none">

## Discarded split alternatives
<if merging/splitting differently was considered and discarded, why — or "none">
```

## Step 6 — Specify each story (one by one, same process as `/new-story`)

For each confirmed candidate, in whatever order makes the most sense (if there's `## Depends on`, the one that depends on nothing goes first):

1. **Analyze that candidate's specific zone** against the real code — same level of detail as `/new-story`'s Step 2: map the impact zone, cross-check claims against what exists, look for typical gaps (edge cases, states, permissions, idempotency, integrations, response and errors).
2. **Ask about what doesn't add up**, iteratively, with `AskUserQuestion` — same criterion as `/new-story`'s Step 3: cite code evidence, flag possible bugs, batches of up to 4 questions.
3. **Draft the story's final block** (same format `/new-story` produces):

```md
# Story <ID>

<Refined description>

## Acceptance criteria
- ...

## Definitions taken
- ...

## Estimated impact zone
- ...

## Depends on
- <ID of another story from this same objective, if applicable — or delete this section>

## Subtasks (optional)
- <if this particular candidate warrants it — rare, already resolved in Step 4>
```

4. **Show it and confirm** with the user.
5. **Save immediately** to `requirements-to-work.md` (append it at the end preceded by `---`, or replace the first "(Replace with...)" placeholder if one exists) — do not wait for the other candidates to be ready. If the session cuts off mid-specification, what's already confirmed is not lost.
6. Update the corresponding row in `.orchestrator/objectives/OBJ-<NNN>.md` with the real assigned ID.
7. Continue with the next candidate.

## Step 7 — Close

When all candidates are written, report: how many User Stories were created, their IDs, and that the user can run `/legion` (or `/legion dry-run`) whenever they want — the batch plan will honor the declared `## Depends on`.

## Rules

- **Read-only over the base repo**: never modifies code, only `requirements-to-work.md` and `.orchestrator/objectives/`.
- Doesn't implement anything or run `/legion` — ends as soon as the User Stories are written.
- Don't invent system behavior or candidates without evidence: every claim has to come from having read the real code.
- If in Step 6 a candidate turns out, once analyzed in depth, to be much bigger or different from what it looked like in the initial split, say so and offer to split it into more User Stories — the Step 4 split is a proposal, not a closed contract.
