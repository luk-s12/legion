# Events and recovery v1

Agent notifications describe meaningful transitions, blockers and decisions, not every file edit.
The owning session persists them through `event`; agents do not take project locks. IDs are stable
per transition and attempt. Repeating an identical ID/payload is idempotent; different content with
the same ID is an error, never an overwrite. UTC timestamps include date and timezone.

New events live at `projects/<project>/events/<story>/<event-id>.json` with version, ID, at and
payload (story, session, attempt, type, snapshot_id, summary). Types are START, DESIGN_PROPOSED,
DESIGN_APPROVED, IMPLEMENTATION_DONE, QA_DONE, REVIEW_APPROVED, REVIEW_REJECTED, BLOCKED, RESUMED,
DECISION, SIGNAL_ISSUED, ANNOUNCEMENT_PUBLISHED and INTEGRATION_CHECKED. File inventories come from
snapshots/Git. Urgent signals are still published immediately in their explicit write zone.

Publish REVIEW_APPROVED/checkpoint before releasing its claim. After release, integration reports
provide the set's evidence; do not reacquire a writer merely to append INTEGRATION_CHECKED. That
optional per-story notification is available only while the owner still holds the claim.

`checkpoint` writes version, stage, done, pending, blocker, snapshot and design, using expected_sha256
for compare-and-replace under the project mutex. It is a derived recovery aid, never authority over
Git, requirements, claims or reviewer evidence. Board writes occur only when derived state changes.

Read legacy `events/<story>.md` without rewriting it. HH:MM entries do not imply a date or ordering
across sessions. Legacy FINALIZED means the role ended its stage, not that independent review or
integration succeeded. Reconcile legacy reports with real files before adopting the new format.
An incomplete/foreign claim is never taken over by age. Dead-owner takeover still requires the
existing explicit human decision and evidence. Pause transitions at a stable checkpoint before
upgrading runtime/instructions; never rewrite formats beneath active writers.
