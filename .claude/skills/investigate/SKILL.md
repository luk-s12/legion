---
name: investigate
description: Launches the research agent (spike mode) on a specific question or topic - a library, a technical approach, or some base-repo behavior - without implementing anything. Publishes the finding as an Announcement in .orchestrator/announcements/ so future User Stories can take advantage of it.
---

Launch a one-off research task, outside the normal User Story flow. You act as the orchestrator of a single read-only subagent — no worktree, no gate, no implementation.

## Step 1 — Understand what to research

If the user already wrote the question when invoking the command, use it directly. If not, ask with `AskUserQuestion` (or in plain text if it's one obvious thing):

- **What you want to research**: it can be something about the repo itself ("what other modules touch `order.status`?", "do we already have something like X?") or something external (a library, an approach, how a third-party API works).
- **Relevance tags** (optional): if the user already knows which domain/future story this might be useful for, ask for them; otherwise they're inferred from the topic.

## Step 2 — Detect the base repo

Same criterion `/legion` uses: the single subdirectory of `workspace/` with `.git` (aside from `worktrees/`). If there are zero or more than one, warn and stop — don't guess.

## Step 3 — Launch the agent

`Agent` with `subagent_type: "research-agent"`. You can launch it in the foreground (`run_in_background: false`) if it's a quick one-off and the user is waiting for the answer right there, or in the background if it looks like a long research task (several external sources) and the user prefers to keep doing something else meanwhile — ask if it's not obvious.

Prompt with:
- `BASE_REPO`: absolute path of the detected base repo
- `QUESTION`: the topic as the user gave it
- `ANNOUNCEMENTS`: absolute path of `.orchestrator/announcements/` (create the folder if it doesn't exist)
- `TAGS`: whatever was defined in Step 1

## Step 4 — Report

When the agent finishes, show the user a summary of the finding and the path of the Announcement that was published. If the user wants to keep digging, you can relaunch with `SendMessage` to the same agent instead of starting a new one (keeps the context of what's already been researched).

## Rules

- This command does **not** touch any worktree, doesn't create branches, doesn't implement code — it's pure research.
- It is not part of `/legion`'s batch flow: you can run it any time, whether or not there's an active orchestration. If there's an orchestration in progress, the Announcement it publishes remains available for active User Stories to consult (same mechanism as any other Announcement).
- If the question is actually "I want something implemented", stop and suggest writing a story with `/new-story` instead of forcing it here — this command is only for researching, not for producing code.
