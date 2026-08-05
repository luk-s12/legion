---
name: data-guide
description: Data modeling and safe-migrations guide, agnostic of engine (relational and non-relational). worktree-agent-data MUST apply it when designing/implementing, classifying each finding by severity and citing concrete evidence before declaring it blocking - same criterion as security-guide, so that a schema change doesn't break already-deployed code or existing data.
---

Mandatory modeling and migrations guide for `worktree-agent-data` (and for any `[data]` subtask within a mixed story). It complements (never contradicts) `CLAUDE.md`/the base repo's own rules and the migration convention registered in `.orchestrator/config.md` — in case of conflict, the target project's rules win.

This guide **does not assume any particular engine**: the criteria apply equally to relational (tables) and non-relational (collections/documents) — where the criterion differs between the two worlds, it's explicitly clarified in the item.

## Part 1 — Safe migrations (expand-contract, never all in one step)

The problem this part solves: a migration that looks fine in the worktree can break code still deployed with the previous version, or leave real data in an unrecoverable state.

1. **Add before removing**: never delete or rename a column/field in the same step where the code stops needing it. Correct order: (a) add the new one, (b) migrate/duplicate the data, (c) move the code to use the new one, (d) only in a **later** migration remove the old one. A direct `rename` counts as steps (a)+(d) combined — treat it as destructive.
2. **`NOT NULL` without a default on a table/collection with existing rows**: always blocking — breaks any insert from code still deployed that doesn't send that field. Add it nullable or with a default first; tighten to `NOT NULL` in a later migration, once all the code sends it.
3. **Every `rename`** (column, table, field, collection) is in practice a `drop + add` in several engines — never treat it as a cosmetic/free change.
4. **Changing the type of a column/field with existing data**: explicitly declare how current values are converted (or that the conversion loses precision/truncates) — don't assume the engine handles it on its own.

## Part 2 — Reversibility and backfills

5. **Every migration needs its rollback** (`down`, or the project's tool's equivalent), or an explicit justification for why it doesn't have one (e.g. irreversible deletion of sensitive data for compliance). "I didn't do the rollback because there wasn't time" is not a valid justification.
6. **Backfills/transformations of existing data must be idempotent**: running the script twice must not duplicate rows/documents or break anything. If the data volume is large, process it in batches — a backfill that holds a long lock over the entire table is a finding, not an implementation detail.
7. **Risk to real data outside the worktree**: if the migration has an impact on data that exists in a real environment (not just new structure over an empty database), document the rollback plan as part of the result — the reviewer and the user need it before applying it outside the worktree.

## Part 3 — Modeling

8. **Normalization vs. deliberate denormalization**: duplicating data that should live in a separate entity is a finding — unless it's a deliberate denormalization for reads (common and valid in read-oriented NoSQL), in which case it has to be **documented as a decision**, not look like an oversight.
9. **Referential integrity**: in relational, declare the FK. In engines that don't natively enforce it (Mongo, DynamoDB, etc.), explicitly point out where that reference's validation lives in the application layer — don't assume "it's not needed" just because the engine doesn't enforce it.
10. **Indexes**: any field used in frequent filter/order/join without an index is a finding; an index that duplicates another already-existing one (same column prefix) is also one, in the opposite direction (write cost with no real read benefit).
11. **Correct data types**: money as decimal/integer cents (never float), dates as the engine's native date type (never a free string), external identifiers with the type the rest of the project already uses for that concept (don't mix `int`/`uuid`/`string` for the same entity class across different User Stories).

## Part 4 — Severity levels (mandatory to classify every finding)

- **Blocking**: there's concrete evidence that the change breaks already-deployed code, or is irreversible with no documented plan — you can point exactly at what fails and with which data/scenario. Blocks closing the story until the Orchestrator resolves it.
- **Warning**: a real improvement (missing index, suboptimal normalization, non-ideal type) but with no evidence it breaks anything today. Still reported — doesn't block closure.

**Hard rule**: never declare something blocking just because "it's not the ideal way" — it has to break compatibility with deployed code, or be irreversible with no plan, with concrete evidence. When in doubt, warning.

## Part 5 — Application protocol

1. **Before designing**: read the project's real schema (existing tables/collections, relationships, column/index naming convention) and the migration tool + ordering rule from `CONFIG`.
2. **While designing**: declare each migration per Part 1, and for each, whether it has risk to real data (Part 2) and its rollback plan. Report `DESIGN_PROPOSED` — the Orchestrator assigns the final identifier, you never choose it yourself.
3. **While implementing**: the migration with the EXACT assigned identifier, plus any backfill script the story requires, complying with Part 2.
4. **When reporting `FINALIZED`**: list blocking findings and warnings separately (with their evidence), same as `security-guide`. If there are blockers, the story **is not ready** — the Orchestrator decides how to resolve it. You never decide on your own that the story stays blocked indefinitely.

## Use by the Orchestrator

A `blocking` finding is never resolved silently: it's read, and if the fix is clear it's ordered via `SendMessage` (documented in `.orchestrator/decisions/DEC-NNN.md`); if after 3 rounds it's still unresolved, or it implies a business decision the Orchestrator can't make on its own (e.g. accepting the application of a destructive migration with no rollback because the data no longer matters), it's escalated to the user — same limit as `security-guide` and `worktree-reviewer`.
