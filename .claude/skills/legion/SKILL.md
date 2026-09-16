---
name: legion
description: Orchestrates project-scoped stories with isolated worktrees, verified claims, proportional design and independent snapshot-bound review.
---

# /legion

Arguments: /legion --project <slug> [--story <ID>] [dry-run]. Reuse the explicit project;
ask only when identity is missing or ambiguous. --story never bypasses readiness or capacity.
Read CLAUDE.md, then the normative contracts for each operation. Helpers use Node 22+ and Git;
see tools/harness/README.md. Do not implement destination code in the owning session.

## Resolve and reconstruct

1. Validate catalog and markers. The normative bootstrap table is in
   .orchestrator/bootstrap-contract.md. On a valid populated catalog without pending markers,
   proceed normally; otherwise follow that table and migration-contract.md, without fallback.
2. Resolve requirements, project memory, repo and namespaced worktrees. Validate physical paths,
   optional sanitized remote and refs. Fetch origin if present; ask before pull --ff-only;
   do not merge/rebase on the user's behalf. Pin BASE_SHA to the selected base commit.
3. Run diagnose. Reconcile claims, worktrees by branch, requirements, legacy events and review
   evidence. Only own claims may be resumed. Incomplete claims consume capacity; do not recreate
   or steal one. Legacy paths require the approved migration mapping and explicit reconciliation.
4. Consult relevant capabilities, module registry, components/decisions/lessons and alerts. Use
   source-versioned context packets instead of reading unrelated story histories or full logs.

## Plan and reserve

Analyze affected resources and dependencies; reuse analysis only while its source hashes match.
Capture .orchestrator/projects/<project>/plans/<Story-ID>.json using artifact-contract.md:
version, project, story, base_sha, requirements_sha256, sources, resources, dependencies, checks.
Resources include external docs/scripts. Unknown scope reserves the whole repo conservatively.
Classify each Depends on edge as order/code with design evidence. Code absent from the base means
WAITING_INTEGRATION; do not claim or recreate the prerequisite implementation.

Use reserve once for each eligible story. It revalidates plan sources, requirements, dependencies,
conflicts and max_parallel under project.lock, publishes the durable claim and updates assignments.
QUEUED is a wait state, not a reason to spin. LOCK_BUSY gets bounded retry on a subsequent useful
notification or a user-visible wait/cancel decision; never take over by age. No batch barrier.

Provision outside the mutex with separate validated arguments and the exact BASE_SHA. Use
worktree-check for operation-specific preconditions, and worktree-contract.md for Git operations.
Create the project parent idempotently; reuse existing branch registrations; never duplicate them.
Discover ignored local rules/config and copy only already-authorized exact paths; secrets require
separate exact authorization. A helper does not authorize copying them.

## Design and implementation

Select the generalist/specialist from capabilities. Subtasks run sequentially in the SAME worktree.
Module implementers activate only by explicit story naming. Pass the compact story packet from
context-contract.md, all role inputs, BASE_SHA, plan path and intended external artifacts.

DESIGN_PROPOSED waits for this owner, independently of other sessions. Review relevant registry,
decisions and alerts; resolve conflicts and assign migration IDs under brief shared-write windows.
Compact/full design depth follows risk, not a weaker acceptance standard. Persist the approved
design. In dry-run persist PENDING APPROVAL and stop before approving the writer. After user
approval, launch design-reviewer with the actual design, relevant rules and prior findings. Present
new findings together; persist INCORPORATED, explicitly OMITTED (with accepted scope/reason), or
DISMISSED (with evidence), update the design and repeat only for unresolved changes. Preserve prior
decisions; new demonstrated consequences may reopen them. Never invent user risk acceptance.
Removing a discarded dry-run worktree still requires the existing explicit authorization.

Capture a clean baseline with snapshot after design approval, before any story write. Pass its path
to the writer. If scope/design changes, stop and reconcile the reservation and baseline explicitly;
do not continue with stale evidence. Agents notify meaningful transitions; the owner persists event
and checkpoint records. Urgent signals remain immediate. Never rewrite the board per file edit.

The writer returns IMPLEMENTATION_DONE. Run QA if acceptance warrants independent scenarios,
then capture the final candidate against the same baseline after all QA test additions/corrections.
QA_DONE does not approve a story. Every changed artifact, including external outputs, is inventoried.

## Module gates and admission

Before design, select story-named gates plus installed default_activation: always gates. Recompute
installed source hashes; a mismatch requires explicit update/risk review before launch. Negotiate
only changed rules, persist project-scoped decisions, and resolve conflicts with destination rules.
Pass selected skills by path. At each declared stage verify the exact write zone and registered tools.
Follow modules/README.md for rule negotiation, source trust and isolation checks. Compare content
fingerprints as well as Git status: an already-dirty file can change without a new status entry.
If isolation fails, stop the module, preserve evidence and legitimate work, and escalate the exact
incident. No blanket reset or automatic revert of another story's changes. A module that changes
accepted artifacts must finish before the final candidate capture and core review.
Use module-admission with the manifest's resolved per-project max_concurrent; it reserves under the
project mutex before launch. A run ID includes story, stage and attempt so reports cannot overwrite
another stage. Incomplete RUNNING records retain capacity until their owning session reconciles them.
No process-local counter may bypass another session. Third-party global external resources require
separate declared serialization; do not pretend a per-project limit protects them globally.

Persist module reports at modules/reports/<module>/<project>/<Story-ID>-<stage>-R<n>.md.
Blocking rejection shares the three-round code-correction budget; nonblocking reports inform core
review. Gates never replace core review. Finish the exact owned admission record after its report.

## Independent review and correction

Run worktree-reviewer with candidate snapshot, baseline, approved design, full artifact inventory,
check IDs and appropriate quality/security references. It runs verify with real check-only commands,
inspects external outputs, and writes its human report and JSON receipt from artifact-contract.md.
A demonstrable bug may reopen an approved design. Repeated old opinions or accepted unchanged risks
are not new findings. Required checks and independent critique remain mandatory.

On REJECTED, send concrete findings to the same claimed writer. Recapture/reverify after corrections;
three unresolved rounds escalate. On APPROVED, the owner calls approve, then release with reason
approved and the claim lock_id. Both revalidate evidence. An unsupported/legacy receipt requires
explicit re-review; FINALIZED text never substitutes for this proof.

Abandonment can release capacity only as abandoned-preserved, retaining every worktree/file.
Post-closure corrections reacquire capacity and ownership before delegation and require new review.
Handoff/takeover retains the existing human-confirmed protocol from runtime-contract/README.md.

## Integration and finish

Select coherent ready sets, independent of whether later stories are queued. integrate materializes
approved snapshots ONLY into runtime/integration. Original indexes, branches and working trees are
untouched. Run integration-verify with the real required combined checks. Report exact IDs, conflicts,
checks and stale evidence; MATERIALIZED is not functional success. Corrections return to owned writers.

A session ends when it owns no claims. Global project closure additionally requires a fresh
mutex-protected check of no active/pending work and current reviews/events; never report a stale
integration set as the latest global state. Safely update derived metrics/reputation, including
actual durations/tokens when available and unknown values otherwise. Harvest remains the user's job.
