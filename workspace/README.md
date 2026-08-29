# Workspace

Clone every destination repository as a direct child of `workspace/` and register it in
`.orchestrator/projects.yml`.

```text
workspace/
├── stocks/                       # repo_dir for project stocks
├── billing/                      # repo_dir for project billing
└── worktrees/
    ├── stocks--STOCK-10/
    └── billing--BILL-3/
```

A repo clone is never edited directly by an implementing agent. Legion creates one Git worktree per
story at `workspace/worktrees/<project>--<Story-ID>` using the selected project's catalog entry.
Multiple Claude Code sessions can own distinct story claims for one project.

Before provisioning, Legion validates physical containment, Git state, base branch and optional
sanitized remote. Uncommitted base-branch changes are not inherited by new worktrees and require a
user decision. Never delete worktrees manually: an uncommitted worktree may contain the only copy
of completed work.
