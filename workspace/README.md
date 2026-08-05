# Workspace — the destination project goes here

This folder is the only place where the system expects to find the repository you're going to work on. Everything that is "the real project" lives in here — never in the orchestrator's root, so as not to mix it with `CLAUDE.md`, `.orchestrator/`, the skills, etc.

## What to put here

**A single clone** of the destination repository (NOT N copies — the system uses `git worktree` to work on several stories in parallel over that same clone, not separate clones):

```
workspace/
├── README.md          ← this file (don't delete it, it's the folder's anchor)
├── base-repo/          # your ONLY real clone of the project. Never worked on directly here
└── worktrees/          # the orchestrator creates this folder on its own — do NOT create it or put anything in it by hand
    ├── Story-100/          # worktree for Story-100, with its own branch
    └── Story-101/          # worktree for Story-101, with its own branch
```

The exact name of the base repo (the `base-repo/` above is just an example — you can call it whatever you want) is detected automatically: it's the only subdirectory of `workspace/` with `.git`, aside from `worktrees/`. If there are zero or more than one, `/legion` will let you know.

## Base repo requirement

It has to be on its base branch (`main`/`master`/whichever you use) **committed and clean** before running `/legion` — worktrees are born from that branch's last commit, so any uncommitted change in `base-repo/` would never reach the agents. If you have pending changes, commit or discard them before orchestrating.

## Rules

- Don't put more than one clone of the destination repository here.
- Don't touch `worktrees/` by hand: creating and removing them is the exclusive responsibility of the orchestrator (`git worktree add`/`remove`).
- Don't delete or empty it manually while an orchestration run is in progress (check `.orchestrator/assignments.md` first) — you could destroy uncommitted work that only exists in a worktree.
- The orchestrator never commits, pushes, or creates remote branches on top of what's here: that's in your hands (see the "When finished — harvest" section of the root `README.md`).
