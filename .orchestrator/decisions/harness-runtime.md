# Runtime implementation decision

Use Node.js 22+ built-ins and Git, with no npm dependencies, network installation or persistent
service. The local verification environment has Node 24.15.0, Git 2.54.0.windows.1 and Windows
PowerShell 5.1. The CLI accepts a JSON request file/stdin and returns compact structured output.
This is a harness runtime dependency, not another destination-stack configuration.

The implementation uses exclusive mkdir for locks, nonce-bound owners, same-directory candidates,
fsync of written files, rename and destination reread. It targets process-interruption recovery;
hardware power-loss durability and hostile filesystem races are not claimed. Mutexes coordinate
cooperating local sessions. Network shares/cloud-synced concurrent writers are not a distributed
lock service. Test separately before operating on those filesystems.

New owner.md files contain JSON v1. Existing unrecognized owner formats are incomplete evidence,
never automatically rewritten or stolen. The helper catalog parser accepts the distribution's
two-space YAML mapping subset and JSON (valid YAML). Other YAML constructs fail explicitly without
mutation; do not rewrite a user's catalog automatically to fit the helper.

Tests exercise real child processes and isolated temporary Git repositories. Windows is verified
locally; a Linux/Windows CI matrix is supplied for additional validation. Do not report Linux
behavior as tested until that job actually runs. Model-backed baseline/candidate evaluation is
separate from deterministic helper tests. Test-result cache reuse remains disabled.

References: [Node filesystem API](https://nodejs.org/api/fs.html) for filesystem primitives and
[Claude Code subagents](https://code.claude.com/docs/en/sub-agents) for declared agent tools and
isolated role context. These references inform implementation; local tests establish the checked
behavior. No Codex-specific APIs, formats or limits are used by Legion.
