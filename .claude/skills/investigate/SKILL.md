---
name: investigate
description: Launches the research agent (spike mode) on a specific question or topic - a library, a technical approach, or some base-repo behavior - without implementing anything. Publishes the finding as an Announcement in .orchestrator/projects/<project>/announcements/ so future User Stories can take advantage of it.
---
## Mandatory project scope

Resolve or confirm the project through `.orchestrator/projects.yml` before reading project state.
The selected catalog entry is the sole configuration authority. Use only
`requirements/<project>.md`, `.orchestrator/projects/<project>/...`, `workspace/<repo_dir>` and
namespaced worktrees. A missing catalog requires bootstrap; an empty catalog requires guided
registration. Neither state permits old singleton paths.

For a project-shared write, acquire the brief project mutex, reread current state, write and validate
a sibling candidate, rename it to the known destination, reread, then release the owned mutex.
Do not hold a mutex while interviewing, researching, testing, reviewing or waiting. Catalog and global `modules/registry.md` writes instead use the brief global metadata mutex. Never acquire or release a story claim unless this skill
is `/legion` performing a reservation.


Launch a one-off research task, outside the normal User Story flow. You act as the orchestrator of a single read-only subagent — no worktree, no gate, no implementation.

## Step 1 — Understand what to research

If the user already wrote the question when invoking the command, use it directly. If not, ask with `AskUserQuestion` (or in plain text if it's one obvious thing):

- **What you want to research**: it can be something about the repo itself ("what other modules touch `order.status`?", "do we already have something like X?") or something external (a library, an approach, how a third-party API works).
- **Relevance tags** (optional): if the user already knows which domain/future story this might be useful for, ask for them; otherwise they're inferred from the topic.

## Step 2 — Detect the base repo

Use the selected catalog entry's resolved `workspace/<repo_dir>`, with the same containment and Git validation as `/legion`. Never guess among sibling repositories.

## Step 3 — Launch the agent

`Agent` with `subagent_type: "research-agent"`. You can launch it in the foreground (`run_in_background: false`) if it's a quick one-off and the user is waiting for the answer right there, or in the background if it looks like a long research task (several external sources) and the user prefers to keep doing something else meanwhile — ask if it's not obvious.

Prompt with:
- `BASE_REPO`: absolute path of the detected base repo
- `QUESTION`: the topic as the user gave it
- `ANNOUNCEMENTS`: absolute path of `.orchestrator/projects/<project>/announcements/` (create the folder if it doesn't exist)
- `TAGS`: whatever was defined in Step 1

## Step 4 — Report

When the agent finishes, show the user a summary of the finding and the path of the Announcement that was published. If the user wants to keep digging, you can relaunch with `SendMessage` to the same agent instead of starting a new one (keeps the context of what's already been researched).

## Rules

- This command does **not** touch any worktree, doesn't create branches, doesn't implement code — it's pure research.
- It is not part of `/legion`'s orchestration flow: you can run it any time, whether or not there's an active orchestration. If there's an orchestration in progress, the Announcement it publishes remains available for active User Stories to consult (same mechanism as any other Announcement).
- If the question is actually "I want something implemented", stop and suggest writing a story with `/new-story` instead of forcing it here — this command is only for researching, not for producing code.
