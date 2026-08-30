# Minimal runtime coordination

Runtime is gitignored and contains only three kinds of lock:

```text
.orchestrator/runtime/catalog.lock/owner.md
.orchestrator/runtime/<project>/project.lock/owner.md
.orchestrator/runtime/<project>/stories/<Story-ID>.lock/owner.md
```

`catalog.lock` is the one brief global-metadata mutex. Its historical path protects exactly two
shared surfaces: catalog registration/bootstrap/replacement in `.orchestrator/projects.yml` and
serialized replacement of `modules/registry.md`; it is not an additional lock type. `project.lock` briefly protects
shared writes and story-claim acquisition/release. A story lock is the durable writer claim for
that story, branch and worktree.

Owner candidates are prepared and validated before the atomic leaf `mkdir` where possible, then
moved to `owner.md` and reread. Shared-file and handoff writes use
`candidate -> verify -> rename -> reread`. An incomplete lock is never stolen by age: show the
evidence and require a manual decision.

Release rereads and verifies `session_id`, removes only that known `owner.md`, then uses `rmdir` on
that exact lock. Recursive removal is forbidden.

A singleton → multiproject migration's own identity, ownership, takeover and hashing contract is not
described here — see `.orchestrator/migration-contract.md`, the single source for that.
