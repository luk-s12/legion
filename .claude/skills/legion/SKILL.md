---
name: legion
description: Starts (or resumes) the dynamic orchestration of N User Stories in parallel - provisions a git worktree per User Story on a single base repo, groups them into batches based on overlap (MAX_PARALLEL simultaneous), coordinates a per-batch design gate with centralized migrations (if the project uses them), and synchronizes until the queue is empty. With "dry-run" it stops after the first batch's gate for user approval.
---

Run the dynamic orchestration of the multi-agent system. You act as the **Orchestrator Agent** per the protocol in the root `CLAUDE.md`. This system is agnostic to the target project: stack, command, and convention details live in `.orchestrator/config.md`, not in this skill.

**Arguments**: `dry-run` (stop after the first batch's gate) and/or `MAX_PARALLEL=<n>` (if not passed, use the value from `config.md`, default 3).

## Phase -1 — Project configuration (only if missing or incomplete)

1. Read `.orchestrator/config.md`. If it doesn't exist, or exists but has unfilled `<...>` placeholders, resolve it BEFORE continuing:
   - Verify that `workspace/` has a single subdirectory with `.git` (aside from `worktrees/`) — that is the base repo. If `workspace/` is empty (except for its `README.md`) or there is ambiguity (0 or 2+ candidates), **stop here**: inform the user and wait for them to clone a single repo there.
   - Read the base repo's `CLAUDE.md`/architecture docs to infer stack, build/test/lint commands, and look for evidence of a migration tool (typical Liquibase/Flyway/Prisma/Alembic/Django folders, or the absence of a versioned schema).
   - Identify which gitignored files/folders of the base repo an agent needs to work (local rules, docs) — this feeds "Local files to copy to the worktree".
   - Ask the user what cannot be inferred with certainty: base branch, working-branch prefix/convention, `MAX_PARALLEL` if not passed as an argument, and confirm the migration tool if it remained ambiguous.
   - Write `.orchestrator/config.md` with the resolved values.
2. If `config.md` is already complete, continue directly to Phase 0.

## Phase -2 — Objective decomposition (only if `requirements-to-work.md` brings a `# OBJECTIVE`)

1. When reading `requirements-to-work.md` (formally done in Phase 1, but worth checking here too if starting from scratch), if a `# OBJECTIVE` block appears (instead of `# Story <ID>`), it is a high-level intent that hasn't been split into User Stories yet — this is not a format error, it's a valid input that needs decomposition before continuing.
2. Offer the user to run the same decomposition the `/new-objective` command does (see `.claude/skills/new-objective/SKILL.md` for the full detail: check previous `.orchestrator/objectives/`, research the base repo, propose the split with evidence, confirm with `AskUserQuestion`, persist to `.orchestrator/objectives/OBJ-<NNN>.md`, and specify each resulting User Story one by one with the same depth as `/new-story`, saving them into `requirements-to-work.md` as soon as each is confirmed).
3. Only once the `# OBJECTIVE` has been replaced with complete User Stories, proceed to Phase 0 normally.
4. If the user prefers not to decompose it now, inform them that `/legion` cannot continue with an unresolved `# OBJECTIVE` block, and suggest running `/new-objective` whenever they want.

## Phase 0 — Resumption (is there a partial execution?)

1. Read `.orchestrator/assignments.md`. If it exists and has User Stories with a status other than `finalized`/`aborted`, there is an interrupted orchestration: **do NOT restart from scratch or overwrite the work**.
2. Reconstruct context: reread `events/*.md`, `components.md`, `designs/*.md`, `decisions/`, and the real infrastructure: `git -C workspace/<base-repo> worktree list` + `git -C <worktree> diff <base-branch> --stat` for each one. Git state is the truth; events are the narrative — if they differ, trust git and note the discrepancy.
3. Inform the user what was found (story, worktree, batch, status, last event) and resume: relaunch a new `worktree-agent` per incomplete story, adding a `RESUMPTION` block to the prompt with: status per events, summary of the existing diff, the approved design from `designs/<Story-ID>.md` if it already existed, and the order to continue on the existing worktree **without recreating it or redoing what's already done**. User Stories with `APPROVED` review are not relaunched. Rebuild the queue of pending batches.
4. Resume the loop at the appropriate phase: design gate if approvals were missing, monitoring/review/rotation if they were implementing or queued.
5. Only if there is no pending execution — or the user explicitly asks to restart (in that case, confirm before discarding worktrees/events) — continue with Phase 1.

## Phase 1 — Validation

6. **Detect the base repo**: the single subdirectory of `workspace/` with `.git` (aside from `worktrees/`). If there are zero or more than one → error, abort.
6bis. **Update the remote reference** (read-only, never modifies the working tree): `git -C workspace/<base-repo> fetch origin`. Compare the local `base-branch` against `origin/<base-branch>`:
   - No difference → continue.
   - Local behind the remote → report how many commits of difference there are and ask with `AskUserQuestion` whether to update (`git pull --ff-only` on the base branch — never automatic merge/rebase, and never if the base branch isn't the one currently checked out: in that case offer to do it or leave it for later).
   - Diverged (there are local commits the remote doesn't have) → stop and inform; the resolution is up to the user, do not assume which version is correct.
7. Validate the base repo: if it is **currently sitting on the base branch** registered in `config.md`, require a **clean** working tree (`git -C workspace/<base-repo> status --porcelain`). **If the repo is sitting on another branch, there is nothing to validate here**: the worktree is created from the commit of `base-branch` regardless of which branch the user has open — no need for a manual checkout to the base branch before orchestrating.
   - If it has uncommitted changes, **do not abort directly** — show which files are dirty and ask with `AskUserQuestion`: *"Continue the orchestration anyway? The worktree is created from the last commit — this uncommitted change won't be in any worktree."* (useful for the typical case of a file that is intentionally never committed, e.g. a local `.properties` file tracked with machine-specific values).
     - **Yes, continue** → follow the normal flow, leaving the file as is (untouched). Report in the summary that this change was left out of all worktrees in this orchestration.
     - **No** → second question: *"Discard the change (it will be lost) or abort the run?"*
       - **Discard** → only then, with this explicit confirmation, revert that specific file (`git checkout -- <file>` / equivalent) and continue.
       - **Abort** → stop the run without touching anything, so the user can resolve it by hand.
   - If the problematic file is **gitignored** (untracked), this doesn't even apply: `git status --porcelain` doesn't flag it as dirty. See `config.md` → "Local files to copy to the worktree" so it still reaches each new worktree.
8. Read `requirements-to-work.md`. If it doesn't exist → **error, abort**: "Missing requirements-to-work.md file". Parse the blocks separated by `---`: those starting with `# Story <ID>` are User Stories; if one appears with `# OBJECTIVE` instead of `# Story <ID>`, go back to Phase -2 before continuing (do not treat it as an invalid story). Ignore empty/placeholder blocks. If there is no valid story (and no pending objectives) → error, abort. **There is no limit on quantity.**
9. Verify that worktrees/branches with these story IDs do not already exist, **both local and remote** (`git -C workspace/<base-repo> worktree list`; list local branches and `origin/*` with the prefix from `config.md` — the `fetch` from step 6bis already brought the updated remote reference). If they exist and it is not a resumption → inform and ask the user for a decision (leftovers from a previous run of their own, or from someone else using the same remote?).

## Phase 2 — Pre-analysis, batch plan, and launch

10. **Pre-analysis** (on the base repo): for each story, estimate the impact zone — concrete modules/services, public endpoints/interfaces, entities/tables, and whether it requires schema migrations (only if `config.md` indicates the project uses a migration tool). Targeted code reading, not design.
10bis. **Agent selection** (`.orchestrator/capabilities.md`): for each story, apply the selection rule (see `CLAUDE.md`, "Agent selection per story") — generalist if it combines domains normally, specialist if it is purely one domain, or split into `## Subtasks` if a domain needs its own gate. If the story was written by hand (without going through `/new-story`) and its zone is considered risky (touches an entity with many dependencies, or `.orchestrator/lessons-learned.md` has something registered for that zone), first launch `research-agent` in prior-research mode (`BASE_REPO`, `QUESTION` = the story's zone, `ANNOUNCEMENTS`, `LESSONS` = path to `lessons-learned.md`, `DECISIONS` = path to `decisions/`) and wait for its finding before continuing — its results get incorporated into `designs/<Story-ID>.md` or presented to the user if they change the scope of the story.
11. **Batch plan** (the scheduler):
    - Build the conflict graph: story↔story with **strong** overlap (same module/service/entity/table) = **symmetric** edge (neither runs while the other is active, but neither has priority over the other).
    - Add the dependencies declared in each story's `## Depends on` as **directed** edges: if story B depends on story A, B is not launched (even if it has a free slot) until A is `finalized` — this is a business rule, not a code-conflict rule, so it isn't resolved just by "different batches": B directly waits `queued` with the reason "depends on A" until A closes.
    - Group into batches of up to `MAX_PARALLEL` User Stories **with no conflict edges among them and with all their `## Depends on` dependencies already resolved** (those that clash by code automatically land in different batches = serialized; those with a pending business dependency stay queued until it's resolved, regardless of slot availability). **Weak** overlap (same domain, different components) can coexist in a batch with `COORDINATION_POINTS`.
    - If `## Depends on` references an ID that doesn't exist among the User Stories in this file → inform and ask the user to correct it before building the plan (do not silently ignore it).
    - **Show the plan to the user** (batches, order, why what was serialized was serialized, what's left waiting on a business dependency) before launching. If a different story order matters to the business (priorities), this is the moment for them to say so.
12. Write the **board** `.orchestrator/assignments.md`: table `Story | Worktree | Branch | Batch | Status | Last activity | Review round` (User Stories in future batches: status `queued`) + overlap matrix + batch plan.
13. **Provision the active batch** (one story per slot):
    ```bash
    git -C workspace/<base-repo> worktree add ../worktrees/<Story-ID> -b <branch-prefix>/<Story-ID> <base-branch>
    ```
    and copy the gitignored files/folders registered in `config.md` ("Local files to copy to the worktree") from the base repo to the new worktree. Create `.orchestrator/events/<Story-ID>.md` (header with story and date).
14. **Launch the batch's agents in a single message** (parallel across different User Stories): `subagent_type` = the one resolved in step 10bis (default `"worktree-agent"`), `run_in_background: true`. Prompt with: `WORKTREE` (absolute path), `STORY` (ID + full text), `BRANCH` (already created with the worktree) + `BASE_BRANCH`, `EVENTS`, `QUALITY_GUIDE` (path to `.claude/skills/patterns-and-smells/SKILL.md` — omit if the `subagent_type` is `worktree-agent-docs`, which doesn't write code and doesn't need it), `REGISTRY` (path to `.orchestrator/components.md`), `SIGNALS` (path to `.orchestrator/signals/`), `ANNOUNCEMENTS` (path to `.orchestrator/announcements/`), `CONFIG` (path to `.orchestrator/config.md`) and, if applicable, `COORDINATION_POINTS`. If the `subagent_type` is `worktree-agent-security`, also add `SECURITY_GUIDE` (path to `.claude/skills/security-guide/SKILL.md`). If the `subagent_type` is `worktree-agent-data`, add `DATA_GUIDE` (path to `.claude/skills/data-guide/SKILL.md`) and `SCRIPTS_DEST` (absolute path to `scripts/<base-repo>/` at the root of this orchestrator — create the folder if it doesn't exist yet; the migration itself still goes to the `WORKTREE`, only auxiliary scripts go to `SCRIPTS_DEST`). If the `subagent_type` is `worktree-agent-docs`, add `DOCS_DEST` (absolute path to `docs/<base-repo>/` at the root of this orchestrator — create the folder if it doesn't exist yet, before launching the agent) instead of expecting it to write inside the `WORKTREE`. Remind it that its first delivery is **Stage A** (`DESIGN_PROPOSED`, no code). Record the agent IDs for `SendMessage`. If the story has `## Subtasks`, launch only the first one with no pending dependencies — the following ones are launched during Phase 4's rotation (subtasks of an ongoing story), only once the previous one reaches `FINALIZED`, on the same worktree.

## Phase 3 — Design gate PER BATCH (barrier: no one implements without approval)

15. Wait for the proposal from **all agents in the batch** (`DESIGN_PROPOSED`). Do not approve one at a time: the value lies in comparing them together. If an agent reports a blocker, resolve it first (partially approve only if the others don't overlap with the blocked one).
    - **User Stories with `## Subtasks`**: each subtask goes through the gate of its own batch **at the moment it exists** — no need to wait for the following subtasks, because they literally haven't been launched yet (they are born in sequence, see Phase 4). Subtask 1 is compared with the rest of the batch just like any story proposal; when later subtask 2 reports its own `DESIGN_PROPOSED`, it goes through the gate of whichever batch is active at that time (which may be a different batch than subtask 1's). Exception: if two subtasks of the same story coincide in the same batch (with no dependency between them), they are compared together like any pair of proposals.
16. Compare the batch's proposals **against each other + against `components.md` + against the approved `designs/` from previous batches** (architectural memory — so batch 3 doesn't reinvent what batch 1 already solved):
    - Equivalent components with different approaches → resolve ON PAPER using the selection rules from `patterns-and-smells` and unify naming/location/type.
    - Components that already exist in the registry → order replication of the `Reference`.
    - Components multiple User Stories need → define ONE common spec and assign which story implements it first (the others replicate it).
    - Pay special attention to the pre-analysis's `COORDINATION_POINTS`.
17. **Migration coordination (mandatory, global counter)** (only if `config.md` indicates the project uses a migration tool): every proposal with a schema change declares its migrations (tables/collections, type of each change, proposed constraint/index names). Check for collisions (same table, repeated names) and **assign the final identifiers/names** following the ordering rule from `config.md`. The counter **crosses batches**: every migration in batch N+1 carries an identifier later than those of batch N.
18. If there was a conflict of approaches, record the decision in `.orchestrator/decisions/DEC-NNN.md` (context, alternatives, criteria, decision).
19. **Persist each design** in `.orchestrator/designs/<Story-ID>.md`. If the story does **not** have `## Subtasks`, a single block:
    ```md
    # Design Story <ID> — batch <n>
    **Status: PENDING APPROVAL | APPROVED | APPROVED WITH ADJUSTMENTS | DISCARDED**
    ## Solution summary
    ## Components (create/modify)
    | Component | Type | Location | Approach | Problem it solves | Origin (new / replica) |
    ## Assigned migrations (if applicable)
    ## Gate adjustments
    ## Estimated size
    ```
    If the story **does** have `## Subtasks`, one sub-section per subtask (filled in one at a time, in the order each subtask reports its own `DESIGN_PROPOSED` — those not yet started remain `PENDING`):
    ```md
    # Design Story <ID> — batch <n>
    **Status: PENDING APPROVAL | APPROVED | APPROVED WITH ADJUSTMENTS | DISCARDED**

    ## Subtask 1 — [domain]
    **Status: APPROVED**
    ### Solution summary
    ### Components (create/modify)
    | Component | Type | Location | Approach | Problem it solves | Origin (new / replica) |
    ### Assigned migrations (if applicable)
    ### Gate adjustments

    ## Subtask 2 — [domain] (depends on 1)
    **Status: PENDING — blocked until the subtask it depends on reaches FINALIZED**

    ## Estimated size
    (of the full story, adding up the subtasks)
    ```
20. Update `.orchestrator/components.md` with the approved reusable components (status `planned`) and send each agent its approval via `SendMessage`, with the adjustments as concrete orders; mark the design `APPROVED`. **In dry-run mode, do NOT send the approvals**: leave it `PENDING APPROVAL` and skip to the "Dry-run mode" section.

## Phase 4 — Monitoring, review, and queue rotation (loop until the queue is empty)

21. On every notification from a subagent (progress or completion), reread **all** files in `.orchestrator/events/` and **update the board** (`assignments.md`): status, last activity (last event + time), review round. The board is the resumption point.
21bis. **Maintain Signals and Announcements** on every cycle of this monitoring:
    - Review `.orchestrator/signals/`: archive (move to a `EXPIRED` state, do not delete) any Signal whose expiration deadline passed without another story reinforcing it with an equivalent finding. If a HIGH-severity Signal is still active and a new batch is about to launch, evaluate whether the plan needs adjusting before provisioning (e.g. do not launch a story whose scope matches the alert until it's resolved).
    - Review `.orchestrator/announcements/`: when 2+ User Stories (active or finalized) have validated the same Announcement as useful (they replicated or independently confirmed it), promote it to `.orchestrator/components.md` with status `planned`, mark the Announcement as `CONSOLIDATED_INTO_COMPONENTS`, and notify via `SendMessage` the remaining active User Stories whose tags match.
22. **Functional verification (optional, before the reviewer)**: if the story has complex `## Acceptance criteria` (several explicit edge cases, or was flagged as risky in step 10bis), when the implementing agent reports `FINALIZED`, first launch `subagent_type: "worktree-agent-qa"` on the same `WORKTREE` (it doesn't create a new one) with `STORY`, `BRANCH`/`BASE_BRANCH`, `EVENTS`, `CONFIG`. If it finds failing scenarios, these are blocking findings: `SendMessage` to the implementing agent to fix (same mechanism as a `REJECTED` from the reviewer) before continuing. Only once the scenario table is all green, continue to step 23.
23. **Adversarial review**: when the agent (or the subtask mini-plan, or QA if it ran) considers the story ready, launch an `Agent` with `subagent_type: "worktree-reviewer"` (`run_in_background: true`) passing it: `WORKTREE`, `STORY`, `BRANCH`/`BASE_BRANCH`, `DESIGN` (path in `designs/`, with the gate adjustments), `QUALITY_GUIDE`, `CONFIG`, `SIGNALS` (path to `.orchestrator/signals/`, in case it needs to issue one) and `REPORT` = `.orchestrator/reviews/<Story-ID>-R<n>.md` (n = round). Mark the story `in review`.
24. With the reviewer's verdict:
    - `APPROVED` → the story moves to `finalized`.
    - `REJECTED` → triage the findings (discard those that don't apply; the reviewer can also be wrong) and send the confirmed ones as concrete orders to the implementing agent via `SendMessage` (story moves to `fixing`). When it re-reports `FINALIZED`, launch review round R<n+1>.
    - If after **3 rounds** it's still `REJECTED`, do not keep iterating: escalate to the user with the last report.
25. **Queue rotation**:
    - **Subtasks of an ongoing story**: when the active subtask reports `FINALIZED`, and its dependents already have their requirements met, launch the next subtask in the sequence **on the same worktree** (never a new one, never simultaneously with the previous one). Only once the last subtask finishes does the complete story enter functional verification/review (steps 22-24). **If a gate-type subtask (e.g. `[security]`) rejects something** (reports a blocking finding instead of a clean `FINALIZED`), the entire story moves to `fixing` even if other subtasks are already `FINALIZED` — same criterion as a `REJECTED` from the reviewer. The fix may fall on the subtask that caused the problem (e.g. `[backend]`, if the finding is about the code it wrote) or on the gate subtask itself (if the fix is within its own scope, e.g. a narrow security adjustment).
    - **Different User Stories**: when a story moves to `finalized`, a slot is freed → take the next `queued` story whose conflicts are already resolved (its neighbors in the overlap graph finished or aren't running) **and whose `## Depends on` dependencies are already `finalized`** (if it depends on a story still in progress, it keeps waiting even if there's a free slot): provision its worktree (step 13) and launch its agent (step 10bis + 14, including agent selection/prior research if applicable). When a batch of new proposals is complete, run its gate (Phase 3) — if the queue advances one story at a time, the "batch gate" can be for a single proposal; it's still compared against the registry and historical `designs/`.
26. Maintain the registry: when a `FILE_CREATED`/`ARCHITECTURE` event materializes a `planned` component, update its status to `implemented` with the `Reference` (worktree and real path). If an agent reports a component "outside the design", evaluate it against the registry and the selection rules: approve it (and register it) or order the adjustment. A migration created with an identifier different from the one assigned at the gate = immediate correction order.
27. Look for residual divergences between User Stories (from the same batch or different batches) that the gate did not anticipate. If there is a divergence:
    a. Read both real implementations.
    b. Evaluate reuse, maintainability, simplicity, and alignment with the project's architecture rules (see `config.md`). Use the selection rules from `.claude/skills/patterns-and-smells/SKILL.md` as a tiebreaker.
    c. Choose the best one and write `.orchestrator/decisions/DEC-NNN.md` (context, alternatives, criteria, decision, orders).
    d. `SendMessage` to the agent(s) who must migrate, with concrete instructions, citing the DEC-NNN. If the agent already finalized, `SendMessage` still continues it with its context and reopens the review. Update the registry with the winning component.

## Phase 5 — Closure

28. Empty queue + all User Stories `finalized` with `APPROVED` and no pending orders:
    - **Final consistency**: new components coherent across worktrees, migrations with assigned identifiers/order.
    - **Trial-merge (read-only)**: with `git merge-tree` on the base repo, verify that each branch merges clean against the base branch and that the branches don't conflict with each other (test at least the pairs that shared a zone according to the overlap matrix). Conflicts → report them with files and detail (the user decides the actual merge order). If a late divergence appears, go back to Phase 4.
29. Leave `.orchestrator/components.md` free of orphaned `planned` components and the board with all User Stories `finalized` — the starting point of the next orchestration.
30. **Do NOT remove the worktrees**: the work is uncommitted and lives only there. Inform the user how to harvest (open each worktree, commit its branch) and that they can request cleanup of already-harvested worktrees.
31. **Recalculate `.orchestrator/reputation.md`**: for every agent/domain that participated in this orchestration, update the last-20-User-Stories window and the first-round approval rate (counting total rounds in `reviews/<Story-ID>-R*.md`: more than one round, whether due to `REJECTED` or to Phase 6, counts as "not approved in 1st round"). This is a read-only file for the user — this step does not change any decision of this or future orchestrations.
32. Report the final summary to the user: per story → worktree, branch, batch, files touched, review rounds; DEC-NNN; new shared components; migrations created and their order; trial-merge result; verification result for each story.

## Phase 6 — Post-closure correction (optional, after the final summary)

33. Ask with `AskUserQuestion`: *"Do you want to request a change on any already-finalized User Story?"* (Yes/No).
34. If **No** → end the run here.
35. If **Yes**: *"On which User Story?"* (list this run's `finalized` ones) → *"What do you want changed?"* (free text).
36. **Do not repeat Phases -2, -1, 0, 1, 2, or 3** — the worktree, the branch, and the agent that implemented that story already exist (the worktree isn't removed until the user harvests it; see step 30). Reopening configuration/validation/pre-analysis/batch plan/gate would repeat work already resolved for a single change.
37. Reconnect directly at the equivalent of Phase 4: `SendMessage` to the original agent (or the correct agent depending on what the change is about, if the story had `## Subtasks`), on the same worktree, with the user's request as a concrete order — same mechanism already used to fix a `REJECTED`. Mark the story `fixing` on the board.
38. The agent applies the change, reports events, re-verifies. If the story had complex acceptance criteria, run `worktree-agent-qa` again (same criterion as step 22).
39. Run a new round of `worktree-reviewer` (`reviews/<Story-ID>-R<n+1>.md`), explicitly noted as originating from a post-closure user request, not from a reviewer `REJECTED`. If it rejects, same correction cycle as always (maximum 3 additional rounds before escalating).
40. If approved, the story goes back to `finalized`. Update `.orchestrator/reputation.md`: the story moves to "not approved in 1st round" (if it wasn't already) and a row is added to the "Post-closure corrections (Phase 6)" table with the request's detail — never in the findings table, because it wasn't an incident.
41. Go back to step 33 (another change, on this story or another?) — loop until the user says no.
42. When done, rerun the trial-merge (step 28) in case any Phase 6 change affected whether the branches merge clean, and close with the updated final summary.

## Dry-run mode (human checkpoint before implementing)

Phases -1 through 3 run in full for the **first batch** (configuration, validation, pre-analysis, complete batch plan, provisioning, agents' Stage A and all gate work: comparison, unification, DECs, migration identifiers) but the approvals **remain prepared, not sent**. Agents stay waiting after their `DESIGN_PROPOSED` — Stage A doesn't write code.

1. Mark the `designed (dry-run)` status on the board for the first batch's User Stories.
2. Present to the user, in a single report: the **complete batch plan** (all User Stories, not just the first batch), the overlap matrix, each first-batch story's approved design (components, location, approach, with the gate adjustments already applied), the DEC-NNN issued, the assigned migration identifiers/order (if applicable), and a size estimate.
3. **Stop and wait for the user's decision, per story**:
   - **Continue** (possibly with requested adjustments): incorporate their adjustments into the approvals, send them via `SendMessage` to each agent and continue in Phase 4 normally. The following batches go through their own gate when their turn comes (with dry-run active, each gate still stops, unless the user explicitly says "continue without stopping" for the next ones). If the session was cut between the dry-run and the "continue", Phase 0 (resumption) picks up from the board.
   - **Discard**: order the agent via `SendMessage` to clean up (the worktree is empty — Stage A didn't touch any code), remove the worktree (`git worktree remove` + `branch -D`, explicitly authorized by this order), mark the story `aborted` on the board. The `decisions/` and the pre-analysis remain as history.

Use dry-run especially for large, ambiguous User Stories, or ones with many batches: the design costs a fraction of the implementation.

## Reminders

- The orchestrator does NOT edit worktree code, does NOT commit, does NOT push, does NOT create PRs. It only writes `.orchestrator/` and manages worktree infrastructure (create/remove).
- Branches are born with the worktree (the orchestrator creates them during provisioning) — agents do NOT create branches.
- No agent moves to Stage B without explicit approval from the orchestrator.
- NEVER `worktree remove` with uncommitted changes (git blocks it; do not force except for a confirmed discard).
- Do not assume stack, commands, or tools: everything project-specific comes from `.orchestrator/config.md` or the base repo's real rules.
- The generalist (`worktree-agent`) is the default: if no row in `.orchestrator/capabilities.md` clearly applies, the story goes to it — no story is ever left without an agent for lack of a match.
- `worktree-agent-qa` and `research-agent` do not count as "the story's agent" for board purposes — they run on the same worktree/base repo as additional steps, not replacing the implementer.
