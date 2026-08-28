---
name: new-objective
description: Assistant for splitting a high-level objective (not yet shaped into User Stories) into several concrete User Stories. Researches the base repo, proposes a split with evidence, confirms it with the user, persists the decision in .orchestrator/projects/<project>/objectives/, and specifies each resulting User Story with the same depth as /new-story - one at a time, saving them into requirements/<project>.md as soon as each one is confirmed.
---
## Mandatory /new-objective project rule

Ask for the project once before research and keep it fixed for the whole breakdown. Persist the
objective and each individually confirmed story under that project's brief mutex using the same
safe publication segment as `/new-story`; never hold the mutex during interviews or analysis.

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


Guide the user from a business intent ("I want X") to a set of well-specified User Stories in `requirements/<project>.md`, ready for `/legion`. It's the same spirit as `/new-story` (detect gaps before an agent discovers them mid-implementation), one level higher up: here the gap to detect is "how many User Stories are needed, and where's the boundary between them?".

**It does not implement code or run `/legion`** — its work ends as soon as the User Stories are written.

## Step 1 — Receive the objective

Take the objective's description as the user gives it (free text, no format needed). If it's concrete enough that it's really already a single story (not an objective that needs splitting), tell them so and suggest `/new-story` directly instead of this command.

## Step 2 — Check previous decompositions

Before researching from scratch, check `.orchestrator/projects/<project>/objectives/` (if it exists) for any zone related to this objective. If there's something, use it as a starting point — don't repeat an analysis that's already been done, and stay consistent with previous splits in the same area unless there's a concrete reason to change it (if there is, state it explicitly in the Step 4 proposal).

## Step 3 — Research the base repo

Use the selected project's resolved `workspace/<repo_dir>` as reference. Research broadly in that real repo; a missing or mismatched repo blocks only this project and never causes guessing among sibling repositories.

## Step 4 — Propose the decomposition

Apply these splitting criteria, in order:

1. **Delivery independence**: each candidate has to be closeable and have value on its own, with its own verifiable acceptance criteria.
2. **Minimize cross dependencies, favoring parallelism**: the system is optimized to run User Stories in concurrent individual reservations — prefer splits that take advantage of that. **Important**: two candidates touching the same code (overlap) is NOT a reason to merge them into a single story with `## Subtasks` — that only makes `/legion` serialize them into different reservations, they remain separate User Stories. `## Subtasks` is only for when one part needs to block the other with its own approval criterion (a gate), not for sharing files.
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

With the split confirmed, persist it **immediately** — before specifying any story in detail — in `.orchestrator/projects/<project>/objectives/OBJ-<NNN>.md` (next available number):

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

## Step 6 — Specify each story (one by one, delegating to `/new-story`'s own flow)

For each confirmed candidate, in dependency-free-first order (if there's `## Depends on` among candidates, the ones that depend on nothing go first; a candidate only starts once every candidate it depends on has already been persisted):

1. **Analyze that candidate's specific zone** against the real code — same level of detail as `/new-story`'s Step 2: map the impact zone, cross-check claims against what exists, look for typical gaps (edge cases, states, permissions, idempotency, integrations, response and errors).
2. **Ask about what doesn't add up**, iteratively, with `AskUserQuestion` — same criterion as `/new-story`'s Step 3: cite code evidence, flag possible bugs, batches of up to 4 questions.
3. **Run `/new-story`'s Step 4 in full** for this candidate — Level 1 semantic preview on `.orchestrator/projects/<project>/stories/<ID>.md`, Checkpoint A, Level 2 final story, coverage matrix, mandatory editorial pass, Checkpoint B, and persistence exactly as `/new-story` defines it. Don't keep a separate template here — `new-story/SKILL.md` is the single normative source for the story's format and checkpoints; this step only supplies the candidate's own ID, `## Depends on` (referencing other stories from this same objective when applicable), and any `## Subtasks` already decided in Step 4 of this skill.
4. "Confirmed" means the candidate passed **both** Checkpoint A and Checkpoint B, and its persistence into `requirements/<project>.md` was verified — not just that a preview was accepted. Only after that, update the corresponding row in `.orchestrator/projects/<project>/objectives/OBJ-<NNN>.md` with the real assigned ID.
5. If, once analyzed in depth, this candidate's scope changed substantially from what Step 4 assumed (it needs to split, merge with another, or be dropped), reopen the split decision with the user **before** persisting this candidate — don't persist a story that no longer matches what the confirmed breakdown described.
6. Continue with the next candidate whose dependencies are already persisted.

If the session cuts off mid-specification, whatever was already confirmed and persisted is not lost — each candidate is saved to `requirements/<project>.md` as soon as it individually clears Checkpoint B, without waiting for the others.

## Step 7 — Close

When all candidates are written, report: how many User Stories were created, their IDs, and that the user can run `/legion` (or `/legion dry-run`) whenever they want — the planning view will honor the declared `## Depends on`.

## Rules

- **Read-only over the base repo**: never modifies code.
- Its write zones are `requirements/<project>.md`, `.orchestrator/projects/<project>/objectives/OBJ-<NNN>.md`, and `.orchestrator/projects/<project>/stories/<Story-ID>.md` (created/updated by the delegated `/new-story` flow in Step 6). It may create `.orchestrator/projects/<project>/stories/` idempotently if missing.
- Doesn't implement anything or run `/legion` — ends as soon as the User Stories are written.
- Don't invent system behavior or candidates without evidence: every claim has to come from having read the real code.
- If in Step 6 a candidate turns out, once analyzed in depth, to be much bigger or different from what it looked like in the initial split, say so and offer to split it into more User Stories — the Step 4 split is a proposal, not a closed contract.
