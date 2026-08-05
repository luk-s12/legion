# Shared components registry

Catalog of reusable components (utilities, services, helpers, validators, factories, strategies, orchestrators, domain types, configurations) existing or planned in the destination project. It is the **architectural memory that crosses batches**: a story from a later batch designs against what previous batches already approved, it doesn't reinvent.

**Written only by the Orchestrator Agent.** Agents consult it (read-only), mandatorily:
- During **analysis/design**: every new component in the proposal must declare whether an equivalent already exists here.
- During **implementation**: before creating a reusable component not foreseen in the approved design.

If there's an equivalent with a `Reference`, the agent **replicates that implementation** (it may read that specific file in that reference's worktree, the sole exception to the isolation rule) instead of reinventing it.

## States

- `pre-existing` — was already in the base repo before the orchestration.
- `planned` — approved at the design gate, not yet implemented.
- `implemented` — created during an orchestration run (the `Reference` points to the originating worktree).

## Initial seeding

When starting to use the system on a new project, seed this table with the real reusable components that already exist in the code (`pre-existing` status) — don't leave it empty if the project already has identifiable shared utilities/services.

## Registry

| Component | Type | Location | Problem it solves | Status | Reference |
|------------|------|-----------|------------------------|--------|------------|
| *(not seeded yet)* | | | | | |
