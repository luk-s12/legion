---
name: patterns-and-smells
description: Design quality and code-smell detection guide, agnostic of language and paradigm (object-oriented, functional, imperative/procedural; works for frontend and backend). Agents in every worktree MUST apply it before implementing and before reporting FINALIZED, so that no User Story produces ugly or divergent code. The orchestrator uses it as a tiebreaker in architectural decisions.
---

Mandatory design-quality guide for all worktrees in this project. It complements (never contradicts) `CLAUDE.md` and the base repo's own rules — in case of conflict, the project's rules win.

This guide **does not assume any particular paradigm or framework**. The criteria and smell checklist in this file apply to any of them; the concrete examples of how they look in each one live in `references/`, so as not to bloat this file with pseudocode that doesn't apply to your worktree.

## References by paradigm

| File | When to read it |
|---|---|
| `references/paradigms/oop.md` | The project uses a predominantly object-oriented language/style (Java, C#, Kotlin, Python/PHP with classes, etc.) |
| `references/paradigms/functional.md` | The project uses a predominantly functional language/style (Haskell, Elixir, Clojure, F#, or JS/TS/Python/Kotlin written in functional style) |
| `references/paradigms/imperative.md` | The project uses a procedural style with no objects or higher-order functions as its core (C, classic Go, scripts, procedural SQL) |

## Frontend references (not a paradigm — it's a type of project that can be written in any of the ones above)

| File | When to read it |
|---|---|
| `references/frontend/react.md` | The project uses React |
| `references/frontend/vue.md` | The project uses Vue |
| `references/frontend/angular.md` | The project uses Angular |
| `references/frontend/vanilla.md` | The project uses no framework (plain JS/TS on the DOM) |
| `references/frontend/flutter.md` | The project uses Flutter (Dart) |

**Before designing** (Stage A), read the reference file(s) that match the project: its language's real paradigm, and if it's a frontend, also the real framework. If unsure which paradigm applies, look at the actual code syntax — don't assume it from the language's name: there are OOP backends written with classes used in an almost procedural way, and React frontends written in a very functional style.

## How to add a new paradigm or framework

1. Create `references/paradigms/<paradigm>.md` or `references/frontend/<framework>.md` following the same structure as the existing ones: the example for the central criterion (or for each Part 1 criterion, for a paradigm), the vocabulary of its own smells/mechanisms, and an error-handling section with the typical mechanism.
2. Add a row to the corresponding table above.

No need to touch the rest of this `SKILL.md`: the criteria and the checklist are the same for any paradigm, only the examples change.

# Part 1 — How to choose an approach when more than one is possible

The problem this part solves: two worktrees (two different User Stories) solve a similar design problem (e.g. "how do I share logic between two screens", "how do I structure a validation that repeats") with different solutions. The goal is for both to choose the same one.

## Step 0 — Check what the project already does

Before proposing a new approach, look at how the project ALREADY solves similar problems (read real code, don't assume). If an established convention exists — a shared hook/composable, a utility module, a feature-folder pattern, a common data-access layer — **use it**, don't invent an alternative. This matters more than any criterion below: consistency with the rest of the code wins.

**Replication criterion (when the convention comes from ANOTHER project)**: replicating a reference pattern means replicating its DESIGN (beans/structure, the pattern's own naming, property contracts), not its accidents. For every inherited detail (visibility, annotation, identifier language, property semantics, `@Primary`-style markers) ask: *does this detail have a reason to exist in the origin that ALSO applies here?* If the reason exists there but not here (e.g. `@Primary` justified by two coexisting factories in the origin, single factory here), don't inherit it. If it has no reason anywhere (e.g. a helper left package-private by oversight), do NOT inherit it — fix it in the replica and, where visible, suggest fixing the origin. An inherited detail without a reason is a smell, not consistency.

If the project has no clear convention for the problem at hand, apply these criteria in order (see concrete examples per paradigm in `references/paradigms/`):

1. **Is the logic pure (same input → same output, no side effects or external dependencies)?** → extract it to an independent function/module, testable in isolation. Don't mix it with code that does have effects (network, DOM, database).
2. **Does the logic depend on something external (network, database, storage, time, environment)?** → isolate it behind the project's own abstraction (client, repository, adapter, port), never call it directly from the middle of business logic or from a UI component.
3. **Does a flow coordinate 2+ distinct responsibilities or components?** → a single coordination point, don't spread the coordination across the pieces it coordinates.
4. **Does behavior change based on a business type/variant/condition?** → a mechanism that doesn't grow with every new variant (variant → behavior table/map, pattern matching, polymorphism — see the equivalent in your paradigm), instead of an ever-lengthening `if/else` or `switch`.
5. **Is the same construction/object/configuration built with rules in 2+ places?** → centralize it in a single construction point.
6. **Dependency/responsibility cap**: if a unit of code (class, module, function) needs more than 3-4 dependencies/parameters, or its description has several "and"s, it does too much — split by responsibility.

## Design principles (paradigm-agnostic)

These three principles don't assume classes, objects, or any particular paradigm's mechanism — they apply equally to a pure function, a script, or an OOP service. They're the "why" behind several of the criteria above and the smells in Part 2:

- **KISS (Keep It Simple)**: always prefer the simplest solution that solves the real problem. Unnecessary nesting, layers of indirection with no concrete problem behind them, or generalizing "just in case" are violations of KISS even if the code works.
- **DRY (Don't Repeat Yourself)**: don't duplicate business logic (duplicating incidental structure — for example two tests that look alike but verify different things — doesn't count). It's the principle behind the "duplicated code" smell in Part 2.
- **YAGNI (You Aren't Gonna Need It)**: don't build abstractions, parameters, configuration, or flexibility for a hypothetical case the current story doesn't ask for. It's the principle behind the "speculative generality" smell in Part 2 — if the project needs that flexibility later, add it then, not before.

**SOLID** (Single Responsibility, Open/Closed, Liskov, Interface Segregation, Dependency Inversion) was defined specifically for OOP — some letters (especially Liskov, which is about subtype substitutability) have no direct equivalent outside a system with inheritance/subtyping. Its detail lives in `references/paradigms/oop.md`, not here.

# Part 2 — Code smells: detection and refactor (paradigm-agnostic)

## Detection checklist (run it on EVERY file/component/module created or modified)

### Function/method smells
- **Long function** (> ~30 lines or > 3 levels of indentation) → extract functions with intention-revealing names.
- **Deep nesting** → guard clauses / early return, or your paradigm's equivalent for chaining validations without nesting.
- **Too many parameters** (> 3-4) → group into a named object/struct/record.
- **Flag argument** (a boolean that completely changes the function's behavior) → two functions with explicit names.
- **Magic numbers/strings** → named constants with business meaning, or a type/enum if the language supports it.

### Component/module smells
- **Does too much** (mixes data fetching + business logic + presentation + side effects, all together) → separate by responsibility.
- **Too many dependencies/props/imports** → see point 6 of Part 1.
- **A function uses more data/state from another module than its own** → move it to where that data lives.
- **The same 3+ values always travel together through function signatures** → group them into a named type/object/record.
- **A primitive value actually represents a business concept with limited rules/values** → a dedicated type/enum/union if the language supports it.
- **One-line module/file** that only re-exports or delegates without adding value → inline it, unless it's an intentional extension point.

### Duplication and coupling smells
- **Duplicated code** (same logic in 2+ places, even with different names — violates DRY) → extract to a shared function/module. **Before writing new logic, grep the worktree to see if something equivalent already exists.**
- **Shotgun surgery** (a business change forces you to touch 4+ files because the same rule is scattered) → centralize the rule in one place.
- **Divergent change** (the opposite: the same unit of code changes often, but for unrelated business reasons) → split it into independent units, one per reason to change.
- **Message chains / train wrecks** (`a.b().c().d()`, or the equivalent of accessing nested fields 3+ levels deep) → directly expose what's needed instead of traversing the whole chain from outside.
- **Middle man** (a unit of code that only delegates everything to another without adding its own logic) → call directly whoever does the real work, unless it's an intentional extension/isolation point.
- **Speculative generality** (parameters, configuration, or abstractions for hypothetical cases nobody has asked for yet — violates YAGNI) → simplify to what the current story needs; add flexibility when there's a second real case, not before.
- **Dead code** (functions, branches, or files that are no longer reachable/used) → remove it, don't leave it "just in case".
- **Comment as deodorant** (a long comment explaining why the code is confusing, instead of simplifying the code) → refactor until the comment is unnecessary; if the comment explains the "why" of a non-obvious decision, leave it — the smell is when it explains the "what" because the code doesn't explain itself.
- **Business logic in the wrong place**: business calculations in a presentation component, business validations in a data-mapping/transformation function → move it to where the project's business logic lives.
- **Abstraction leak**: details of an external data source used directly in business logic or in the UI → isolate them behind an own type + a conversion function.
- **Copy-pasting between different paradigms**: literally replicating a pattern from one paradigm in code from another purely out of habit → see `references/paradigms/<real-paradigm>.md` for your project's idiomatic approach.

### Error-handling smells
The smell is the same in any paradigm — "the error gets lost or says nothing useful" — but the mechanism changes (exceptions, Result/Either, return codes): see the detail and specific fix in `references/paradigms/<your-paradigm>.md`. Rule common to all: the same error built by hand 3+ times in a file → factor it into a helper.

## Application protocol (mandatory for every agent)

1. **Before implementing**: read the `references/paradigms/` file(s) (and `references/frontend/<framework>.md` if applicable) that match the project, choose the approach per Part 1, and report an `ARCHITECTURE` event stating the chosen approach and the problem it solves (the orchestrator compares it across worktrees).
2. **During**: for every extraction/refactor due to a smell, report a `REFACTOR` event naming the smell (e.g.: "extracted function `x` due to duplicated calculation in 2 components").
3. **Before reporting `FINALIZED`**: run the full Part 2 checklist over all created/modified files and fix whatever shows up. The `FINALIZED` event must declare: "smells checklist applied: no findings" or list the refactors done.

## Use by the Orchestrator

In every DEC-NNN decision, this guide is the tiebreaker: if two User Stories (worktrees) solved the same thing with different approaches, the winner is whichever meets the Part 1 criteria (starting with "is it already the project's convention?"); if neither meets them, the orchestrator orders both to do it the correct way.
