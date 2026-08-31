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

**Names — source hierarchy.** To choose any identifier, stop at the first that applies: (a) the target repo's explicit rules (`CLAUDE.md` / `AGENTS.md` / local rules / wherever `CONFIG` points); (b) conventions you can verify in the repo's existing code (read how it actually names analogous classes, methods, fields, tests — don't assume; if examples conflict, use the dominant convention among units with the same contract); (c) the official style guide of the language and framework in use (the framework's more specific convention governs its own API surface; the language guide governs the rest); (d) the vocabulary of the ecosystem's standard library and dominant APIs; (e) a recognised public style guide as a last resort. Never invent a personal convention and never guess "what a top company would do". Local consistency governs vocabulary and form; it never licenses a name that misrepresents behaviour, effects, mutation, absence, or failure. If a level has no accessible, verifiable source, continue to the next one. Do not browse the web unless the task and your available tools explicitly allow it.

**Comments and doc-comments.** Don't copy the surrounding comment density by inertia. Decide in this order: (1) the project's explicit rules; (2) what the public API or tooling requires (doc generation, published contracts, the ecosystem's norm for visible surface); (3) a local convention only if it carries real information — a non-obvious *why* documented consistently at that layer; (4) otherwise add nothing. Existing density alone never justifies copying noise.

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
- **Long function** (> ~30 lines or > 3 levels of indentation) → a signal to inspect, **not an automatic limit**. Extract when the unit mixes responsibilities or chains cohesive steps that each deserve a name; leave a coordinator that reads as a summary of the flow. Do **not** create trivial private methods, one-line delegations, or fragmentation that introduces *Middle man*, pointless navigation between pieces, or temporal coupling. Extraction must reduce cognitive load and improve cohesion — not just lower the line count. When you do extract, use intention-revealing names.
- **Redundant boolean plumbing** — returning a literal `true`/`false` from an `if` that already tests a boolean, comparing against a boolean literal (`x == true`), or an `if/else` whose branches differ only by the constant they return/assign. → return/assign the underlying boolean expression, or its direct negation when the constants are reversed, **only when** that expression is proven to be a strict, non-null, two-valued boolean and the direct form preserves the exact returned/assigned type and value, evaluation count, exceptions, short-circuiting, and side effects. Keep an explicit comparison, normalisation, or branch when the value is nullable, tri-state, dynamically typed/truthy, used for type narrowing, or when the explicit form adds a name, an early exit, or an observable effect.
- **Deep nesting** → guard clauses / early return, or your paradigm's equivalent for chaining validations without nesting.
- **Too many parameters** (> 3-4) → group into a named object/struct/record.
- **Flag argument** (a boolean that completely changes the function's behavior) → two functions with explicit names.
- **Magic numbers/strings** → named constants with business meaning, or a type/enum if the language supports it.

### Naming and readability smells
Applies to every kind of identifier: classes/interfaces/types/modules, functions/methods, properties/fields/variables, parameters, booleans/predicates, factories/conversions/lookups, and files where the ecosystem gives the filename meaning.

- **Misleading name** — a competent reader would expect a different **behaviour, effect, result, mutation, absence of result, or failure mode** than the real one; the name uses a term with an established ecosystem meaning that doesn't apply here; or several same-typed parameters whose names don't distinguish their roles/units, letting a caller pass them in the wrong order with no compiler signal (a latent behavioural fault). Cite the concrete wrong reading, same evidentiary bar as the rest of the checklist. → rename. This is a semantic defect, not a cosmetic one.
- **Uninformative name** — accurate and unambiguous, but vaguer than it could be: `data`, `process`, `handle`, `tmp`, a `Manager`/`Wrapper` with no real responsibility, a needless abbreviation, or a lone primitive that doesn't name its unit (`timeout` vs `timeoutMs`) where the value is still used unambiguously. → improve when you're already touching that code. The concrete unit suffix still follows Step 0's hierarchy.
- **Name that repeats the type/context** — words that add nothing the type or call site already says. → drop them when doing so preserves clarity and the repo's convention (clarity at the point of use).
- **Negated name forcing double negation** — a boolean/predicate named for the failing side of a condition that has an equally natural positive framing (`isInvalid`, `notReady`, `hasNoAccess`), so call sites read `!isInvalid` / `if not notReady`. → name it for the positive/normal case (`isValid`, `isReady`, `hasAccess`). This does **not** apply when the negative *is* the domain's natural, first-class state with no positive counterpart (`isEmpty`, `isDisabled`, `isClosed`) — those are fine. Applies to variables and function names alike.

A name should communicate, where relevant: purpose/responsibility, action/result, side effects vs. returning a new value, possible absence, validation/failure, the unit of a primitive, and a parameter's role. Do **not** apply a universal verb dictionary — the concrete vocabulary is ecosystem-specific and lives in `references/paradigms/<paradigm>.md`; verify it against the repo (Step 0 hierarchy) before applying it.

**Rename safety.** Before renaming, search callers and check public APIs, overrides/interfaces, cross-module references, reflection, serialized/schema/config names, framework bindings, scripts, and generated documentation. Fix new/private identifiers within the story. Rename an existing externally consumed contract only when the story authorises the migration and the repo's compatibility/deprecation mechanism is applied; otherwise report the smell without creating an out-of-scope breaking change. Review findings apply to what the story introduced or modified, not to an unchanged pre-existing signature merely located in a touched file.

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
- **Business logic in the wrong place**: business calculations in a presentation component, business validations in a data-mapping/transformation function → move it to where the project's business logic lives.
- **Abstraction leak**: details of an external data source used directly in business logic or in the UI → isolate them behind an own type + a conversion function.
- **Copy-pasting between different paradigms**: literally replicating a pattern from one paradigm in code from another purely out of habit → see `references/paradigms/<real-paradigm>.md` for your project's idiomatic approach.

### Comment and documentation smells
- **Comment / doc-comment noise** — names and structure carry the visible *what*. A comment is justified for information the code and signature cannot express clearly: a counter-intuitive decision, a workaround for an external bug, a non-obvious invariant, a unit, a side effect, a compatibility/security constraint, a link to a spec, or a method's/test's intent or scenario that its name, signature, and body cannot express clearly — keep those, and do not delete an existing one that still adds that information and remains true. Remove anything that only restates the signature (`@param user the user`), repeats the method/class name, narrates code whose reader already sees what it does, or is commented-out code. Add API doc-comments only when Step 0's precedence calls for them (many ecosystems — Java, Swift, Go — expect docs on visible surface; don't strip those). A comment/doc-comment that **contradicts** the real contract, effects, units or failure mode is worse than none — correct or remove it. **Comment as deodorant**: a long comment explaining why confusing code works → refactor until it's unnecessary, keeping only what code alone still cannot express.

### Error-handling smells
The smell is the same in any paradigm — "the error gets lost or says nothing useful" — but the mechanism changes (exceptions, Result/Either, return codes): see the detail and specific fix in `references/paradigms/<your-paradigm>.md`. Rule common to all: the same error built by hand 3+ times in a file → factor it into a helper.

## Application protocol (mandatory for every agent)

1. **Before implementing**: read the `references/paradigms/` file(s) (and `references/frontend/<framework>.md` if applicable) that match the project, choose the approach per Part 1, and report an `ARCHITECTURE` event stating the chosen approach and the problem it solves (the orchestrator compares it across worktrees).
2. **During**: for every extraction/refactor due to a smell, report a `REFACTOR` event naming the smell (e.g.: "extracted function `x` due to duplicated calculation in 2 components").
3. **Before reporting `FINALIZED`**: run the full Part 2 checklist over all created/modified files and fix whatever shows up. The `FINALIZED` event must declare: "smells checklist applied: no findings" or list the refactors done.

## Use by the Orchestrator

In every DEC-NNN decision, this guide is the tiebreaker: if two User Stories (worktrees) solved the same thing with different approaches, the winner is whichever meets the Part 1 criteria (starting with "is it already the project's convention?"); if neither meets them, the orchestrator orders both to do it the correct way.
