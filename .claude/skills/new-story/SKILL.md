---
name: new-story
description: Assistant for creating a User Story in requirements/<project>.md. Asks for the ID and description, analyzes the description against the base repo's real code, challenges ambiguities and possible bugs with questions to the user, and only then writes the refined User Story to the file — through a semantic preview checkpoint and a final-text checkpoint, keeping a persistent working record per story.
---
## Mandatory /new-story project and publication rules

Always ask the user to select/confirm the project before ID discovery or repo analysis, even when a
flag preselected it. The semantic preview lives only at
`.orchestrator/projects/<project>/stories/<Story-ID>.md` and is not schedulable. After the exact
final text is confirmed, acquire the project mutex, reread requirements/story record/assignments,
revalidate the ID, publish requirements and the final story record through verified candidates,
rebuild the queued board row, reread destinations and release. Creating a story never creates its
writer claim.

## Prose language

Resolve `prose_language` once for this command: an explicit user choice wins; otherwise use the
destination repo's established prose language; if none is evident, use English. Keep structural tags
in English regardless.

## Mandatory project scope

Resolve or confirm the project through `.orchestrator/projects.yml` before reading project state.
The selected catalog entry is the sole configuration authority. Use only
`requirements/<project>.md`, `.orchestrator/projects/<project>/...`, `workspace/<repo_dir>` and
namespaced worktrees. A missing catalog requires bootstrap; an empty catalog requires guided
registration. Neither state permits old singleton paths.

For a project-shared write, acquire the brief project mutex, reread current state, write and validate
a sibling candidate, rename it to the known destination, reread, then release the owned mutex.
Do not hold a mutex while interviewing, researching, testing, reviewing or waiting. Catalog and global `modules/registry.md` writes instead use the brief global metadata mutex. Never acquire or release a story claim unless this skill
is `/legion` performing a reservation.


Guide the user to add a well-specified User Story to `requirements/<project>.md`. Your value is not transcribing: it's **detecting gaps in the description BEFORE an agent discovers them mid-implementation**. A question now saves a gate round or a bug later.

If what the user brings is a high-level objective where they don't yet know how many User Stories it implies (not a concrete story), suggest `/new-objective` instead of this command — it does the same work as this skill, but first helps split the objective into several User Stories.

## Step 1 — Basic data, working file, and ID resolution

Take the Story ID and description from the args if the command was invoked with them already (e.g. `/new-story PROJ-100: <description>` or just a free-form description you can extract an implied ID from). **If invoked with no arguments at all, ask for them one field at a time, in two separate turns — never bundle both questions into a single message.**

### Prepare `.orchestrator/projects/<project>/stories/`

Before scanning anything: if `.orchestrator/projects/<project>/stories/` already exists as a directory, continue without touching its contents; if it's missing, create it; if that path exists as something other than a directory, stop and report it. Creating the directory never authorizes overwriting a file inside it — this preparation is idempotent, running the command again must not alter any existing story's content, permissions, or timestamps.

### Resolve occupied IDs

An ID counts as occupied if it appears in any of these sources:

1. a real `# Story <ID>` block in `requirements/<project>.md` (ignore "(Replace with...)" placeholders — they don't count);
2. a filename `.orchestrator/projects/<project>/stories/<ID>.md`;
3. the header declared *inside* that file (`# Preview — <ID>` or `# Story <ID>`) — if it doesn't match the filename, the file is invalid, not a free ID (see `INVALID_FILE` below).

When checking a specific ID against `requirements/<project>.md`, don't do a boolean search — walk the file's `---`-separated blocks and, for the ones matching that ID, keep: how many times it appears, each match's ordinal position among the blocks, how many `# Story` headers appear inside each matching block, and the block's content.

- **Zero occurrences in the queue**: evaluate the ID against `.orchestrator/projects/<project>/stories/<ID>.md` instead (see state table below).
- **Exactly one valid occurrence**: proceed to state classification below.
- **More than one occurrence, or a block with a missing/duplicated `# Story` header**: stop for that specific ID, report the positions found in the queue, and ask the user to reconcile it by hand before continuing — never silently pick one copy or one interpretation.

### Classify state and act accordingly

| State | `.orchestrator/projects/<project>/stories/<ID>.md` | `requirements/<project>.md` | What to do |
|---|---|---|---|
| `NEW` | Absent | Absent | Nothing to resume — this is a genuinely new ID. Proceed with the ID-picking flow below, then go to Step 2. |
| `PREVIEW_DRAFT` | Starts with `# Preview — <ID>`, well-formed | Absent | Resume Checkpoint A (Step 4) on the existing file — don't regenerate the preview from scratch. |
| `FINAL_DRAFT` | Starts with `# Story <ID>`, contract valid | Absent | Never treat the header alone as confirmation. Reconstruct and re-audit coverage (see "Resuming an interrupted final draft" in Step 4) before reopening Checkpoint B. |
| `PERSISTED_MATCH` | Story final, valid | Same block present, identical content | Already persisted. Inform the user; only start an edit if they explicitly ask for it (see "Editing a persisted story" in Step 4) — never rewrite by default. |
| `PERSISTED_DRIFT` | Story final, valid | Same ID, different content | Stop. Report both versions and ask the user to reconcile manually — neither source wins automatically. |
| `PREVIEW_WITH_QUEUE` | Starts with `# Preview — <ID>` | A block with that ID exists in the queue | Inconsistent state (a preview should never coexist with an already-persisted ID). Stop and report it; don't transform the preview or touch the queue. |
| `INVALID_FILE` | Header missing/duplicated, internal ID ≠ filename, or contract incomplete | Any | Preserve the file untouched, report the concrete problem, and let the user either fix it or pick a different ID. Never overwrite it automatically. |
| `QUEUE_ONLY` | Absent | A single valid block with that ID | Offer to create the matching `.orchestrator/projects/<project>/stories/<ID>.md` record from that exact block, or pick a different ID. |

**No silent overwrite, in any state**: an occupied ID never gets its file replaced just because the user is running `/new-story` again. Every non-`NEW` state above has an explicit, non-destructive action.

### Picking a new ID (state `NEW`, or the user wants a different one)

1. Resolve the **Story ID** with `AskUserQuestion` (never leave it as a bare open question — that call needs 2-4 concrete options, or it fails):
   - Scan `requirements/<project>.md` for existing `# Story <ID>` IDs (ignoring placeholders, per above).
   - **If a single shared prefix is detected** (every real story ID splits into the same `PREFIX-NUMBER` shape, e.g. all of them start with `SO-`): compute the next available number in that sequence and offer it as the first, recommended option worded so the user only has to supply the number (e.g. "Use `SO-` + your number (e.g. `SO-23`) — next available: `SO-23`"). The user types just the number; concatenate it to the detected prefix yourself. Add a second option to use a different prefix instead, for the rare case this story doesn't belong to that sequence.
   - **If there's no real story yet, or the existing ones don't share a single prefix** (mixed conventions): fall back to inferring the most likely next full ID and offer it as the recommended option (e.g. "Use `OS-2` (next available)"), plus a second option such as "Use a different prefix."
   - The user can always pick "Other" to type a fully custom ID — that's the built-in escape hatch for anything the two options don't cover.
   - Validate whatever ID results: format `PREFIX-NUMBER` (or whatever the project uses — ask again if it doesn't comply), and re-run the occupied-ID check above against it. If it's occupied, go to the matching state instead of silently proceeding.
2. Only once the ID is settled, ask in plain conversational text for the **Description**: what needs to be done, in the user's own words. This one stays plain text — it's a free-form paragraph, not a set of short choices, so `AskUserQuestion` doesn't fit it (save that tool for the real clarifying questions in Step 3).

Before continuing, count the file's real User Stories (`# Story` blocks with content, ignoring placeholders). **There is no limit on the number of User Stories**: each selected project uses one repo clone + one Git worktree per story. Adding a story only leaves it queued when overlap, dependencies or project `max_parallel` prevent reservation.

## Step 2 — Analysis against the real code

Use the selected project's resolved `workspace/<repo_dir>` as reference. If that cataloged repo is missing or invalid, stop only this project and guide repair; never guess another repo. Investigate the actual code the story will touch.

**Exhaustive research, not just targeted** (this is what prevents an implicit business rule from being discovered only in production, after it's implemented):

- **Broad grep by entity/field, not just the obvious files**: if the story mentions `order.status` or an equivalent concept, search the **entire** repo for that term — don't assume only the service/controller the story's name suggests matters. An implicit rule often lives in a module that at first glance has nothing to do with it (an event listener, a scheduled job, another flow that reacts to the same data).
- **Read the existing tests for the zone found** as a source of real behavior, not just production code — an old test often documents a rule nobody remembers anywhere else.
- **Check `.orchestrator/projects/<project>/lessons-learned.md` and `.orchestrator/projects/<project>/decisions/`**, filtering for what relates to the story's zone: if a previous incident or an architectural decision already touched this same part of the code, that's direct evidence to take into account, not a hunch.
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

## Step 4 — Two-level draft, checkpoints, and persistence

Everything in this step happens on a single working file, `.orchestrator/projects/<project>/stories/<Story-ID>.md`, created (or resumed) in Step 1. It goes through two levels: first a short semantic preview the user validates for scope and decisions (Level 1), then the full final story that gets persisted verbatim (Level 2). **The file is never deleted** — once persisted it stays as the story's permanent record, so the story survives even if `requirements/<project>.md` is later reset.

Write persisted prose in the language established by the destination repo, defaulting to English when none is evident. The **structural tags never translate**, always exactly as shown below, in English: `# Story <ID>`, `## Acceptance criteria`, `## Definitions taken`, `## Estimated impact zone`, `## Depends on`, `## Modules`, `## Subtasks`.

### Structural contract (unchanged, always literal)

- `# Story <ID>` never carries a title or suffix on the same line; an optional human title goes on the next line as a blockquote.
- `## Acceptance criteria`, `## Definitions taken`, and `## Estimated impact zone` are mandatory base sections. `## Depends on`, `## Modules`, `## Subtasks` are optional and are **omitted entirely** when they don't apply — never leave an empty section or a placeholder bullet like "- None."
- Subgroups inside a contractual section use `###` or lower.
- **No line in the final block may be a standalone `---`, not even inside a fenced code block.** `/legion` cuts `requirements/<project>.md` into stories by splitting on `---`, and nothing in that mechanism is documented as fence-aware — a literal `---` anywhere in the persisted text risks corrupting the queue's block boundaries. If a story genuinely needs to show something that would normally use a bare `---` (e.g. a YAML frontmatter example), describe it in prose or write the dashes spaced out (`- - -`) instead of reproducing it literally.

### Level 1 — Semantic preview

Header `# Preview — <ID>`. Structure:

```md
# Preview — <ID>

> <outcome-oriented human title>

## In one sentence
<problem + expected outcome, 2-3 lines>

## Problem observed
<current state and relevant evidence>

## What would change
- ...

## Scope
### Includes
- ...
### Out of scope
- ...

## Proposed behavior
### <flow/mode>
1. ...

## Confirmed decisions
| Topic | Decision | Reason |

## Decisions to confirm
- ...

## Discarded alternatives
- ...

## Points to verify during implementation
- ...

## Technical evidence
- `Symbol/path`: <what it demonstrates>

## Estimated impact
| Zone | Expected change |
```

If nothing is left open, say so in one sentence — never invent a question or leave an empty table. Orientative budgets (not hard limits — if exceeded, split into sub-sections or move evidence around instead of cutting content): "In one sentence" ~30-60 words; "Problem observed" 1-3 short paragraphs; "What would change" ~3-7 bullets; each decision, one sentence for the decision and one for the reason; evidence, one line per symbol/file, no chronological narration of the whole investigation.

### Checkpoint A

Ask with `AskUserQuestion`: **"Is the scope and are the decisions in this preview correct?"** — options **"Yes, prepare the final story"** / **"I want to adjust something"**.

Each loop rereads the file, confirms it's still a valid `PREVIEW_DRAFT` for the right ID, incorporates the requested edit, and repeats. Checkpoint A never writes to the queue.

Bind the confirmation to an exact in-memory snapshot: capture the file's full content right before asking the question. If the user confirms, reread the file immediately before transforming it into Level 2 — if it differs from what was captured (even if the new version is also valid), don't transform it: go back to the loop, show/validate the new version, and ask again. No hashing or durable metadata is needed for this, just the reread-before-acting discipline.

### Level 2 — Final story

Once A is confirmed, replace the same file's content entirely. Structure:

```md
# Story <ID>

> <optional human title>

## <Expected outcome, in prose_language>
<what problem it solves, for whom, and the observable change>

## <Scope, in prose_language>
### <Includes>
- ...
### <Out of scope>
- ...

## <Contract and behavior, in prose_language>
### <flow/mode>
- ...

## <Binding technical decisions, in prose_language>
### <decision name>
- **Definition:** <short reference to the canonical formulation in Definitions taken>
- **Reason:** ...
- **Evidence:** ...
- **Alternative:** ...
- **Consequence:** ...

## Acceptance criteria
### <editorial grouping>
- <one verifiable behavior>

## Definitions taken
- <self-sufficient decision/assumption/risk>

## Estimated impact zone
- <real zone + change>

## Depends on
- <only if applicable>

## Modules
- <only if applicable>

## Subtasks
1. <only if applicable>
```

Orientative budgets: expected outcome 80-120 words across up to 3 short paragraphs; each acceptance criterion, one main behavior in 1-3 short sentences; each decision, reason plus only the alternatives/consequences that matter; impact grouped by layer/component (file-by-file only when it genuinely helps the scheduler); line numbers preferably only in the Level 1 preview — the final story favors stable paths/symbols.

**Atomic criteria**: each acceptance criterion must be markable PASS/FAIL or map to one test. If it bundles several behaviors, a long justification, and different exceptions, split it. Editorial subgroups (e.g. `### Contract`, `### Data and performance`, `### Preserved behavior`, `### Quality`) are optional, not mandatory.

**Decision separated from evidence**: the canonical formulation of each binding decision lives **exactly once**, in `## Definitions taken`, short and self-sufficient. The editorial "Binding technical decisions" section references that formulation by name and only adds reason, evidence, alternatives, and consequences — it never restates the decision in full. Evidence explains why; it doesn't get mixed into every criterion. Discarded alternatives are documented once, under their decision.

**`Definitions taken` must be self-sufficient**: every confirmed decision, binding assumption, and accepted risk must be understandable there without reading any other section — that's the canonical copy the reviewer and design-reviewer rely on to recognize what is *not* a finding.

**Amendments**: when a story is later edited, rewrite the contract with the current value, remove the superseded instructions from the binding body, and keep at most one short historical note if it adds traceability. Reject leaving two incompatible values (TTL, limit, mechanism) side by side, and never leave a "warning above + full obsolete spec below" — there is only ever one currently-valid contract.

### Coverage matrix (before writing Level 2)

| Finding | Mandatory destination |
|---|---|
| Outcome/value | Expected outcome |
| Included change | Scope/contract |
| Edge case/behavior | Acceptance criterion |
| Confirmed decision / binding assumption / accepted risk | `Definitions taken`, self-sufficient; the editorial section only references and expands |
| Discarded alternative | Under its decision |
| Current-state evidence | Preview; in the final story only if still necessary |
| Excluded work | Out of scope |
| Hypothesis / future check | The "to verify" category, localized per `prose_language` (never presented as a guarantee) |
| Affected zone | Estimated impact zone |

The "to verify" and "guidance-only" categories are **content**, not structural tags — they must be written in whatever `prose_language` says, the same as any other prose: `To verify` / `Guidance` in English, `Por verificar` / `Orientativo` in Spanish, the equivalent localized pair in any other configured language. Never hardcode the English words when `prose_language` is something else.

Condensing prose can never drop edge cases, errors/responses, permissions, concurrency, idempotency, data/migrations, integrations, or tests found during Steps 2-3.

### Mandatory editorial pass and Checkpoint B

On every loop, after any edit:

1. reread `.orchestrator/projects/<project>/stories/<ID>.md`;
2. validate tags are exact, unique, and at the right level;
3. validate there are no placeholders or empty base sections;
4. validate `prose_language` in prose/editorial headers;
5. validate outcome appears before evidence;
6. validate criteria are atomic;
7. validate "out of scope" content never doubles as a task;
8. validate values are unique and amendments are integrated (no contradicting leftovers);
9. validate semantics by location and language: contract/AC/Definitions content is implicitly binding without needing a prefix word; out-of-scope content lives only in its own section; the "to verify" category is written literally, in `prose_language`, next to any hypothesis/`explain()`/benchmark (`To verify` in English, `Por verificar` in Spanish, the equivalent in any other configured language — never hardcode the English word when `prose_language` is something else); a guidance-only detail (e.g. a suggested class name) is flagged the same way, localized (`Guidance`/`Orientativo`/equivalent), only when it could genuinely be mistaken for binding contract;
10. compare against the coverage matrix;
11. validate `Definitions taken` is self-sufficient and not duplicated by the editorial section;
12. validate the optional-rules sections below are complete for whichever ones apply;
13. only if everything passes, offer Checkpoint B.

Ask: **"This is the exact story that will be added to requirements/<project>.md. Do you confirm it?"** — options **"Yes, add it"** / **"I want to adjust the wording"**.

Same in-memory-snapshot discipline as Checkpoint A: capture the exact content that passed the editorial pass and was shown to the user. After confirmation, reread immediately before persisting and repeat the validations — if the content differs from what was confirmed (even if still valid), go back to the loop and reconfirm; never persist a version different from the one actually confirmed. No durable hashing involved.

### Optional sections — preserve these rules in full

`## Depends on`, `## Modules`, and `## Subtasks` are **omitted completely** when they don't apply — never persisted empty or with a "no dependencies" bullet.

**`## Depends on`**:
- Only a business dependency: this story doesn't make sense before another is already `finalized`. Code overlap is not a dependency — the scheduler already serializes that into different reservations.
- Format: `- <ID of the other story>`.
- Each ID must exist as a real story in `requirements/<project>.md` — a draft, a placeholder, or free text doesn't qualify.
- If unsure whether it's a real dependency or just an ordering preference, ask in Step 3.

**`## Modules`**:
- Evaluate after acceptance criteria are closed.
- Read `modules/registry.md`.
- Offer only installed `type: gate` modules relevant to this story.
- Never offer `type: generator` — that's invoked separately via `/run-module`.
- Validate the requested stage against `valid_stages`; an omitted stage falls back to `default_stage`.
- Don't ask about modules with `default_activation: always` — they run automatically.
- Format: `- <module-name> @ <stage>`, or without `@ <stage>` for the default.
- Reject a nonexistent/not-installed module or an invalid stage before persisting.

**`## Subtasks`**:
- Only when domains need categorically distinct approval criteria — not because the story touches several file types.
- If in doubt, ask in Step 3.
- One worktree, agents run in strict sequence.

```md
## Subtasks
1. [backend] Export endpoint
2. [security] Review of which fields are exportable (depends on 1)
```

**`[implementer:<module-name>]` subtasks**: check `modules/registry.md` for installed `type: implementer` modules relevant to this part of the story. Never select one automatically — it's always an explicit user choice. `default_activation: always` is invalid for this type. Format `[implementer:<module-name>]`; can be one subtask among others, or the story's only one. Validate the module exists, is installed, and is the right type before persisting.

### Editing a persisted story

Only starts from state `PERSISTED_MATCH`, by the user's explicit choice ("Edit the existing story") — never inferred just because the text changed.

1. Locate the single matching block by ID (reusing the position/count data from Step 1).
2. Keep an in-memory copy of that exact block.
3. Edit `.orchestrator/projects/<project>/stories/<ID>.md` as a Level 2 draft.
4. Run Checkpoint B in full, including the editorial pass on every loop.
5. Immediately before replacing anything, reread the queue and re-validate uniqueness/position for that ID.
6. If the block in the queue is still identical to the in-memory copy from step 2, replace only that block.
7. If it changed in the meantime, stop and ask the user to reconcile — a quick re-confirmation never authorizes an overwrite over a version you haven't seen.

There is no automatic resumption of an in-progress edit: if the session gets interrupted mid-edit, the in-memory base copy is gone, and if `.orchestrator/projects/<project>/stories/<ID>.md` no longer matches the queue, the ID classifies as `PERSISTED_DRIFT` next time — manual reconciliation is the safe path, not a fabricated recovery.

### Resuming an interrupted final draft

A `FINAL_DRAFT` found on resume is never accepted just because it's well-formed, and its header never implies confirmation. Before reopening Checkpoint B:

1. reread the draft in full;
2. reread the real code of the zone and its relevant tests, same depth as Step 2;
3. reread `.orchestrator/projects/<project>/lessons-learned.md` and any relevant `.orchestrator/projects/<project>/decisions/`;
4. recover whatever is still available from the conversation (the user's earlier answers, evidence already gathered) — if part of that context is gone, say so as a limitation, never invent it;
5. reclassify findings into outcome, scope, edge cases, decisions, assumptions, risks, evidence, and impact;
6. compare that reconstruction against the draft and explicitly surface any loss, contradiction, or unsupported claim;
7. only involve the user to correct something if a confirmed decision is actually affected;
8. only once coverage is reconstructed, run the editorial pass and reopen Checkpoint B.

No sidecar file or new metadata is created for this — the existing file is preserved and audited; the analysis can fill in lost detail, but it never silently replaces the whole draft on its own.

### Persistence

Once Checkpoint B is confirmed, reclassify the state one more time and:

- `FINAL_DRAFT` not yet in the queue: apply to `requirements/<project>.md` (see placeholder/append rules below).
- Editing a persisted story: replace only the original block, per the "Editing a persisted story" procedure above.
- `PERSISTED_MATCH` (nothing changed): don't duplicate anything.
- Drift or any other inconsistency: stop, don't write.

After writing, reread the persisted block and compare it against the confirmed content, normalizing only line endings. **`.orchestrator/projects/<project>/stories/<ID>.md` is never deleted** — it stays as the story's permanent record.

**Placeholder route**: replace the **entire placeholder block**, bounded by its `---` separators — not just the "(Replace with...)" line. `requirements/<project>.md`'s placeholders are full multi-section blocks (they include their own `## Depends on (optional)`/`## Subtasks (optional)` instructional prose); leaving any of that behind would corrupt the queue. After replacing, verify exactly one valid separator remains between the new block and its neighbors, with no leftover placeholder text.

**Append route**: add the story at the end, preceded by exactly one `---` separator, outside the new block.

Don't touch any other User Story in the file.

Close by informing: the story was added, the current total count of User Stories in the file, and that the user can run `/legion` (or `/legion dry-run`) whenever they want.

### Leftover transitional previews

Before treating a rollout of this flow as complete, inventory any `.orchestrator/preview-story-*.md` files left over from before this working file moved to `.orchestrator/projects/<project>/stories/` — record each one's ID, header, and whether a story with that ID already exists in the queue or in `.orchestrator/projects/<project>/stories/`. For each, offer the user to: rescue it manually as a Level 2 draft in `.orchestrator/projects/<project>/stories/` (after checking for ID collisions), keep it aside for later review, or discard it — only with explicit confirmation per file. Never delete, migrate, or rename these automatically.

## Rules

- **Read-only over the base repo**: this skill never modifies code. It may read the selected catalog entry, real code, tests, project lessons/decisions and `modules/registry.md` when relevant.
- Its only write zones are `requirements/<project>.md` and `.orchestrator/projects/<project>/stories/<Story-ID>.md`. It may create `.orchestrator/projects/<project>/stories/` idempotently if missing; if that path exists as something other than a directory, it stops instead of writing.
- It never creates new `.orchestrator/preview-story-<ID>.md` files, and never automatically deletes a persistent record in `.orchestrator/projects/<project>/stories/`.
- It doesn't write to `.orchestrator/projects/<project>/objectives/`, code, or any other zone.
- Don't invent system behavior: whatever you claim about the current code has to come from having read it.
- Don't assume architecture conventions from another project (layers, naming): research the target repo's real ones.
- If the description is too large for a single story (touches 3+ unrelated domains), propose splitting it into 2 User Stories — the system can run them in parallel, that's what it's for.
