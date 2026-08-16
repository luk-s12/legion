---
base_repo: workspace/<name>                    # Directory inside workspace/ that is the ONLY real clone of the destination project (auto-detected: the only subdirectory of workspace/ with .git, except worktrees/). Never worked on directly there
base_branch: <the project's real branch name, whatever it is — main, master, develop, trunk, development, release/*, etc.>  # Branch from which each worktree is created. Do not assume it's one from a fixed set: ask/confirm the one the project actually uses
branch_prefix: <prefix>/<Story-ID>              # Team's branch convention (e.g. username, area, feature/). Born together with the worktree
max_parallel: <number, default 3>               # Maximum number of active worktrees/agents at once. The real bottleneck is usually the CPU/RAM of the builds, not the worktrees themselves. Configurable by the user when invoking /legion MAX_PARALLEL=<n>
local_files_to_copy:                            # Gitignored files/folders in the base repo that a new worktree does NOT bring (because `git worktree add` only copies what's tracked/committed) but that the agent needs to work (architecture rules, docs). The orchestrator copies them when provisioning each worktree
  - <e.g. .claude/>
  - <e.g. docs/>
  - <e.g. .env.example>
stack: <language, framework, build manager>     # E.g. "Java 17 / Spring Boot / Maven", "Node/TypeScript / pnpm", "Python / Poetry"
full_verification_command: <format + build + test>       # Run by the agent before FINALIZED and by the reviewer when auditing
lint_verification_command: <lint or format only>         # Re-run by the reviewer without trusting the self-report
scoped_test_command: <test of the touched classes/modules>  # To avoid running the full suite on every round if it's too slow
migration_tool: <Liquibase / Flyway / Prisma / Alembic / Django migrations / none>  # If the project has no versioned DB schema, mark "none" and skip migration coordination
migration_ordering_rule: <e.g. the file name (timestamp) defines execution order>   # Needed only if the tool orders by name; the orchestrator keeps a global counter that crosses batches so order is respected across stories from different batches
architecture_rules_location: <relative path, e.g. CLAUDE.md and .claude/rules/ of the base repo>  # What the reviewer manually audits and the gate uses to unify designs
patterns_guide_location: .claude/skills/patterns-and-smells/SKILL.md  # If the project already has its own patterns guide, reference it here instead of keeping two
content_language: English                       # Default. Language used for free-form prose ONLY in what the agents persist into the destination project (see note below)
---

# Project configuration

Parameters specific to the project this orchestration runs on. It's the only
place where knowledge of the concrete stack lives — `CLAUDE.md`, the agents, and the
skills are agnostic to language/framework and read these values instead of assuming them.

**Written only by the Orchestrator Agent**, normally in Phase 1 (Validation) of
`/legion`, the first time it runs on a new project: if this file doesn't exist
or the frontmatter above has unfilled `<...>` placeholders, the orchestrator investigates the repo (reads the
base repo's `CLAUDE.md`/docs, the folder structure, the package manager, the
migration files if any) and **asks the user** whatever it can't infer, before
starting Phase 2. Once complete, it's reused across all subsequent runs
without asking again (unless the user asks to reconfigure).

This system uses **a single base clone + one `git worktree` per story** (not N fixed copies):
there is no limit on the number of stories, only a **concurrency** limit (`MAX_PARALLEL`).

## Field notes

- **`content_language`**: language used for **free-form prose only** in what the agents persist into the destination project — a story's description and bullet content, generated docs body text. Independent of whatever language you chat with the agent in (that always follows you automatically, no config needed). Change this value to any other language if you want that prose written in it instead — e.g. `Spanish`, `Portuguese`. **The value itself is always written in English** (the language's English name — `Spanish`, not `español`), the same fixed-vocabulary convention as commands and section headers; only the prose it controls gets written in the chosen language. **Never** applies to structural tokens the system parses literally — block headers (`# Story <ID>`), section headers (`## Acceptance criteria`, `## Depends on`, `## Subtasks`, etc.), event names, statuses, or any command/file/folder name. Those always stay in English, exactly like commands do. Applies to prose and comments ONLY — NEVER to code identifiers (class/method/variable/test names), which always follow the convention observed in the destination repo (e.g. English, if the existing code and tests name things in English).

## How it's resolved the first time

1. The orchestrator detects the base repo: the only subdirectory of `workspace/` with `.git` (if there are zero or more than one, or if `workspace/` is empty except for its `README.md`, it warns the user and waits).
2. Verifies that the base repo is on the base branch and has a **clean** working tree — worktrees are born from that branch's COMMIT, so uncommitted changes in the base repo would never reach the agents.
3. Reads `CLAUDE.md` and `.claude/rules/` (or equivalent) of the base repo to infer stack, build/test commands, and architecture rules.
4. Looks for signs of migration tooling (`db/migrations`, `prisma/migrations`, `alembic/versions` folders, Liquibase changelog, etc.) and its ordering rule.
5. Identifies which gitignored files/folders in the base repo are necessary for an agent to work (local rules, docs) — that feeds `local_files_to_copy`.
6. Uses `AskUserQuestion` to confirm whatever it couldn't infer with certainty (especially: branch prefix, base branch if there's ambiguity, `max_parallel` if the user didn't pass it, and whether there are migrations if it found no clear evidence).
7. Writes the frontmatter at the top of this file with the resolved values and continues the run.

## Example of resolved values (illustrative, not binding)

```yaml
base_repo: workspace/base-repo
base_branch: main
branch_prefix: team-ai/ci/<Story-ID>
max_parallel: 3
local_files_to_copy:
  - .claude/
  - docs/
stack: Node 20 / TypeScript / npm
full_verification_command: npm run lint && npm run build && npm test
lint_verification_command: npm run lint
scoped_test_command: npm test -- <module pattern>
migration_tool: Prisma
migration_ordering_rule: order is defined by the prisma/migrations/<timestamp>_<name>/ folder
architecture_rules_location: CLAUDE.md + docs/architecture.md of the base repo
patterns_guide_location: .claude/skills/patterns-and-smells/SKILL.md
content_language: English
```
