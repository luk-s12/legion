# Project catalog contract

`.orchestrator/projects.yml` is the only configuration authority. New installations ship with:

```yaml
version: 1
projects: {}
```

Each registered project has exactly these required fields and one optional field:

```yaml
version: 1
projects:
  example:
    repo_dir: example
    base_branch: main
    branch_prefix: claude/example
    max_parallel: 3
    remote: host/owner/example # optional, canonical and credential-free
```

Rules:

- Only `version: 1` is supported. Unknown top-level or project keys stop the command.
- Slugs match `[a-z0-9][a-z0-9-]*`.
- `repo_dir` is one direct child of `workspace/`; absolute paths, `..`, globs and links escaping
  that root are rejected.
- `base_branch` and `branch_prefix` are non-empty, contain no control characters or shell
  separators, and must form valid Git refs when combined with a Story ID. Validate the base with
  `git check-ref-format --branch` and the final `<branch_prefix>/<Story-ID>` before provisioning;
  pass both as quoted command arguments.
- `max_parallel` is a positive integer.
- Before every project-scoped command, `workspace/<repo_dir>` must be a usable Git repository.
- When `remote` is present, the sanitized repository remote must match it. Credentials are never
  stored or displayed.
- An empty catalog requires guided registration. A missing catalog requires the copy-first
  bootstrap described in `CLAUDE.md`. Neither state enables a single-project fallback.
