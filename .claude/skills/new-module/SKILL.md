---
name: new-module
description: Installs an external module (a Claude Code project — an agent, optionally with skills — that plugs into an orchestration as a story gate, a standalone generator, or a story implementer that writes code directly). Clones the repo, validates its manifest, runs a best-effort risk scan (tools, network patterns, vulnerable dependencies), shows the user a preview, and only registers it in modules/registry.md once accepted.
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


Install a module into `modules/installed/<name>/` — external code Legion does not own. Your job
is **validation before trust**, never a rubber stamp: `Tools:`/`Writes to:` declared in a
manifest are worthless if nobody checks them before the module ever runs. See
`modules/README.md` for the full folder layout and manifest format this skill implements
against.

**Arguments**: `/new-module <repo-or-path>` (a git URL or a local path to clone/link from).

## Step 1 — Clone

Clone (or link, if it's a local path) the external repo into a staging location (a temp folder —
never directly into `modules/installed/` yet, since a multi-module repo needs splitting before
anything lands there permanently, see below).

Whenever the flow below resolves a final `<name>` and is about to copy, first refuse to overwrite
an existing `modules/installed/<name>/`. If its registry row is `installed`/`deprecated`, ask
whether this was meant as an update (`/module activate` plus version check, not a second install).
If its row is `uninstalled` or absent, report the exact residue and require separately confirmed,
contained cleanup; never reuse it silently.

**Detect single vs. multi-module repo**: check for `module.md` at the staged clone's root.
- **Found at root** → single-module repo, the common case. `<name>` = the repo name unless the
  user specifies one. Copy the staged clone into `modules/installed/<name>/` and continue to Step
  1bis with that one module.
- **Not found at root** → scan immediate subdirectories for a `module.md` each (one level deep
  only — this isn't a recursive module finder, just support for the "one repo, several sibling
  module folders" layout the official `legion-modules` template repo itself uses). **Skip any
  subdirectory starting with `_`** (e.g. `_template/`) — that's scaffolding/reference material,
  never an installable module, same convention Step 1bis already treats `_template/module.md` as
  a template source rather than something to install as-is.
  - **Exactly one match** → treat it the same as the single-module case above (copy that
    subfolder's content into `modules/installed/<name>/`, `<name>` = the repo name unless
    specified), not the multi-module flow below — no point announcing "1 of 1 modules" as if it
    were a batch.
  - **Two or more matches** → multi-module repo. Report to the user, before doing anything else,
    which module folders were found (and which were skipped for starting with `_`). For **each**
    detected module, in sequence — never in parallel, so previews/registry writes never race —
    run Steps 1bis through 7 as normal, with two adjustments: `<name>` = `<repo>_<subfolder>`
    (underscore joining the repo's own name and the subfolder's name, each keeping its own
    internal hyphens as-is — e.g. a `legion-modules` repo with an `api-collections/` subfolder
    installs as `legion-modules_api-collections`) and the module's source directory for every
    subsequent step is that subfolder of the staged clone, copied into
    `modules/installed/<repo>_<subfolder>/` as its own self-contained module directory (never a
    symlink or shared clone between the detected modules — each installed module folder is
    independent, same invariant every other part of this system already assumes about
    `modules/installed/<name>/`). **After the last one is resolved** (registered, trimmed, or
    discarded), report a final summary: which of the detected modules got registered, which were
    discarded, and which were skipped for starting with `_` — so the user doesn't have to
    reconstruct the outcome from N separate decision prompts.
- Delete the staging clone once every detected module has been copied into its final
  `modules/installed/<name>/` location (single or multi-module case alike) — nothing should be
  left referencing the temporary checkout.

**Record a source fingerprint, always** (this is what makes the version/contract check in
`legion/SKILL.md` "Module stages" and `run-module/SKILL.md` "Version/contract check" possible later — `modules/installed/
<name>/` is a **plain copy**, deliberately with no `.git` of its own, so there's nothing there for
those checks to `git fetch` against; a content hash is the mechanism that actually works
regardless of whether `<repo-or-path>` was a git URL or a local path): concatenate `module.md` +
the file at `agent_entrypoint` + `provides_rules`'s file (if declared) + every `provides_skills`
file (if declared), in that fixed order, and hash the result. Write it to
`modules/installed/<name>/.legion-source.md`:
```md
---
source: <repo-or-path as given to /new-module>
source_hash: <hash>
recorded_on: <ISO date>
---
```
This is Legion's own bookkeeping file, not something the module author provides — same class of
write as `.legion-module-config.md` for a `generator`'s saved format preference. Never read its
content as part of the module's own instructions.

## Step 1bis — Autoconfig assist (only if `module.md` still has template placeholders)

Legion's official template (`legion-modules/_template/module.md`) marks every field a module
author has to decide with a literal `<...>` placeholder — the same convention
the selected catalog entry and real repo use for unresolved project facts. Before parsing required
fields in Step 2, check whether `type` or any field required for it still contains a `<...>`
placeholder. If so, this is a manifest someone copied from the template and hasn't finished
filling in — a real, expected case, not a broken module. Don't reject it; run an interactive
assist instead:

1. If `type` itself is still unresolved (`<gate|generator>`), ask first with `AskUserQuestion` —
   nothing else in this step can proceed without it.
2. If `agent_entrypoint` already resolves to a real file, read it: its frontmatter `tools:` can
   pre-fill the manifest's `tools:` list directly (same values, just reformatted from
   comma-separated to a YAML list) — offer it as a pre-filled default, never apply it silently
   without the user seeing what was inferred.
3. Ask whatever required fields are still `<...>` via `AskUserQuestion`, batched up to 4 per
   question call (same pacing as the design-reviewer loop), with a sensible default pre-selected
   wherever the field format in `modules/README.md` documents one (`default_activation: opt-in`,
   `blocking: true`, `requires_local_config: false`, `max_concurrent`'s derived-default rule) —
   free text is only needed for values nothing can guess (`valid_stages`, `default_stage`,
   `writes_to`, `output`).
4. Write the resolved values back into `modules/installed/<name>/module.md` — this is Legion
   writing into its own freshly cloned copy from Step 1, not into the module author's source
   repo, so it's the same class of write Step 1's clone already performs.
5. Continue to Step 2 against the now-resolved manifest. A field the user skips answering stays
   as a real gap — Step 2's required-field check still applies to it exactly as it would to any
   other incomplete `module.md`. Autoconfig fills placeholders, it never exempts anything from
   the contract.
6. Record in the preview built at Step 5 that this manifest was completed via autoconfig, so the
   user approving the install knows part of what they're reviewing wasn't authored as-is by the
   module.

A field the author already replaced with a real, non-placeholder value is never touched or
second-guessed by this step — autoconfig only ever fills in what's still literally `<...>`.

## Step 2 — Parse `module.md` and check required fields

Read `modules/installed/<name>/module.md` (after Step 1bis has resolved whatever template
placeholders it could). Required fields depend on the declared `type` — validating against a
single fixed list would reject valid manifests of the other type:

- **Always**: `type`, `tools`, `agent_entrypoint`.
- **`type: gate`**, additionally: `valid_stages`, `default_stage`, `default_activation`,
  `writes_to` (the key must exist even if empty), `blocking`. Optionally `provides_skills`/
  `provides_rules` (see `modules/README.md`, "Skills and rules a module brings").
- **`type: generator`**, additionally: `output`, `scope`. If `provides_skills`/`provides_rules`
  is present on a `generator` → **reject outright**: this `type` never enters the story/
  `worktree-agent` cycle, there's no consumer for either field.
- **`type: implementer`**, no additional required fields beyond `type`/`tools`/
  `agent_entrypoint`; optionally `provides_skills`/`provides_rules` (same format as `gate`).
  **Reject outright** if any of `writes_to`, `blocking`, `valid_stages`, `default_stage`,
  `max_rejection_rounds`, `max_concurrent` is present — none of these apply to this `type` (see
  `modules/README.md`, "`type: implementer` — a module that writes code"). `max_concurrent` in
  particular has nowhere to plug into: unlike a gate's active-report limit (see `legion/SKILL.md`,
  "Module stages", derived from `modules/reports/<name>/<project>/` entries with no final verdict), an implementer subtask doesn't
  produce a report in that shape — accepting the field would just have it silently ignored at
  launch, so it's rejected instead of shipping a knob that does nothing. **Reject outright** if
  `default_activation: always` is declared for this `type` — only `opt-in` is valid here (the
  field can simply be omitted, since `opt-in` is its only valid value).

If a required field for the declared `type` is missing or still an unresolved `<...>`
placeholder that Step 1bis didn't get an answer for, **reject outright** — this is not a risk
decision, it's an incomplete manifest that can't be evaluated. Do not proceed to Step 3.

If `provides_skills` is present (`type: gate` or `type: implementer`), verify each listed path
resolves to a real file inside `modules/installed/<name>/` — **reject outright** if any path is
missing, same as a missing required field: a dangling `provides_skills` entry would otherwise
only surface later, at runtime, when an agent tries to read `MODULE_SKILLS` and fails mid-story.

If `provides_rules` is present (`type: gate` or `type: implementer`), verify its path resolves to
a real file inside `modules/installed/<name>/` — **reject outright** if missing, same reasoning
as above — then parse it (format in `modules/README.md`, "`rules.md` format") and **reject
outright** if any entry is missing a `rule_id`, or if two entries share the same `rule_id` — a
malformed rules file can't be negotiated later, this is caught now, at install time, same as any
other incomplete manifest. This is form validation only — **no negotiation of accept/reject
happens in this skill**: that's
lazy, per-project, triggered by `/legion` the first time a project actually uses the module (see
`modules/README.md`, "Negotiation of `provides_rules`", and `legion/SKILL.md`, "Module stages").

## Step 3 — Consistency checks

- **`tools` classification**: compare each declared tool against the known set already used by
  `.orchestrator/capabilities.md` (`Read, Grep, Glob, Bash, Write, Edit`). Anything outside that
  set (`WebFetch`, `WebSearch`, third-party MCP tools) is flagged as a **risk**, not
  auto-rejected.
- **`writes_to`/`tools` consistency** (`type: gate`): if `writes_to` is non-empty, `Write` or
  `Edit` must be in `tools`; if empty, they shouldn't be. **`type: generator`**: same check
  against `output` instead (always declared for this type) — if it's declared, `Write` or `Edit`
  must be in `tools`.
- **Cross-check against the real agent**: open the file at `agent_entrypoint`, compare its own
  frontmatter `tools:` against the manifest's `tools:`. Any tool the agent actually uses that the
  manifest didn't declare is a risk item (stale or misleading manifest).
- **`writes_to` collision** (`type: gate` only): compare against the `writes_to` of every other
  `installed`/`deprecated` module in `modules/registry.md`. Overlap is flagged, not blocked —
  could be intentional.

## Step 4 — Best-effort security scan (informative, never blocking on its own)

Neither of these two checks is a technical barrier — they're grep-based/best-effort, and their
purpose is to put real information in front of the user, not to gatekeep automatically. Not even
a `Critical` finding forces a discard by itself.

- **Network patterns**: grep the cloned code for common HTTP client imports/calls (`fetch`,
  `axios`, `requests`, `http.client`, `urllib`, `Net::HTTP`, `net/http`, `curl`/`wget`
  invocations in scripts, low-level sockets), hardcoded URLs/IPs, and env var names suggestive
  of an exfiltration target (`WEBHOOK_URL`, `COLLECT_ENDPOINT`). This is pattern matching, not
  data-flow analysis or execution — expect false positives (legitimate telemetry) and false
  negatives (obfuscated code). If `tools` includes `Bash`, add an explicit note regardless of
  scan results: the module can read anything the process can reach, not just what `writes_to`
  declares — this is a disclosed, accepted risk, not something this scan or any other mechanism
  in this system can technically prevent.
- **Vulnerable dependencies**: detect a recognizable manifest (`package.json`+lock,
  `requirements.txt`/`pyproject.toml`, `pom.xml`/`build.gradle`, `go.mod`, `Gemfile`,
  `Cargo.toml` — a polyglot module may have more than one) and run the matching ecosystem audit
  tool if available (`npm audit`, `pip-audit`, `govulncheck`, `bundle-audit`, `cargo-audit`, the
  Maven/Gradle equivalent). If no manifest is found, say so ("no dependency manifest found —
  check not applicable"). If a manifest is found but the tool isn't available in this
  environment, say so explicitly ("`pip-audit` not available — check skipped, could not
  validate") — never omit the check silently.

## Step 5 — Build the preview

Write `modules/pending/<name>.md`:

```md
---
module: <name>
status: PENDING APPROVAL
type: <gate|generator>
source: <repo-or-path>
scanned_at: <ISO timestamp>
autoconfigured: <true|false>              # true only if Step 1bis resolved at least one placeholder
---

# Risk preview: <name>

## Declared manifest
(the full `module.md` frontmatter block, verbatim — if `autoconfigured: true`, add a short note
above the block listing which fields were filled in by the assist rather than authored as-is by
the module's source)

## Tools: classification
| Tool | Status | Note |
|---|---|---|
| ... | Known / ⚠ unknown | ... |

## Cross-check: manifest vs. Agent entrypoint
| Tool | Declared in module.md | Used by the agent | Discrepancy |
|---|---|---|---|
| ... | ... | ... | ... |

## Skills propuestas
(only if `provides_skills` is present — omit the section entirely otherwise)
| Path | Summary |
|---|---|
| ... | one line pulled from the `SKILL.md`'s own description/intro |

## Rules propuestas
(only if `provides_rules` is present — omit the section entirely otherwise; no verdict column —
nothing gets negotiated here, that happens per-project the first time `/legion` needs it)
| rule_id | Enunciado |
|---|---|
| ... | ... |

## Network scan (best-effort)
| Pattern | File | Line | Note |
|---|---|---|---|
(or: "No known network patterns matched — this doesn't guarantee no network access, it's pattern matching, not data-flow analysis")

## Vulnerable dependency scan
Tool used: <tool> (manifest detected: <file>)
| Package | Severity | Advisory |
|---|---|---|
(or the "not found"/"tool unavailable" note from Step 4)

## Agent entrypoint (full content)
(the complete file — same rule as reading a file in full before distributing it)

## Decision
Pending.
```

Sections that don't apply to the declared `type` (e.g. the `writes_to` row for a `generator`)
are simply omitted, not left empty.

## Step 6 — Decision

**Point the user at the file before asking, not just a chat summary**: an `AskUserQuestion` option's description is a one-liner — it cannot carry the full network-scan table, the complete dependency list, or the agent's entire content. Before calling `AskUserQuestion`, tell the user in chat that the full preview is at `modules/pending/<name>.md` and that it's worth opening before deciding — same pattern `/new-story` already uses for its own file preview (do not assume a short chat recap is equivalent to having read it). A condensed version of the highest-severity findings can still go in the question text itself (that's a helpful summary, not a substitute for the file), but the file reference always comes first.

**Extra warning if `provides_skills`/`provides_rules` + `default_activation: always`**: if the
module declares either field AND the user is about to register it with `default_activation:
always`, ask a separate confirming question BEFORE the main decision below: this combination
means every story of every project that ever uses this module gets its skills/rules included in
its prompt automatically, with no per-story `## Modules` mention needed. `opt-in` doesn't need
this — it's the expected behavior already.

Then ask with `AskUserQuestion`:
- **Register as-is**
- **Register trimming `Tools:`** to only what's classified as known-safe — if the tool being
  trimmed appears as used by the agent in Step 3's cross-check, warn explicitly first that
  trimming it will likely break the module, not just make it safer; don't offer it as a free
  action.
- **Discard**

For either registration choice, acquire the global metadata mutex at
`.orchestrator/runtime/catalog.lock`, reread `modules/registry.md`, apply the installed row to a
sibling `modules/registry.md.candidate-<session>`, validate that every prior row remains exactly once
and the new row is complete, rename it to the exact registry destination, reread/compare it, then
release the verified mutex. Only after this durable publication delete the exact
`modules/pending/<name>.md`. For **Discard**, acquire the same global metadata mutex, reread the
registry and verify that `<name>` has no row. Then resolve the just-created
`modules/installed/<name>/`, prove it is the exact expected child (matching name, contained real
path, not a symlink/junction), and remove that exact unregistered tree plus the exact
`modules/pending/<name>.md` after confirmation. Never use a shell glob, `rm -r` or `rm -rf`; no
broad deletion permission is granted. If cleanup fails, release the mutex, report the precise
residue and leave the registry unchanged so a later confirmed retry is safe. If
`requires_local_config: true` and
`modules/installed/<name>/.env.<project>.local` doesn't exist, tell the user it's needed before
the module's first real run — check existence only, never read its content.

Clamp `max_rejection_rounds` (if declared, `type: gate` only) to the core three-round review limit
— if it's higher, lower it with a note explaining why.

## Step 7 — Signal capture (optional, skippable)

After the decision, one more short `AskUserQuestion` (multiSelect, skippable): *"What helped you
decide?"* — options: manifest/tools classification, network scan, dependency scan, full agent
content, something else. Append the answer (or "skipped") as a new row to the tracking table in
`mejoras-pendientes-modules.md` (item 1) at the repo root, if that file exists — this is
lightweight signal capture for tuning the preview format later, not a blocking step; if the file
doesn't exist, skip this silently.

## Rules

- Never read the content of a `.env.*.local` file — existence only.
- Never widen `tools` beyond what Step 6 ends up registering — the orchestrator does not extend
  a module's permissions at launch time later.
- `type: implementer` is installable, but never with `default_activation: always` and never with
  `writes_to`/`blocking`/`valid_stages`/`default_stage`/`max_rejection_rounds`/`max_concurrent` —
  reject at Step 2 (see `modules/README.md`, "`type: implementer` — a module that writes code").
- Never accept a `provides_skills`/`provides_rules` path that doesn't resolve to a real file
  inside the module's own clone — reject at Step 2, don't let it surface later as a runtime read
  failure mid-story.
