# Orchestrator state

Legion is multi-project by default. `.orchestrator/projects.yml` is the sole project configuration
authority; each project's memory lives under `.orchestrator/projects/<project>/`.

## Global files

- `projects.yml`: versioned project catalog. An empty or missing catalog never defaults to
  first-project registration by itself — apply exclusively `CLAUDE.md`'s project-resolver table
  under "Required bootstrap for an older installation" (empty and missing resolve differently) and
  `/legion-upgrade`.
- `projects-schema.md`: compact schema, validation and path-containment rules.
- `capabilities.md`: global registry of Claude agent roles.
- `projects/`: one `<project>/` memory directory per registered project, plus a `.gitkeep`. There
  is no on-disk template — the skeleton below is the authoritative source, materialized fresh when a
  project is registered or migrated with `/legion-upgrade`.
- `runtime-contract/README.md`: minimal catalog/project/story locking contract.
- `runtime/`: ignored ephemeral owners and story claims.

## Project memory skeleton

Registering a project (or migrating one with `/legion-upgrade`) creates this exact tree under
`.orchestrator/projects/<project>/`. Each of the five Markdown files starts with only its title
header (`# <name> — <project>`) and a one-line purpose; every directory starts empty (tracked with
a `.gitkeep`).

```text
.orchestrator/projects/<project>/
├── assignments.md          # derived scheduling board
├── components.md           # orchestrator-owned reusable component registry
├── lessons-learned.md      # permanent business-rule incidents
├── metrics.md              # derived duration / token-consumption history
├── reputation.md           # derived review audit
├── announcements/          # <ID>.md horizontal research findings
├── decisions/              # DEC-NNN.md architectural conflict decisions
├── designs/                # <Story-ID>.md approved design and dry-run state
├── events/                 # <Story-ID>.md append-only agent progress
├── module-rules/           # per-project accepted module rules
├── objectives/             # /new-objective breakdown memory
├── reviews/                # <Story-ID>-*.md design / code review reports
├── signals/                # <ID>.md horizontal signals
└── stories/                # /new-story working drafts (not schedulable)
```

## Project memory

- `assignments.md`: derived scheduling view. Rebuild from Git, requirements, claims and events.
- `components.md`: orchestrator-owned reusable component registry.
- `lessons-learned.md`: permanent incidents for the selected codebase.
- `metrics.md` and `reputation.md`: derived, informational audits.
- `events/<Story-ID>.md`: append-only agent progress.
- `designs/<Story-ID>.md`: approved story design and dry-run state.
- `reviews/<Story-ID>-*.md`: design/code review reports.
- `decisions/DEC-NNN.md`: architectural conflict decisions.
- `signals/<ID>.md` and `announcements/<ID>.md`: unique horizontal records.
- `objectives/`, `stories/`, `module-rules/`: project-scoped command memory.

## Authority and writes

Git owns repos/worktrees/branches/diffs; `requirements/<project>.md` owns story definitions; a
story claim owns the active writer; events own progress evidence. Assignments never overrides these
sources.

The one global metadata mutex retains the historical `catalog.lock` path and protects exactly two
shared surfaces: `.orchestrator/projects.yml` registration/bootstrap/replacement and serialized
`modules/registry.md` replacement. It is not another lock type. A project mutex protects brief shared writes and story claim changes. Shared replacements use
candidate -> verify -> rename -> reread. Agents receive absolute resolved paths and do not manage
claims.

A batch is only a planning view. Each story reservation independently revalidates dependencies,
conflicts and `max_parallel` while holding the project mutex.

Signals and Announcements are the only agent-authored shared records besides assigned event/review
files. The orchestrator decides promotions and project decisions under the project mutex.
