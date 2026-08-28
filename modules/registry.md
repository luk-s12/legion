# Module registry

Registry of installed modules and their state — analogous to `.orchestrator/capabilities.md`,
but for this subsystem. **Written only by `/new-module` (alta) and `/module` (uninstall/activate)**;
agents and `/legion` consult it, never write to it directly.

States: `installed` (usable) → `deprecated` (won't be selected for new activations, existing
references can still finish) → `uninstalled` (not usable; exact removal from `modules/installed/`
was requested, but a failed/partial cleanup may leave residue that must never be trusted or reused;
row kept for history — `reputation.md`/`metrics.md`/old reports still cite this module by name).

## Registry

| Module | Type | State | Default activation | Installed on |
|---|---|---|---|---|
| *(no modules installed yet)* | | | | |
