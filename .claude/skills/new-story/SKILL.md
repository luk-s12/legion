---
name: new-story
description: Assistant for creating a User Story in requirements-to-work.md. Asks for the ID and description, analyzes the description against the base repo's real code, challenges ambiguities and possible bugs with questions to the user, and only then writes the refined User Story to the file.
---

Guide the user to add a well-specified User Story to `requirements-to-work.md`. Your value is not transcribing: it's **detecting gaps in the description BEFORE an agent discovers them mid-implementation**. A question now saves a gate round or a bug later.

If what the user brings is a high-level objective where they don't yet know how many User Stories it implies (not a concrete story), suggest `/new-objective` instead of this command — it does the same work as this skill, but first helps split the objective into several User Stories.

## Step 1 — Basic data

Ask with `AskUserQuestion` (or take them from the args if already given):

1. **Story ID** (e.g. `PROJ-100`). Validate:
   - Format `PREFIX-NUMBER` (or whatever the project uses). If it doesn't comply, ask again.
   - That it doesn't already exist in `requirements-to-work.md` (if it exists, offer: edit that story or choose another ID).
2. **Description**: what needs to be done, in the user's own words. Accept it as given — the refinement is yours.

Before continuing, count the file's real User Stories (`# Story` blocks with content, ignoring "(Replace with...)" placeholders). **There is no limit on the number of User Stories**: this system uses a single base repo + one `git worktree` per story, so adding one more story doesn't break anything — at most it makes `/legion` group it into a later batch if it overlaps with another (the real limit is concurrency, `MAX_PARALLEL`, not quantity).

## Step 2 — Analysis against the real code

Use the **base repo** (the single subdirectory with `.git` inside `workspace/`, aside from `worktrees/`) as reference — that's where the project's real code lives, with no active worktree yet. If `workspace/` is empty, warn that the repo needs to be cloned there first before anything can be analyzed. Investigate the code the story is going to touch — not superficially: read the actual files.

**Exhaustive research, not just targeted** (this is what prevents an implicit business rule from being discovered only in production, after it's implemented):

- **Broad grep by entity/field, not just the obvious files**: if the story mentions `order.status` or an equivalent concept, search the **entire** repo for that term — don't assume only the service/controller the story's name suggests matters. An implicit rule often lives in a module that at first glance has nothing to do with it (an event listener, a scheduled job, another flow that reacts to the same data).
- **Read the existing tests for the zone found** as a source of real behavior, not just production code — an old test often documents a rule nobody remembers anywhere else.
- **Check `.orchestrator/lessons-learned.md` and `.orchestrator/decisions/`**, filtering for what relates to the story's zone: if a previous incident or an architectural decision already touched this same part of the code, that's direct evidence to take into account, not a hunch.
- **Map the impact zone**: what modules/services, public endpoints/interfaces, entities/tables, enums, consumers/producers or equivalents does it touch? Use the project's real structure (read its `CLAUDE.md`/architecture docs if they exist) instead of assuming layers from another project.
- **Cross-check every claim in the description against what exists**:
  - Do the concepts it names correspond to real domain entities/objects? With what names and states?
  - Does something already exist that fully or partially does what's requested? (a similar endpoint, a service with that logic, an existing validation)
  - Does the story contradict existing logic? (e.g. it asks to allow something a validation currently blocks)
- **Look for typical gaps**:
  - Undefined edge cases: what happens with boundary values (0/negative, empty lists, the last element of a collection, already closed/finalized records)?
  - States and transitions: from which states is the operation valid? What state does it leave afterward? Is there an enum/type that needs extending?
  - Permissions/actor: who can do it? Is the available session/user identifier enough?
  - Concurrency/duplicates: what happens if it arrives twice? Idempotency?
  - Data: does it require schema changes (→ migration, if the project uses one)? Historical data to migrate?
  - Integrations: notifications, events, queues, calls to other services?
  - Response and errors: what does the endpoint/function return? What business errors can it produce?

## Step 3 — Ask about what doesn't add up (iterative)

With the analysis done, present your doubts with `AskUserQuestion` — in batches of up to 4 questions, most important first. Each question should:

- Cite the code evidence that motivates it (e.g. "today `Xyz.createSomething` rejects amounts ≤ 0 — does this story keep that rule?").
- Offer concrete options with their implications, not open-ended questions when it can be avoided.

Explicitly flag **possible bugs**: if the description, applied as-is on top of the current code, would produce broken or contradictory behavior, say so as a risk and propose the alternative. If the exhaustive grep found behavior in another module the description doesn't account for, or `lessons-learned.md`/`decisions/` have something relevant to this zone, present it as a concrete question with the evidence cited — this is the most important part of this round, not an extra. Repeat the question round until no doubts remain that would change the design (usually 1-2 rounds; don't interrogate for sport — minor things can be left as "criterion to be defined by the implementer").

## Step 4 — Draft, preview, and confirm

Write the story's persisted **prose** (the description paragraph and the bullet content under each section) in whatever `.orchestrator/config.md`'s "Content language" field says (default English) — regardless of what language you and the user chatted in to get here. The section headers themselves (`# Story <ID>`, `## Acceptance criteria`, `## Definitions taken`, `## Estimated impact zone`, `## Depends on`, `## Subtasks`) always stay in English exactly as shown below — the orchestrator parses those literally (e.g. to build the dependency graph from `## Depends on`), so translating them would silently break scheduling.

Build the story's final block:

```md
# Story <ID>

<Refined description: what needs to be done and why, incorporating the user's answers.>

## Acceptance criteria
- <verifiable, one per line>

## Definitions taken
- <each decision that came out of the questions>

## Estimated impact zone
- <modules/services/endpoints/tables detected in the analysis — this feeds /legion's pre-analysis>

## Depends on (only if applicable)
- <optional — see below>

## Subtasks (only if applicable)
- <optional — see below>
```

**When to add `## Depends on`**: if this story doesn't make sense before another one is already `finalized`, for a **business** reason (not code — code overlap is already handled automatically by the scheduler serializing batches). Example: "the partial-refunds endpoint doesn't make sense before the partial-payments model exists", even if they don't share any file today. Format: `- <ID of the other story>`. If unsure whether it's a real dependency or just an ordering preference, ask the user in Step 3.

**When to add `## Subtasks`**: if during analysis you detected that the story combines domains with a categorically distinct approval criterion (e.g. one part needs a security sign-off separate from the code, not just "another type of file") — the same criterion `/legion` uses to decide between generalist and subtasks. Format:

```md
## Subtasks
1. [backend] Export endpoint
2. [security] Review of which fields are exportable (depends on 1)
```

If unsure whether it warrants splitting, ask the user in Step 3 instead of deciding on your own — it's a scope decision, not a minor technical detail.

**Preview in a file, not just in chat**: write the complete block to `.orchestrator/preview-story-<ID>.md` — the exact same content that would go into `requirements-to-work.md`, so the user can read and edit it comfortably in their editor (markdown highlighting, no chat scroll limit) instead of only in the conversation text. Let them know it's ready for review there.

Confirm with `AskUserQuestion` — never ask them to type "yes"/"no" in chat: **"Does this look right?"** with options **"Yes, add it"** / **"I want to adjust something first"**.

- If they ask to adjust: modify the content of `preview-story-<ID>.md` and repeat this confirmation.
- If they confirm: take the content **exactly as it ended up in the file** (in case the user edited it directly by hand) and apply it to `requirements-to-work.md`:
  - If the file has "(Replace with...)" placeholders, replace the first one with the new story.
  - If not, append it at the end preceded by `---` (respecting the block format).
  - Don't touch the other User Stories.
  - Delete `.orchestrator/preview-story-<ID>.md` — it's transient, it shouldn't remain accumulated in the repo once applied.

Close by informing: story added, how many User Stories remain in the file in total, and that the user can run `/legion` (or `/legion dry-run`) whenever they want — `/legion` automatically builds the batch plan if there's overlap.

## Rules

- **Read-only over the base repo**: this skill never modifies code. It only writes `requirements-to-work.md` (final destination) and `.orchestrator/preview-story-<ID>.md` (transient, deleted upon confirmation).
- Don't invent system behavior: whatever you claim about the current code has to come from having read it.
- Don't assume architecture conventions from another project (layers, naming): research the target repo's real ones.
- If the description is too large for a single story (touches 3+ unrelated domains), propose splitting it into 2 User Stories — the system can run them in parallel, that's what it's for.
