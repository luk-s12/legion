# Modules — external agents that plug into an orchestration

A **module** is a Claude Code project (an agent + optional skills), versioned in its own
external repo, that "connects" to Legion to either verify a User Story (`type: gate`) or
produce a standalone artifact from the base repo (`type: generator`). It is code Legion does
not own or edit — the same trust posture already applied to the base repo clone in
`workspace/<base-repo>/`.

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
  `max_rejection_rounds`, `max_concurrent`, `requires_local_config`.
- **`type: generator`**, additionally: `output`, `scope`. None of the `gate`-only fields apply.
- **`type: implementer`**: not supported yet — future extension, no contract defined.

### Example — `type: gate`

```yaml
---
type: gate                                # gate | generator (implementer: not supported yet)
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
---

# Module: integration-testing
```

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

## Trust model — what's validated and what isn't

`/new-module` validates **form**, not intent: required fields per `type`, `writes_to`/`tools`
consistency, a cross-check between the declared `tools` and what the agent's own frontmatter
actually uses, a best-effort scan for outbound network patterns and known-vulnerable
dependencies. None of this is a technical sandbox — if `tools` includes `Bash`, the module can
read (not just write) anything the process can reach, regardless of `writes_to`. That's
disclosed explicitly in the risk preview; the decision to accept it is always the user's, never
automatic.
