---
name: new-lesson
description: Assistant for recording in .orchestrator/lessons-learned.md an incident (in production or any other environment) caused by a business rule that hadn't been accounted for. Asks for the minimum data, fills in the date on its own, formats it, and if the responsible User Story is identifiable updates .orchestrator/reputation.md - so future User Stories touching the same code zone find it before repeating the mistake.
---

Guide the user to record a lesson learned — a real incident that happened because a business rule wasn't accounted for during implementation. The value of this is purely preventive: the next time a story touches the same zone of code, `research-agent`'s "prior research" mode (or `/new-story`'s reinforced analysis) will find it and warn about it, before the same kind of surprise repeats.

## Step 1 — Ask for the data

Ask with `AskUserQuestion` (or take them from what the user already said in the conversation, without asking again what they've already stated):

1. **Zone**: which entity/field/module of the code is involved (e.g. `order.status`, "checkout module"). The more specific, the better it matches later.
2. **What broke and in which environment**: a brief description of the symptom or the fix that had to be shipped, and in which environment it happened (production, staging, whatever — don't assume it's always production).
3. **Real business rule that was missed**: the rule that existed in the system and wasn't documented/considered.
4. **Story or branch that caused it** (optional): the story ID, or the branch name, whose implementation caused the incident — whatever the user has on hand, there isn't always a tracked story.

The user doesn't need to have all four pieces neatly separated — if they give the info mixed into a single sentence, extract it yourself and confirm the result before writing. **The date is not asked**: it's taken automatically from the current system date when saving.

## Step 2 — Write the lesson

If `.orchestrator/lessons-learned.md` doesn't exist, create it with this header:

```md
# Lessons learned

Incidents (in production or any other environment) caused by a business rule not accounted
for during implementation. Kept as permanent history across runs — never reset. Consulted
by `research-agent` (prior-research mode) and by `/new-story`'s analysis, filtering by Zone,
before designing any new story on the same part of the code.
```

Append the lesson at the end, with the next available ID (`LL-001`, `LL-002`, ...):

```md
## Lesson LL-<NNN>
**Zone**: <what the user said>
**What broke and in which environment**: <...>
**Real business rule that was missed**: <...>
**Story or branch that caused it**: <story ID, branch name, or "not applicable / unknown">
**Date**: <filled in automatically, with the current system date — never asked>
```

Never overwrite previous lessons — this is an append-only file, same as events.

## Step 3 — Confirm

Show the user the lesson as it ended up drafted before saving it. Once OK'd, write it. Close by informing: lesson added with its ID, and that from now on any story whose impact zone matches "<Zone>" will find it automatically in its prior analysis.

## Step 4 — Update reputation (only if there's an identifiable story)

If `## Story or branch that caused it` ended up with a concrete story ID (not "not applicable/unknown"), search `.orchestrator/assignments.md`/`.orchestrator/events/<Story-ID>.md` (if they still exist) for which agent implemented that story. If found:

1. In `.orchestrator/reputation.md`, add 1 to that agent/domain's "Post-closure findings" counter.
2. Add a row to the `## Post-closure findings detail` table: `| <Story-ID> | <agent> | LL-<NNN> | <Zone> |`.

If the agent cannot be identified (the events no longer exist, or the user only gave a branch name with no further context), don't force a guess — the lesson stays saved either way (that doesn't depend on this) and report that reputation could not be updated for lack of a trace.

## Rules

- Writes to `.orchestrator/lessons-learned.md` and, when Step 4 applies, to `.orchestrator/reputation.md` — doesn't touch code or any other system file.
- Don't invent the business rule or the incident's detail — everything has to come from what the user tells you, not from assumptions.
- If the Zone the user gives is too vague ("the backend"), ask them to narrow it down (an entity, a field, a concrete module) — a lesson that's too broad doesn't match well later and ends up as noise.
