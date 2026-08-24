# Agent capabilities registry

Catalog of the available implementing agent types, with which domain each one covers and
when it's appropriate to use. The orchestrator consults it during `/legion` "Plan view" to decide
which `subagent_type` to launch for each story — instead of assuming it's always the same one.

**Selection rule** (full detail in `CLAUDE.md`, section "Agent selection per story"):

1. Story with a normal combination of domains → **`worktree-agent`** (generalist, default).
2. Story purely about a single specialized domain, with no application code around it → the
   **specialist for that domain, alone**.
3. Story that combines domains with categorically distinct approval criteria (its own
   blocking gate) → split into `## Subtasks`: several agents, always in sequence on
   the same worktree, never simultaneously.

If there's doubt between 1 and 3: is the extra domain "another file type" the generalist already
knows how to write (migration, doc), or "another approval criterion" (a gate that can reject the story on
its own)? The former → generalist. The latter → subtasks.

## Registry

| Agent | Domains | Activates when | Tools | Produces |
|---|---|---|---|---|
| `worktree-agent` | general (default) | Any "normal" combination of domains | All (no restriction) | code + tests |
| `worktree-agent-frontend` | UI, components, client state | Story purely about interface | All (no restriction) | components + UI tests |
| `worktree-agent-security` | security, audit, dependencies | Story purely about hardening, or a security gate within a mixed story | Bash, Read, Grep, Glob, Write (no `Edit` — fixes scoped by design) | report + scoped fixes |
| `worktree-agent-data` | migrations, data modeling, ETL | Story purely about complex modeling/migration, no new endpoint/feature | All (no restriction) | migrations (in the worktree) + auxiliary scripts in resolved `scripts/<project>/` (requires migration tooling verified from the repo) |
| `worktree-agent-qa` | functional verification against acceptance criteria | Business-correctness gate within a story with complex criteria | Bash, Read, Edit (test files only), Grep, Glob | tests (including ones that fail on purpose) + findings report |
| `research-agent` | technical spikes, library evaluation, prior research on real behavior | "Investigate and recommend" story with no final code (`/investigate`), or a mandatory step before design on risky story | Read, Grep, Glob, WebSearch, WebFetch, Write (to publish the Announcement) | report + Announcement (doesn't use a worktree — operates read-only against the base repo) |
| `worktree-agent-docs` | technical docs, READMEs, changelogs | Story purely about documentation, without touching code | Read, Write, Edit, Grep, Glob | markdown in resolved `docs/<project>/` (not in the destination repo) |

## How to add a new specialized agent

1. Create `.claude/agents/worktree-agent-<domain>.md` following the same pattern as the existing ones:
   frontmatter (`name`/`description`/`tools`), two-stage protocol (Stage A with no code →
   `DESIGN_PROPOSED` → gate → Stage B), same base event types as `worktree-agent.md`.
2. Add a row here with its `Domains`/`Activates when`/`Tools`/`Produces`.
3. No need to touch `CLAUDE.md` or `legion/SKILL.md`: selection is resolved by reading
   this registry, not a hardcoded list of agents.
