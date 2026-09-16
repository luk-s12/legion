# Worktree operations

## Worktree infrastructure

The orchestrator exclusively creates/removes worktrees:

```sh
mkdir -p "<abs-root>/workspace/worktrees/<project>"
git -C "<abs-root>/workspace/<repo_dir>" worktree add \
  "<abs-root>/workspace/worktrees/<project>/<Story-ID>" \
  -b <branch_prefix>/<Story-ID> <BASE_SHA>
```

`<abs-root>`, `repo_dir`, parent, target, branch and base are resolved and validated beforehand
(see `### Worktree path and Story-ID validation`); each value is passed as a separate argument.
The snippet documents absolute operands and never authorizes concatenating a string for the shell
to evaluate. The parent is created idempotently (`mkdir -p`, or the host shell's idempotent
equivalent) — what binds is "create the parent idempotently", not the exact binary.

Resolve BASE_SHA once with rev-parse, validate it as a commit and provision from that exact SHA.
Record BASE_SHA in START and the execution plan; BASE_BRANCH is a label, not the review baseline. Before each provisioning, inspect the selected real repo for
gitignored local architecture rules/files needed by an agent, show exact contained source/destination
paths and copy only paths the user confirms. Secret-like files require a separate exact
confirmation. This discovery adds no catalog field or manifest. Never remove a worktree with
uncommitted changes or use `--force` without deliberate confirmed discard.

The per-project parent `workspace/worktrees/<project>/` is created idempotently (`mkdir -p`, or the
host shell's idempotent equivalent) before each `worktree add` and is never a source of truth —
story identity lives in the claim, the branch and `git worktree list`. After `worktree remove`
during harvest, attempt a non-recursive `rmdir` of that exact canonical parent. If it fails,
re-inspect the parent without following links: a real directory that still contains entries is a
benign concurrent-use result; a missing parent is already clean; every other state or error is
reported. Never classify by localized message text or by exit code alone. Never `rm -rf`,
recursive-delete, glob or `--force` anything under `workspace/worktrees/`.

Fetch origin before orchestration when present. If the local base is behind, ask before
`git pull --ff-only`; divergence is resolved by the user. Never merge/rebase automatically.

### Worktree path and Story-ID validation

Apply the common checks below for every operation; select the operation-specific existence check in item 7.

1. Resolve `project` from `.orchestrator/projects.yml` and validate its existing slug (the project
   resolver above already does this).
2. Validate `Story-ID` as a single path segment: non-empty; no `/`, `\`, `..`, NUL, control
   characters, shell separators, or trailing dot or space; not a reserved Windows name (`CON`,
   `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, with or without an extension).
3. Validate the refname with `git check-ref-format refs/heads/"<branch_prefix>/<Story-ID>"` (not
   `--branch`, which resolves special forms such as `@{-1}` or `-`).
4. Build the target by joining already-validated segments and passing each as a separate argument;
   never interpolate a command string.
5. Canonicalize root, parent and leaf; reject a symlink/junction or any resolution outside
   `workspace/worktrees/`.
6. The parent `workspace/worktrees/<project>/` may be absent or a real contained directory. If it
   is a file, link, worktree or ambiguous path, block.
7. For **create**, the destination must be absent and the branch must have no registered worktree.
   For **move**, validate the existing source by branch and require an absent destination.
   For **reuse**, require the existing directory, matching Git registration, branch and owned claim.
   For **remove**, require matching registration, a clean working tree including untracked files,
   and the applicable harvest authorization. Never apply the absent-destination rule to reuse/remove.
   Validate each Git operation separately; do not assume identical handling of existing directories.

`.claude/skills/legion/SKILL.md`, `.claude/skills/legion-upgrade/SKILL.md` and the D3/D4 section of
`.orchestrator/migration-contract.md` cite this subsection by its exact title instead of repeating
these rules. A skill that needs a nuance adds it as a named exception referencing this subsection,
never as a copy of the list.
