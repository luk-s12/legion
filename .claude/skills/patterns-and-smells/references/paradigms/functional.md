# Examples — Functional paradigm

How the criteria from Part 1 and the smells from Part 2 of `SKILL.md` look in functional style. Read this file when the project uses a predominantly functional language/style (Haskell, Elixir, Clojure, F#, or JS/TS/Python/Kotlin written in functional style: pure functions, immutability, composition).

## Criterion 1 — pure logic vs. side effects

```
-- Bad — mixed
totalWithDiscount items = do
  rules <- fetchDiscountRules    -- effect (network/DB)
  let t = calculate items rules  -- pure calculation mixed with the effect
  saveToDB t                     -- another effect
  return t

-- Good — separated
calculateDiscount :: [Item] -> [Rule] -> Total   -- pure function, testable without IO
calculateDiscount items rules = ...

totalWithDiscount items = do
  rules <- fetchDiscountRules
  let t = calculateDiscount items rules
  saveToDB t
  return t
```

The pure function ends up testable with direct inputs/outputs, no IO mocks. The effects stay at the "impure edges" (the application's boundaries), not scattered in the middle of the logic.

## Criterion 2 — isolate external dependencies

Inject effects as a parameter (pass the fetch/save function as an argument) or a tagged/monadic effect (`IO`, `Task`, `Effect`) — never call the external dependency from the middle of a function that's supposed to be pure.

## Criterion 3 — single coordination point

A high-level function that composes (`pipeline`, `compose`, `|>`) the functions for each responsibility, instead of each function coordinating the others on its own.

## Criterion 4 — behavior per variant

```
data PaymentType = Card Credential | Cash

process :: PaymentType -> Amount -> Result
process (Card cred) amount = ...
process Cash amount = ...
```

Exhaustive pattern matching (the compiler warns if a case is missing) instead of a chained `if/else` over a string/enum value.

## Criterion 5 — centralized construction

A "smart constructor": a single function that builds the value validating invariants, instead of repeating the construction with its rules at each call site.

## Criterion 6 — responsibility cap

A function with more than 3-4 parameters, or a pipeline with unrelated steps mixed into a single function → split into smaller functions and compose them.

## Smell vocabulary (functional equivalents of the classic OOP smells)

- **Ambiguous name on a transformation** — a pure transformation whose name doesn't say what it produces, or a function whose name hides that it performs effects (IO, state) alongside the transformation. Predicates read as questions (`is…`/`has…` where idiomatic); constructors/smart-constructors use the ecosystem's convention (`mk…`, `make…`, `of…`). Verify against the codebase.
- **Comment noise** — header/doc comments that restate the signature or the type. Keep only the non-obvious information (a law the function must satisfy, a totality/partiality note, a performance trade-off).
- **Function that does too much** (equivalent to "god class"): mixes fetch + calculation + persistence in the same `do`/block.
- **A function uses more data from another module than its own** (equivalent to "feature envy"): move it to that module.
- **The same 3+ values travel together as loose parameters** (equivalent to "data clumps"): group them into a named record/tuple.
- **One-line function that only re-exports another**: inline it, unless it's the module's intentional public entry point.

## Error handling

Typical mechanism: `Result`/`Either`/`Option`/`Maybe` types, or convention tuples (`{:ok, value}` / `{:error, reason}` in Elixir). Smell: using `unwrap`/a partial pattern match that can fail at runtime, or mapping every error to the same generic value, losing the original cause. Fix: handle each error variant explicitly, or propagate the `Result`/`Either` without unwrapping it if the caller can handle it better (don't "unwrap" prematurely).
