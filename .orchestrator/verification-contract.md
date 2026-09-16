# Verification evidence v1

Resolve checks from the actual repo and approved acceptance criteria. Plan.checks lists unique
required check IDs. Slowness alone never permits dropping a required check. Choose scoped commands
when they cover the impact; group QA scenarios into one run with per-case results. Reproduce an
individual failure when needed. Keep independent review; cache reuse is disabled in this release.

`verify` accepts root, project, snapshot, check_id, a non-secret environment_key, and command:
`{executable: absolute path, args: string[], cwd: root-relative path, timeout_ms: integer}`.
The cwd must be the story worktree or project docs/scripts. Use a known executable directly.
There is no implicit shell, eval, batch expansion, package installation or invented command.
For npm on Windows use its verified JS entrypoint with the installed Node executable when the repo
requires npm; do not silently substitute a different package manager. No credentials in arguments.

The runner checks the snapshot before/after, captures a bounded-duration process and its output
to project verification files, and records exit status, environment identity and elapsed time.
Its result is PASSED only for exit 0 with unchanged artifacts. FAILED, MUTATED, TIMEOUT and
SPAWN_FAILED never satisfy a required check. It does not restore files or release claims after
failure. Investigate descendants/resources before retrying a timed-out external tool.
Raw output remains on disk; summarize result, command and log path rather than injecting full logs.

Use check-only format/lint variants. The reviewer never reformats source as part of an audit.
Mutation invalidates evidence and goes back to the claimed writer. The runner can detect changes
inside inventoried artifacts; it is not an OS sandbox and does not authorize side effects elsewhere.
Do not run commands with live production/data side effects as checks.

Environment_key identifies the dependency/runtime/configuration state without exposing secrets.
It is not proof that every environmental input was captured. For this reason `cache_reusable`
is always false; the reviewer still runs independent checks. Any future cache needs separate
validation for dependencies, environment, services, nondeterminism and all relevant inputs.

Integration checks use `integration-verify` over an isolated materialized set, not a story worktree.
MATERIALIZED only means no merge conflict was found. Only successful required integration checks,
unchanged inputs and unchanged materialized content can produce VERIFIED for that exact set.
