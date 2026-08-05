<p align="center">
  <img src="assets/legion-wordmark.png" alt="LEGION" width="360">
</p>

<p align="center"><strong>English</strong> · <a href="README.es.md">Español</a></p>

# Dynamic Multi-Agent System — N User Stories in parallel, any project

<img src="assets/legion-l-mark.png" alt="L" width="18" align="absmiddle"> **EGION** is a multi-agent orchestration system for developing **N User Stories in parallel** with Claude Code, over a single clone of the destination repository. The name isn't decorative: the structure of a Roman legion — a commander who directs without fighting hand-to-hand, centurions with authority delegated within their domain, disciplined formation before advancing, signals that circulate without breaking the chain of command — is, piece by piece, the same problem this system solves.

In practice: **a single base repo + one `git worktree` per story, created on demand**. There is no limit on the number of stories — a **batch scheduler** processes up to `MAX_PARALLEL` simultaneously (how many stories are implemented at once at most, default 3, so as not to overload your machine — the rest wait in queue) and automatically serializes the ones that step on each other. It works on **any project** — stack-specific knowledge (language, framework, build/test commands, migration tooling) lives in a single configuration file, not in the protocol.

An **Orchestrator Agent** (the Claude Code session in this root folder) coordinates **one implementing agent per story** (generalist or specialist, as appropriate) and an **adversarial reviewer** per delivery. Agents do not talk to each other: all coordination goes through the orchestrator — except for two explicit exceptions allowing writes outside the worktree (see "System rules" below).

> **A note on language**:
> - **Commands, file/folder names, event tokens**: always English (`/legion`, `worktree-agent`, `FINALIZED`...) — never changes.
> - **Conversation with the agent** (questions, explanations): follows whatever language you write to it in, automatically — nothing to configure.
> - **Content the agent *persists*** (a story's description, generated docs): follows `.orchestrator/config.md`'s **"Content language"** field — defaults to English, but you can set it to any other language. Independent of the language you chatted in.

## Table of contents

- [Prerequisites](#prerequisites)
- [1. Writing the stories](#1-writing-the-stories)
- [2. Available commands](#2-available-commands)
- [3. Following progress](#3-following-progress)
- [4. If the session gets cut off](#4-if-the-session-gets-cut-off)
- [5. When finished — harvest](#5-when-finished--harvest)
- [System rules](#system-rules-the-important-ones)
- [System anatomy](#system-anatomy)
- [License](#license)

## Prerequisites

1. **A single base repo**: clone the destination project **inside [workspace/](workspace/)** (a single clone, not N). The system detects it on its own: it's the only subdirectory of `workspace/` with `.git` (aside from `worktrees/`, which the system itself creates).
2. **Committed baseline (ideally)**: worktrees are born from the base branch's COMMIT, not from your working tree — **you don't need to manually check out that branch before orchestrating**. If the base repo is sitting on any branch other than the base one, there's nothing to prepare. If it **is** sitting on the base branch and has uncommitted changes, `/legion` doesn't abort outright: it asks whether to continue anyway (that change stays out of all worktrees — useful for a file that is deliberately never committed, e.g. a local `.properties` file), discard it, or abort the run. `/legion` also updates the base branch against the remote (`fetch`) before starting, and warns you if it's out of date.
3. **Stories written** in `requirements-to-work.md` — **as many as you want, no limit**.
4. **Project configuration** in `.orchestrator/config.md`: if this is the first time you run the system on this repo, `/legion` investigates the code and asks you whatever is missing (base branch, branch prefix, `MAX_PARALLEL`, verification commands, migration tooling, local files to copy to each worktree, etc.) and saves it for future runs.

## 1. Writing the stories

### If you don't have stories yet, only an objective: `/new-objective`

If what you have is a high-level intention ("reduce checkout time by 30%") instead of scoped-out stories, `/new-objective` investigates the base repo, proposes a split into concrete stories (confirmed with you), persists it in `.orchestrator/objectives/OBJ-<NNN>.md`, and specifies each resulting story with the same depth as `/new-story` — saving them to `requirements-to-work.md` as you confirm each one. `/legion` also detects an `# OBJECTIVE` block pasted directly into the file and offers to run this same breakdown right there.

### Recommended option for a single story: `/new-story` (assistant)

The skill guides you through creating each story **validated against the real code**:

1. Asks you for the **ID** (e.g. `PROJ-100`) and the **description** in your own words.
2. Analyzes the description against the base repo: maps which modules/services/endpoints/tables it touches, detects whether something already exists, and looks for gaps (edge cases, states, permissions, idempotency, migrations). If the zone already caused an incident before, `.orchestrator/lessons-learned.md` brings it up.
3. **Asks you whatever doesn't add up**, citing the code that motivates each doubt, and flags possible bugs from applying the description as-is.
4. With your answers, it drafts the final story (description + acceptance criteria + definitions taken + impact zone) and leaves it as a preview in `.orchestrator/preview-story-<ID>.md` for you to read/edit comfortably in your editor — only upon your confirmation (a question with options, not text to type) does it apply it to `requirements-to-work.md` and delete the preview.

Stories produced by `/new-story` arrive better specified at the design gate: fewer questions from agents, fewer correction rounds.

### Manual option

Edit [requirements-to-work.md](requirements-to-work.md). Mandatory format — blocks separated by `---`, header `# Story <ID>`:

```md
# Story PROJ-100

As a user I want ... in order to ...
Acceptance criteria: ...

## Depends on (optional)
PROJ-099   # not launched until PROJ-099 is finalized — business dependency, not code

## Subtasks (optional)
1. [backend] Export endpoint
2. [security] Review of which fields are exportable (depends on 1)

---

# Story PROJ-101

...
```

**No limit on quantity.** If two stories step on each other in code, the system automatically serializes them into different batches — you don't need to coordinate it yourself. `## Depends on` is different: an explicit business dependency, not an overlap. `## Subtasks` is for the specific case where a story mixes domains that need their own approval gate (e.g. a security review that can reject the story on its own) — they run in sequence, on the same worktree.

## 2. Available commands

All of them are run in the Claude Code session in this root folder:

| Command | What it does |
|---------|----------|
| `/new-objective` | Splits a high-level objective (no stories yet) into several concrete stories, confirmed one by one |
| `/new-story` | Assistant for creating a story: analyzes your description against the code and asks whatever doesn't add up before writing it |
| `/legion` | Full run: batches, worktrees, design, implementation, review, until the queue is empty |
| `/legion dry-run` | Runs through the first batch's gate and **stops**: leaves the plans as reviewable files in `.orchestrator/designs/` and waits for your verdict per story (approve / adjust / discard) before implementing |
| `/legion MAX_PARALLEL=<n>` | Adjusts the **ceiling** of agents implementing at once — if fewer stories are available than `<n>`, fewer run, the number is never forced (if you don't pass it, it uses the value saved in `config.md`, default 3) |
| `/investigate` | Launches the research agent (spike mode) on a specific technical question, with no worktree or implementation — publishes the finding as an Announcement |
| `/new-lesson` | Records a real incident (business rule that wasn't accounted for) in `.orchestrator/lessons-learned.md`, so future stories on the same zone find it before repeating it |

Recommendation: **dry-run for large, ambiguous stories, or ones that could overlap** — reviewing several designs on paper costs minutes; re-implementing costs hours.

### What happens under the hood (summary)

0. **Configuration**: if `.orchestrator/config.md` isn't resolved for this project, the repo is investigated and you're asked whatever is missing (stack, commands, migrations, branches, `MAX_PARALLEL`).
1. **Validation**: single base repo, up to date against the remote (`fetch`, with a warning if out of date), and clean if sitting on the base branch, stories parsed (no limit on quantity).
2. **Pre-analysis and batch plan**: what each story touches is estimated and the conflict graph is built (plus `## Depends on` dependencies as directed edges); the ones that step on each other go into different batches (automatic serialization). **The plan is shown to you before launching.**
3. **Agent selection**: per story, the orchestrator decides whether it's taken by the generalist (`worktree-agent`) or a specialist (frontend, security, data, docs — see `.orchestrator/capabilities.md`), or whether it's split into `## Subtasks` when a domain needs its own approval gate. If the zone is considered risky, `research-agent` runs first in prior-research mode.
4. **Provisioning**: for each story in the active batch, the orchestrator creates its `git worktree` with its branch and copies the local files the worktree doesn't bring (project rules, docs).
5. **Design gate per batch**: each agent proposes its design on paper and waits. The orchestrator compares the proposals together and against the architectural memory (`components.md` + designs from previous batches), assigns migration names/order (if the project uses them) with a global counter, and only then approves. No one writes code without approval.
6. **Implementation**: each agent implements its story respecting the project's rules and the patterns/code-smells guide (plus `security-guide`/`data-guide` if it's the corresponding specialist), with tests, reporting every file touched. If it discovers something urgent or reusable along the way, it shares it immediately with other active stories via **Signals** (alerts with expiration) or **Announcements** (knowledge on the fly) — without waiting for the next gate.
7. **Functional verification (optional)**: for stories with complex acceptance criteria, `worktree-agent-qa` derives real scenarios and runs them before passing to the reviewer.
8. **Adversarial review**: when each story finishes, an independent reviewer re-runs the checks, audits the architecture rules and the smells checklist. Rejected → the agent corrects (max. 3 rounds, then it escalates to you).
9. **Queue rotation**: story approved → a slot frees up → the next one in the queue enters (respecting `## Depends on`) with its own worktree.
10. **Closure**: final consistency + **trial-merge** (`git merge-tree`, read-only) to verify all branches merge against the base branch and against each other + recalculates `.orchestrator/reputation.md`.
11. **Post-closure correction (optional)**: asks if you want to request a change on any already-finalized story — if so, reconnects to the original agent without repeating configuration/design, runs a new review round, and returns to `finalized`.

## 3. Following progress

All the state lives in [.orchestrator/](.orchestrator/):

- **[config.md](.orchestrator/config.md)** — resolved parameters of the destination project (base repo, stack, commands, migrations, `MAX_PARALLEL`). Filled in only the first time.
- **[capabilities.md](.orchestrator/capabilities.md)** — registry of available agent types (generalist + specialists) and when each one applies.
- **[assignments.md](.orchestrator/assignments.md)** — the board: story, worktree, branch, batch, status (includes `queued`), last activity, review round. Below it: overlap matrix and batch plan.
- **designs/`<Story-ID>`.md** — the design of each story approved at the gate. In dry-run they stay at `PENDING APPROVAL`: **these are the files you review** to approve or discard each plan (you can annotate adjustments directly in the file).
- **events/`<Story-ID>`.md** — real-time log for each agent (files created/modified, refactors, decisions).
- **reviews/`<Story-ID>`-Rn.md** — adversarial reviewer reports per round.
- **decisions/DEC-NNN.md** — architectural decisions when two stories solved the same thing differently.
- **[components.md](.orchestrator/components.md)** — catalog of components reusable across stories/batches (consulted before creating anything new).
- **signals/`<ID>`.md** — priority alerts between active stories, with expiration if no one reinforces them; any agent writes them directly.
- **announcements/`<ID>`.md** — reusable knowledge shared on the fly between active stories, before the gate consolidates it into `components.md`.
- **[lessons-learned.md](.orchestrator/lessons-learned.md)** — real incidents from business rules that weren't accounted for, permanent across runs (fed by `/new-lesson`).
- **objectives/OBJ-`<NNN>`.md** — breakdown of a high-level objective into stories, with its reasoning (generated by `/new-objective`).
- **[reputation.md](.orchestrator/reputation.md)** — read-only audit by agent/domain (first-round approval rate, post-closure findings, post-closure corrections). The orchestrator never consults it to decide anything — it's so you know what to adjust in the system.

## 4. If the session gets cut off

Nothing is lost. Run `/legion` again: it detects the halfway-done run on the board, reconstructs the context from the events, the designs, and `git worktree list` (git is the source of truth), and **resumes** only what's incomplete (the agents continue on their existing worktrees, without redoing what's done) and reassembles the queue of pending batches.

## 5. When finished — harvest

Each story remains in its worktree with the changes **uncommitted** on its branch. To review or edit a story: **open its folder** (`workspace/worktrees/<Story-ID>/`) in your editor — you're already on the branch (don't try to check out that branch from anywhere else: git blocks it because it's checked out in the worktree). By design, no agent commits, pushes, or creates PRs — that's in your hands:

```bash
cd workspace/worktrees/<Story-ID>
git status                    # review the work
# commit when you're satisfied (the branch already lives in the base repo)
# push / PR from wherever you prefer
```

**Important**: don't remove a worktree without committing — the work lives only there. After harvesting, ask the orchestrator to clean up (`git worktree remove` + delete the branch if it already merged) or do it yourself.

## System rules (the important ones)

- The orchestrator **never** edits code in the worktrees (it only manages creating/removing them); it only writes in `.orchestrator/`.
- Agents work **only** in their own worktree; branches are created by the orchestrator (born with the worktree). They can write Signals/Announcements in `.orchestrator/` to notify other active stories — that's depositing information into the shared environment, not coordinating directly with another worktree.
- **Two explicit exceptions** for writing outside the worktree: `worktree-agent-docs` writes to `docs/<base-repo>/` instead of the destination repo (always Markdown); `worktree-agent-data` leaves the migration in the worktree, but any auxiliary backfill/rollback script goes in `scripts/<base-repo>/`. Both folders are only created the first time that agent runs — they don't exist before then. No other agent leaves its worktree.
- No story closes without the adversarial reviewer's `APPROVED`.
- No one commits/pushes/creates PRs — you harvest.
- No tools or checks are assumed that aren't confirmed in `.orchestrator/config.md` or in the base repo's real rules.
- `.orchestrator/reputation.md` is read-only for you — it never changes the orchestrator's behavior (there is no "lightweight gate" of any kind in this system).

## System anatomy

```
<root>/
├── README.md                        ← you are here
├── LICENSE.md                       # System usage license
├── CLAUDE.md                        # Orchestrator Agent protocol
├── requirements-to-work.md          # Your stories (N, no limit) or a high-level # OBJECTIVE
├── assets/                          # Brand (wordmark, mark)
├── docs/<base-repo>/                # Documentation generated by worktree-agent-docs (always .md)
├── scripts/<base-repo>/             # Auxiliary scripts from worktree-agent-data (backfill/rollback)
├── workspace/
│   ├── README.md
│   ├── <base-repo>/                 # Single real clone of the destination project
│   └── worktrees/<Story-ID>/           # One worktree per story (created by the orchestration)
├── .claude/
│   ├── agents/
│   │   ├── worktree-agent.md               # Generalist implementer (default)
│   │   ├── worktree-agent-frontend.md      # UI/interface specialist
│   │   ├── worktree-agent-security.md      # Audit/hardening specialist
│   │   ├── worktree-agent-data.md          # Data modeling/migrations specialist
│   │   ├── worktree-agent-qa.md            # Post-implementation functional verification
│   │   ├── worktree-agent-docs.md          # Documentation specialist
│   │   ├── research-agent.md               # Spikes + prior research (no worktree, read-only)
│   │   └── worktree-reviewer.md            # Adversarial reviewer (read-only)
│   └── skills/
│       ├── legion/               # /legion and /legion dry-run
│       ├── new-objective/          # /new-objective — splits a high-level objective into several stories
│       ├── new-story/                # /new-story — assistant for writing stories validated against the code
│       ├── new-lesson/           # /new-lesson — records a real incident
│       ├── investigate/              # /investigate — standalone spike mode
│       ├── patterns-and-smells/       # Patterns + code smells guide, adapted to the destination project
│       ├── security-guide/          # OWASP checklist for worktree-agent-security
│       └── data-guide/              # Migrations/modeling checklist for worktree-agent-data
└── .orchestrator/                    # State and communication (config, board, events, reviews, decisions, reputation)
```

Full protocol detail: [CLAUDE.md](CLAUDE.md) (orchestrator), [.orchestrator/README.md](.orchestrator/README.md) (format of the event bus and of each artifact).

## License

See [LICENSE.md](LICENSE.md) for the full text. In summary: **free use, including internal use
within companies**; **prohibited**: redistributing the code, selling it, creating another product from
it, or incorporating it into other software without authorization — reviewing/showcasing the project (with a link to
the official source) and forking to contribute via PR are explicitly allowed.
