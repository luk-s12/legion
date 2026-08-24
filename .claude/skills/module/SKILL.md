---
name: module
description: Lifecycle management for an already-installed module — uninstall (with confirmation, deferred if active stories still reference it), activate (undo a pending deprecation), and renegotiate (reopen a provides_rules verdict for the current project). Use /new-module for installing a new module instead.
---
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


Manage the lifecycle of a module already present in `modules/registry.md`. These three
sub-actions cover what's actually needed — not a broader command family anticipating future
operations (update, list) that aren't needed yet. See `modules/README.md` for the registry's
state machine, and its "Negotiation of `provides_rules`" section for what `renegotiate` reopens.

**Arguments**: `/module uninstall <name>`, `/module activate <name>`, or `/module renegotiate
<name> [rule_id]`.

Every `modules/registry.md` state mutation uses the global metadata mutex: acquire
`.orchestrator/runtime/catalog.lock`, reread the registry, update a sibling
`modules/registry.md.candidate-<session>`, validate all existing rows plus the intended transition,
rename exactly to `modules/registry.md`, reread/compare, then release the verified mutex. Never hold
the project mutex simultaneously. Project assignments/design/rule writes separately use the
project safe-write contract.

## `/module uninstall <name>`

1. Look up `<name>` in `modules/registry.md`. If it doesn't exist, error.
2. **If `type: gate`**, check whether any **active** story (not `finalized`/`aborted` on
   `.orchestrator/projects/<project>/assignments.md`) references it in its `## Modules`, or whether it's
   `default_activation: always` and there are active stories that haven't passed through its
   stage yet:
   - If so: mark (or confirm) state `deprecated` through the global registry safe-write contract, and
     report the list of stories still referencing it, so the user can decide whether to let them
     finish or remove it from their `## Modules` by hand. Also add (or update) a
     `### Deprecated modules with active references` sub-section in `.orchestrator/projects/<project>/assignments.md`
     (`Module | Deprecated on | Stories still referencing it`) — so this is visible from the board
     itself, without cross-referencing `registry.md` against every story's `## Modules` by hand.
     Drop the module's row from that sub-section once no active story references it anymore (the
     next time the board is touched — no separate sweep needed). **Stop here** — do not touch
     `modules/installed/<name>/`.
   - If not (or the module is `type: generator`, which is never story-scoped and has no
     `## Modules` references to check): continue to step 3.
3. `AskUserQuestion` to confirm — this is **irreversible**. On confirmation, acquire the global
   metadata mutex and publish state `uninstalled` through the registry safe-write contract first
   (never delete the row — project reputation/metrics/old reports still cite it). Only after the
   destination reread succeeds, resolve `modules/installed/<name>/`, prove it is the exact expected
   child of `modules/installed/` (matching name, contained real path, not a symlink/junction), and
   remove that exact tree through the filesystem operation; never construct a shell glob or use
   `rm -r`/`rm -rf`. Release the verified mutex afterward. If exact removal fails or is partial,
   keep the durable `uninstalled` state, release the mutex and report the remaining exact path for
   a confirmed cleanup retry; do not roll back to `installed`, because the clone may be incomplete.
   A fresh install must refuse to overwrite that residue until the exact cleanup succeeds.
4. Running this command again on a module already `deprecated` with no remaining active
   references goes straight to step 3 — same command, natural continuation, not a separate case.

## `/module activate <name>`

- Only valid if the module's current state is `deprecated` → flip it back to `installed` using the
  global registry safe-write contract. Nothing else changes — stories that kept referencing it in their
  `## Modules` never noticed the detour.
- **Not valid on `uninstalled`** — the folder is physically gone, there's nothing to reactivate.
  Tell the user a fresh `/new-module` is needed instead.

## `/module renegotiate <name> [rule_id]`

Reopens the accept/reject question for the module's `provides_rules`, against the **current**
project (the selected slug in `.orchestrator/projects.yml`) — without waiting for the module to change
version. Useful when the user just wants to revisit a call they already made.

1. Look up `<name>` in `modules/registry.md`. **Valid only if its state is `installed` or
   `deprecated`** — same criterion as `/module activate`: an `uninstalled` module has no clone
   left to re-read `rules.md` from. If it's `uninstalled`, tell the user a fresh `/new-module` is
   needed first.
2. If the module has no `provides_rules` declared → nothing to renegotiate, say so and stop.
3. Read `modules/installed/<name>/rules.md` and the current
   `.orchestrator/projects/<project>/module-rules/<name>.md` for this project (if it doesn't exist
   yet, there's nothing negotiated to reopen — point the user at running a story that references
   the module instead, that's what triggers the first negotiation).
4. If `[rule_id]` was passed, reopen only that entry; otherwise reopen every `rule_id` the module
   currently declares. Ask with the same single multiSelect `AskUserQuestion` used for the
   original negotiation (`legion/SKILL.md`, "Module stages").
5. The result is appended as a **new row** in the resolved project's `module-rules/<name>.md` through
   the project safe-write contract — the
   previous row is never deleted or edited in place (same historical-record criterion as the rest
   of `.orchestrator/`).
6. **No retroactivity**: this never reopens a story already `finalized` in this project — its
   `designs/<Story-ID>.md` stays as it was approved. If the user wants a closed story to pick up
   the new verdict, that's Phase 6 (post-closure correction) of `/legion`, not this command.
7. **Informational note on affected finalized designs** (not a reopening): if this `rule_id`'s
   NEW verdict differs from the one embedded in any `finalized` story's `## Module rules applied`
   section, append one line under that story's entry in `designs/<Story-ID>.md`: "Note: this
   rule's verdict was renegotiated on `<date>` to `<new verdict>` for future stories — does not
   apply retroactively to this story." Find affected designs by grepping `designs/*.md` for the
   module name inside a `## Module rules applied` section. Purely for anyone reading that design
   in isolation later — no status change, no re-review triggered.

## Rules

- Never delete a registry row, only change its state.
- Never touch `modules/installed/<name>/` without the explicit confirmation and exact containment
  validation in uninstall's step 3; no broad recursive shell deletion is permitted.
- `/module activate` never re-clones anything — it's a pure state flip, not an install.
- `/module renegotiate` never touches `modules/installed/<name>/` or the registry — it only adds
  a row to the resolved project's `module-rules/<name>.md`.
