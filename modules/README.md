# Modules — external agents that plug into an orchestration

A **module** is a Claude Code project (an agent + optional skills), versioned in its own
external repo, that "connects" to Legion to verify a User Story (`type: gate`), produce a
standalone artifact from the base repo (`type: generator`), or write code directly in a story's
worktree as its author (`type: implementer`). It is code Legion does not own or edit — the same
trust posture already applied to the base repo clone in `workspace/<base-repo>/`.

This folder is self-contained: everything module-related — the external clones AND the
metadata Legion generates about them — lives under `modules/`, separate from
`.orchestrator/` (which is the memory of *story* orchestration, not of modules).

## Layout

```
modules/
├── README.md        # this file
├── registry.md       # registry of installed modules + their state (installed/deprecated/uninstalled)
├── pending/           # transient risk previews from /new-module, deleted once the user decides
│   └── <module-name>.md
├── installed/         # the external repos themselves — NEVER edited by hand, gitignored
│   └── <module-name>/
│       ├── module.md                  # manifest (see format below)
│       ├── .claude/agents/<agent>.md  # the agent(s) the module brings
│       └── .claude/skills/<skill>/    # optional module-specific guide
├── reports/            # results of a module run, namespaced by module
│   └── <module-name>/
│       ├── <Story-ID>-Rn.md   # type: gate — one file per rejection round
│       └── <timestamp>.md     # type: generator — no Story-ID/round, see module.md's `output`
└── output/             # stable artifacts a type: generator module produces, gitignored (regenerable)
    └── <module-name>/
        └── <base-repo-name>/  # namespaced per destination project — Legion is multi-project
```

`installed/`, `pending/`, `reports/` are exclusive orchestrator write zones (same "exclusive
zone" criterion `.orchestrator/` already uses) — no other agent writes here directly. The one
exception, same as everywhere else in Legion: the module's own agent writes **inside its own
`modules/installed/<name>/` clone** during development of the module itself (that's the
module author's business, done outside of any orchestration run) — never during a run.

## Launch mechanics (how the orchestrator actually runs a module's agent)

Confirmed by real validation (Fase G/Fase I, `mejoras-pendientes-modules.md`, item 3) — two
things that aren't obvious from the manifest format alone:

- **`subagent_type` can't resolve `modules/installed/<name>/.claude/agents/<agent>.md`
  directly** — the `Agent` tool only resolves agents already declared in Legion's own
  `.claude/agents/`, there's no dynamic registration for a module's `agent_entrypoint`. The
  orchestrator launches with `subagent_type: "general-purpose"` and **embeds the module's full
  agent file content verbatim in the prompt**, alongside `WORKTREE`/`STORY`/`MODULE_RULES`/etc.
  as usual.
- **Never pass `isolation: "worktree"` when launching a module's agent** — that `Agent`-tool
  parameter creates its own temporary worktree, separate from the one Legion already provisioned
  with `git worktree add` (or, for `type: generator`, separate from wherever `scope` points). The
  `WORKTREE` path already given in the prompt is the correct, isolated location — passing
  `isolation: "worktree"` on top of it makes the module work in the wrong place instead.

## Installing / removing a module

- **`/new-module <repo-or-path>`** — clones the module, validates its manifest, runs a
  best-effort risk scan (tools classification, network patterns, dependency vulnerabilities),
  shows a preview, and only registers it once the user accepts.
- **`/module uninstall <name>`** — marks it `deprecated` if any active story still references
  it, or removes it for good (with confirmation) once nothing does.
- **`/module activate <name>`** — reverses a `deprecated` module back to `installed` (does
  **not** work on `uninstalled` — that needs a fresh `/new-module`).
- **`/run-module <name> [worktree:<Story-ID>]`** — invokes a `type: generator` module
  on-demand, outside the story cycle.

## `module.md` format

Frontmatter YAML, `snake_case`, one comment per field — same convention already used by
`.orchestrator/config.md`. A ready-to-copy, fully commented template for both `type`s lives in
the official [`legion-modules`](https://github.com/luk-s12/legion-modules) repo at
`_template/module.md` (agent stub at `_template/.claude/agents/template-agent.md`) — module
authors are expected to start there rather than reconstruct the shape from this document. If a
cloned module's `module.md` still has unresolved `<...>` placeholders from that template,
`/new-module` doesn't reject it outright: it runs an interactive autoconfig assist to fill them
in before validation (see `new-module/SKILL.md`, Step 1bis). Which fields are required depends on
`type`:

- **Always**: `type`, `tools`, `agent_entrypoint`.
- **`type: gate`**, additionally: `valid_stages`, `default_stage`, `default_activation`,
  `writes_to` (the key must exist even if its value is empty), `blocking`, and optionally
  `max_rejection_rounds`, `max_concurrent`, `requires_local_config`, `provides_skills`,
  `provides_rules` (see "Skills and rules a module brings" below).
- **`type: generator`**, additionally: `output`, `scope`. None of the `gate`-only fields apply —
  this includes `provides_skills`/`provides_rules`: a `generator` never enters the story/
  `worktree-agent` cycle, so there's no consumer for either field. `/new-module` rejects them
  outright on this `type`.
- **`type: implementer`**, additionally, optionally: `provides_skills`, `provides_rules` (its
  own agent reads them directly from its own clone — no injection into another agent's prompt
  needed, but the orchestrator still needs them declared, structured, to negotiate/embed/detect
  conflicts the same way it does for `gate`). **None of `writes_to`, `blocking`,
  `valid_stages`/`default_stage`, `max_rejection_rounds`, `max_concurrent` apply** — an
  `implementer` doesn't gate at a stage, it authors, over the whole worktree (see "`type:
  implementer` — a module that writes code" below); `max_concurrent` specifically has no
  semaphore to plug into for this `type` (it's derived, for `gate`, from
  `modules/reports/<name>/` entries with no final verdict — an `implementer` subtask never
  produces a report in that shape), so it's rejected rather than accepted-but-ignored.
  `/new-module` rejects any of those five fields being present on this `type`. **`default_activation`
  can only be `opt-in`** on this `type` — `always` is rejected outright: a third-party module
  with real write access never replaces the native implementer silently across every story of
  every project, it's always an explicit choice per story.

### Example — `type: gate`

```yaml
---
type: gate                                # gate | generator | implementer
valid_stages:                             # stages this module technically supports (one or more) — gate only
  - post-finalized
default_stage: post-finalized             # used when the story doesn't specify a stage — gate only
default_activation: opt-in                # opt-in (needs ## Modules in the story) | always — gate only
tools:                                     # the orchestrator NEVER extends this list when launching
  - Bash
  - Read
  - Grep
  - Glob
  - Write
agent_entrypoint: .claude/agents/e2e-runner.md
writes_to: e2e/                           # path INSIDE the worktree only (empty if it doesn't touch it)
max_rejection_rounds: 3                   # never looser than max_correction_rounds in config.md
max_concurrent: 1                         # default, if omitted: 1 if writes_to is non-empty, unlimited if empty
requires_local_config: true               # if true, /new-module checks for .env.<base-repo>.local (existence only)
blocking: true                            # true = can REJECTED like the reviewer; false = goes to reviewer's ADVISORY
provides_skills:                          # optional — paths inside the module's own clone, SKILL.md format
  - skills/oop-practices/SKILL.md
provides_rules: rules.md                  # optional — path inside the module's own clone, itemized with rule_id
---

# Module: integration-testing
```

## Skills and rules a module brings (`provides_skills`/`provides_rules`)

A `type: gate` module can, in addition to (or instead of) verifying a story, contribute content
that the `worktree-agent` (or specialist) implementing a story reads directly — **only for the
story that references the module**, never fused into this project's own conventions, never
applied to a story that doesn't ask for it.

- **`provides_skills`** — procedural guidance (a checklist, a How-to), in the exact same format
  as `.claude/skills/<name>/SKILL.md`. Referenced **wholesale** by the implementing agent, same
  authority as `QUALITY_GUIDE`/`SECURITY_GUIDE`/`DATA_GUIDE` today. Never negotiated item by
  item — the existing convention cross-check at the design gate (`legion/SKILL.md`, step 19bis)
  is the filter: an inherited detail with no reason to exist in this project doesn't enter a code
  fragment just because a module's skill suggested it.
- **`provides_rules`** — punctual, rule-shaped statements (closer to an entry of
  `architecture_rules_location` than to a checklist) that CAN contradict a real rule of the
  destination project, so they go through explicit negotiation first — see "Negotiation of
  `provides_rules`" below.

Neither field ever requires `Write`/`writes_to` — both are content read via `Read` by a native,
trusted agent. A module that only declares these two fields (no gate function at all) is still a
valid `type: gate` module: it simply never produces a `modules/reports/<name>/<Story-ID>-Rn.md`
verdict, only augments.

### `rules.md` format (what `provides_rules` points to)

A simple itemized list, one entry per rule, each with a **stable `rule_id`** the module author
defines (never invented by Legion) plus its statement:

```md
### no-mutable-public-fields
Public fields must never be mutable — expose a getter and a dedicated setter/mutator method
instead of a bare public field.

### max-function-length
A function longer than 40 lines must be split — extract named helpers for each logical step.
```

`rule_id` must be unique within the file — `/new-module` rejects a `rules.md` with duplicates or
with an entry missing a `rule_id` (Step 2).

### Referencing a module activates all of it

Referencing a module in a story's `## Modules` — with any stage, or with no stage at all —
activates **everything it provides for that story at once**: the gate at its declared/default
stage, AND its full `provides_skills`/`provides_rules` augmentation. There is no separate syntax
to opt into "only augmentation, without the gate" — same YAGNI criterion that ruled out a
dedicated `type: augment` (see `module-skills-rules-design-analysis.md`).

### Negotiation of `provides_rules` — once per project, never at install time

A negotiation verdict ("does this rule of the module apply to THIS project?") is information
about the pair **(module, project)**, not about the module alone — `modules/registry.md`/
`modules/installed/` are the user's personal library, reusable against different projects over
time (Legion is explicitly multi-project). Negotiating at `/new-module` install time would be
premature: at that point it isn't known yet which project(s) the module will be used against.

So negotiation is **lazy, per project**: it's triggered by `/legion`, the first time a story of
the **current** `base_repo` (per `.orchestrator/config.md`) references a module with
`provides_rules` — see `legion/SKILL.md`, Phase 2, "Negotiation of modules". A single
`AskUserQuestion` (multiSelect, one call, regardless of how many rules the module proposes) asks
accept/reject for every rule, with a prior best-effort cross-check (the orchestrator reading and
reasoning against `architecture_rules_location`/`patterns_guide_location` — not a grep scan)
flagging any rule that looks like it contradicts a real rule of this project.

The verdict is persisted, namespaced per project (never shared across different `base_repo`
values, never cross-read):

```
.orchestrator/module-rules/<base-repo-name>/<module-name>.md      # rule_id | statement | verdict | decided by | date
.orchestrator/module-rules/<base-repo-name>/_conflicts.md         # resolutions to A-vs-B rule conflicts within a story
```

Once a `(base_repo, module)` pair has been negotiated, it's never asked again for that project —
new stories of the same project just read the file. A different project (a different `base_repo`
this same Legion instance points to over time) negotiates independently, from scratch, against
its own real rules.

- **Re-negotiation by version**: when a module is updated and its `rules.md` changes, only the
  `rule_id`s that are new or whose statement changed get re-negotiated (per project that already
  negotiated them) — the rest keep their existing verdict. See `legion/SKILL.md`, step 22bis
  (version/contract check).
- **Manual re-negotiation**: `/module renegotiate <name> [rule_id]` reopens the question for the
  **current** project without waiting for a version change — see `module/SKILL.md`.
- **No retroactivity**: re-negotiating (by version or manually) never reopens a story already
  `finalized` — its `designs/<Story-ID>.md` stays as historical record. If the user wants to
  apply a new verdict to a closed story, that's Phase 6 (post-closure correction), the existing
  channel for any change on a `finalized` story.

### Conflict between two rules active on the same story

If a story has 2+ modules with `provides_rules` active (or a module's rule conflicts with a real
rule of the project — see `plan-module-implementer.md` for the `core`-vs-module case), the design
gate (`legion/SKILL.md`, step 19bis) resolves it with `AskUserQuestion` — three possible
resolutions: rule A wins, rule B wins, or apply both (when they only looked contradictory in the
textual detection, not in practice). The resolution is persisted in `_conflicts.md` above,
namespaced per project, so the same pair never gets asked twice in the same project — each row
also records whether the two rules were **mutually exclusive** (`apply both` was structurally
impossible, e.g. one requires what the other forbids) or not (a style preference between two
options that genuinely could have coexisted): `rule A | rule B | resolution | mutually exclusive?
| decided by | date`. That distinction matters if either rule's statement changes later — a
preference-based resolution is worth revisiting, a structurally-impossible one isn't.

### Where the accepted rules end up

The accepted rules relevant to a story are embedded — as real text, not a pointer — in a
`## Module rules applied` subsection of `designs/<Story-ID>.md` at the design gate (Stage A). This
keeps the design self-contained: `worktree-reviewer` audits against it without needing the module
to still be installed.

### Example — `type: generator`

```yaml
---
type: generator
output: modules/output/<module-name>/<base-repo-name>/   # namespacing added automatically by the orchestrator
scope: base-repo                                          # base-repo | worktree — what it runs against by default
tools:
  - Read
  - Grep
  - Glob
  - Write
agent_entrypoint: .claude/agents/api-collection-generator.md
---

# Module: api-collections
```

### Example — `type: implementer`

```yaml
---
type: implementer
tools:
  - Read
  - Grep
  - Glob
  - Write
  - Edit
  - Bash
agent_entrypoint: .claude/agents/code-quality-writer.md
provides_skills:                          # optional — same format as gate's
  - skills/oop-practices/SKILL.md
provides_rules: rules.md                  # optional — same format as gate's
---

# Module: code-quality-pro
```

## `type: implementer` — a module that writes code

Unlike `gate` (verifies, can reject) and `generator` (produces a standalone artifact), a
`type: implementer` module's own agent **writes code directly in a story's worktree**, as its
author — the same role a native `worktree-agent` plays, but sourced from a third-party clone.

- **No `writes_to`**: there's no smaller zone to offer than the whole worktree, so this `type`
  doesn't declare one. Isolation is verified the other way around — see "Isolation check for
  `type: implementer`" below for the full mechanics; short version: anything touched outside its
  own worktree is treated as an incident, same severity as any other isolation violation, except
  where the evidence is genuinely ambiguous (a sibling story's worktree, actively worked on in
  parallel at the same time — see below for why that case can't use a plain before/after diff).

### Isolation check for `type: implementer`

An `implementer` has real `Write`/`Edit` over its **entire** assigned worktree — the widest grant
any module gets, with no technical sandbox behind it (same disclosed limitation as everywhere
else in this trust model). What Legion verifies after the fact has to be split by what's actually
checkable, not stated as a single blanket guarantee:

- **`workspace/<base-repo>`** (the single base clone): before/after `git status --porcelain`. Any
  diff is a hard incident — nothing legitimate touches this clone while a story is being
  implemented (same pattern already used for `type: generator` with `scope: base-repo`).
- **Every *other* worktree that exists at launch time, with no agent currently active on it**
  (per `assignments.md` — `finalized`/`queued`/`aborted`, same "no active agent" criterion
  `/run-module`'s `worktree:<Story-ID>` targeting already uses): checked exactly as hard as the
  base repo — before/after `git status --porcelain`, any diff is an incident. Nothing legitimate
  should be touching an idle worktree either.
- **Every *other* worktree with an agent actively running on it during the same window** (a
  sibling story genuinely being worked on in parallel — the normal case whenever
  `MAX_PARALLEL > 1`, default 3): **cannot** be checked with a plain before/after diff. That
  sibling's own agent is *expected* to change its own worktree during this exact window — a diff
  alone can't distinguish "the module escaped its own worktree" from "the sibling story simply
  progressed," because `git status` reports accumulated state, not which process caused it. A
  check that ignored this would either misfire constantly (false incidents on completely normal
  parallel work) or get silently disabled/ignored in practice to stop the noise — both worse than
  admitting the gap. Instead: if that worktree's status changed during the window, cross-reference
  the changed paths against that sibling story's own `.orchestrator/events/<Story-ID>.md`
  (`FILE_CREATED`/`FILE_MODIFIED` events timestamped inside the same window). Fully explained by
  its own reported events → nothing to do, expected. Anything left unexplained → **not** an
  automatic incident (the evidence is ambiguous, unlike the two hard cases above) — log it as a
  `LOW`-severity note in `modules/reports/<module-name>/<Story-ID>-Rn.md` for the orchestrator to
  triage manually, same posture as any other ambiguous finding in this system.
- A worktree that didn't exist yet at launch time is out of scope by construction — the module
  only ever runs against its own, already-provisioned worktree.
- **Never auto-selected**: an `implementer` module only ever runs because a story explicitly asks
  for it — `## Subtasks: 1. [implementer:<module-name>] <description>` in
  `requirements-to-work.md` (see `new-story/SKILL.md` and `CLAUDE.md`, "Agent selection per
  story"). The orchestrator's automatic agent-selection rule only ever picks between native
  agents — it never reaches for an installed module on its own.
- **Same design gate, no shortcuts**: the module's agent submits its own `DESIGN_PROPOSED` for
  its subtask and goes through the same barrier as any other implementer — no exception for being
  a module.
- **`provides_skills`/`provides_rules` still apply**, same negotiation/persistence/embedding as
  for `gate` — the difference is the module's own agent also reads them directly from its own
  clone (it doesn't need them injected the way an augmenting `gate` module's target agent does).
  They're still declared and structured so the orchestrator can negotiate, embed in the design,
  and detect conflicts (see "Conflict between two rules active on the same story" above — the
  `core`-vs-module case, where `core` is a reserved value standing for a real rule of the
  project's own `architecture_rules_location`/`patterns_guide_location`, is exactly what an
  `implementer`'s own rules most often collide with).
- **Reviewer, unchanged**: `worktree-reviewer` audits the module-authored code exactly like any
  other, against `designs/<Story-ID>.md` (which already has any conflict pre-resolved in
  `## Module rules applied`) — no special finding type for "written by a module".
- **Risk, disclosed, not new in kind**: this `type` doesn't get real technical sandboxing any more
  than `gate`/`generator` do (see `feature/sandboxing-modulos-futuro.md` for that limitation as a
  whole) — the difference is magnitude, not category: real `Write`/`Edit` over a whole worktree
  instead of read-beyond-declared-scope. The design gate and `worktree-reviewer` remain the only
  real defense, same as for a native agent that might also write bad code.

## Trust model — what's validated and what isn't

`/new-module` validates **form**, not intent: required fields per `type`, `writes_to`/`tools`
consistency, a cross-check between the declared `tools` and what the agent's own frontmatter
actually uses, a best-effort scan for outbound network patterns and known-vulnerable
dependencies. None of this is a technical sandbox — if `tools` includes `Bash`, the module can
read (not just write) anything the process can reach, regardless of `writes_to`. That's
disclosed explicitly in the risk preview; the decision to accept it is always the user's, never
automatic.
