# Selective context and proportional work

The orchestrator passes a small story packet: resolved identity/paths, BASE_SHA, acceptance criteria,
approved decisions, relevant symbols/resources, selected quality references, snapshot and check IDs.
It does not duplicate entire root instructions, other stories, unrelated discussions or full logs.
All source documents remain accessible when needed. Every role reads its own project's hard rules.

`context` creates a derived index of explicit source paths, byte counts and SHA-256 identities.
The owner selects relevant memory by path, scope and tags; source changes produce a different index.
An index is not a substitute for reading necessary evidence. Missing/ambiguous scope falls back to
source inspection; never use cached ownership, conflict or capacity as reservation authority.
Recompute only affected impact analysis when requirements/base/rules/resources change, then revalidate
all conflicts against current plans under the project mutex. New or unknown resources serialize.

Design depth:
- Compact: bounded, reversible change with no authentication, schema, concurrency or public API change.
  State acceptance, touched paths, reuse and checks; sketches only for logic that needs explanation.
- Full: risky/cross-cutting change, data migration, security, concurrency or public API behavior.
  Include critical code/schema sketches, rollback and interactions. Escalate depth when risk emerges.

Both routes require owner design approval, appropriate tests and independent code review. Pure content
already needs no code sketch. Reports cite evidence, consequence and correction; include code fragments
where they clarify a real issue, not a mandatory patch for every style suggestion. Minor style alone
does not reject. Code smells/architecture coverage remains mandatory for applicable changed code.

Ask missing independent fields together. Reuse an explicitly selected project and approvals that
still apply; ask again only if identity, scope or exact text under approval changed. Preserve the
new-story semantic and final-text checkpoints, without inventing additional approvals.
