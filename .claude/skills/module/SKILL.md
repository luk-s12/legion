---
name: module
description: Lifecycle management for an already-installed module — uninstall (with confirmation, deferred if active stories still reference it) and activate (undo a pending deprecation). Use /new-module for installing a new module instead.
---

Manage the lifecycle of a module already present in `modules/registry.md`. This is deliberately
just these two sub-actions — not a broader command family anticipating future operations
(update, list) that aren't needed yet. See `modules/README.md` for the registry's state machine.

**Arguments**: `/module uninstall <name>` or `/module activate <name>`.

## `/module uninstall <name>`

1. Look up `<name>` in `modules/registry.md`. If it doesn't exist, error.
2. **If `type: gate`**, check whether any **active** story (not `finalized`/`aborted` on
   `.orchestrator/assignments.md`) references it in its `## Modules`, or whether it's
   `default_activation: always` and there are active stories that haven't passed through its
   stage yet:
   - If so: mark (or confirm, if already there) state `deprecated` in `modules/registry.md`, and
     report the list of stories still referencing it, so the user can decide whether to let them
     finish or remove it from their `## Modules` by hand. **Stop here** — do not touch
     `modules/installed/<name>/`.
   - If not (or the module is `type: generator`, which is never story-scoped and has no
     `## Modules` references to check): continue to step 3.
3. `AskUserQuestion` to confirm — this is **irreversible**, it deletes
   `modules/installed/<name>/` for real. On confirmation: delete the folder, set the registry row
   to state `uninstalled` (never delete the row — `reputation.md`/`metrics.md`/old reports in
   `modules/reports/` still cite this module by name; losing the row breaks that history).
4. Running this command again on a module already `deprecated` with no remaining active
   references goes straight to step 3 — same command, natural continuation, not a separate case.

## `/module activate <name>`

- Only valid if the module's current state is `deprecated` → flip it back to `installed` in
  `modules/registry.md`. Nothing else changes — stories that kept referencing it in their
  `## Modules` never noticed the detour.
- **Not valid on `uninstalled`** — the folder is physically gone, there's nothing to reactivate.
  Tell the user a fresh `/new-module` is needed instead.

## Rules

- Never delete a registry row, only change its state.
- Never touch `modules/installed/<name>/` without the explicit confirmation in uninstall's step 3.
- `/module activate` never re-clones anything — it's a pure state flip, not an install.
