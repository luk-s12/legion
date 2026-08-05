# Examples — Imperative/procedural paradigm

How the criteria from Part 1 and the smells from Part 2 of `SKILL.md` look in imperative/procedural style (no objects or higher-order functions at its core). Read this file when the project uses a predominantly procedural language/style (C, classic Go, scripts, Bash, procedural SQL, or the imperative parts of any multi-paradigm language).

## Criterion 1 — pure logic vs. side effects

```
// Bad — mixed
function totalWithDiscount(items) {
  rules = fetchDiscountRules()      // effect (network/DB)
  total = 0
  for item in items: total += apply(item, rules)  // calculation mixed with the effect
  saveToDB(total)                   // another effect
  return total
}

// Good — separated
function calculateDiscount(items, rules) {  // pure function, testable without network/DB
  total = 0
  for item in items: total += apply(item, rules)
  return total
}
function totalWithDiscount(items) {
  rules = fetchDiscountRules()
  total = calculateDiscount(items, rules)
  saveToDB(total)
  return total
}
```

## Criterion 2 — isolate external dependencies

A module/file with a single access function (e.g. `db.go`, `http_client.c`) that the rest of the code calls, instead of making the external call (SQL query, HTTP request) inline in the middle of business logic.

## Criterion 3 — single coordination point

A `main`/flow-control function that calls each responsibility's functions in order; avoid low-level functions calling one another "on their own", forming implicit chains that are hard to trace.

## Criterion 4 — behavior per variant

```
// Bad — grows with every new type
if paymentType == "card": processCard(amount)
elif paymentType == "cash": processCash(amount)
elif paymentType == "transfer": ...  // keeps growing

// Good — dispatch table
handlers = { "card": processCard, "cash": processCash }
handlers[paymentType](amount)
```

## Criterion 5 — centralized construction

A single `create_x(...)` function that builds the data structure with its defaults and validations, reused at every call site instead of repeating the construction by hand.

## Criterion 6 — responsibility cap

A function with more than 3-4 parameters, or a script/file that mixes input parsing + logic + IO + output formatting → split into functions/files with one responsibility each.

## Smell vocabulary

- **Script/function that does too much** (equivalent to "god class" in OOP): a single file/function that parses, calculates, persists, and logs everything together.
- **A function that uses more data from another module than its own** (equivalent to "feature envy"): move it to that module.
- **The same 3+ values always travel together as loose parameters** (equivalent to "data clumps"): group them into a named structure/struct.
- **Mutable global variables shared between unrelated functions**: a smell specific to this paradigm — encapsulate the state in a structure passed explicitly, or in a module with a clear access API.

## Error handling

Typical mechanism: return codes (`errno`, `(value, error)` in Go, sentinel values like `-1`/`NULL`). Smell: ignoring the error return code, or using a sentinel value with no documentation of what it means. Fix: always check the error code when the function returns one; if the check repeats identically in 3+ places, wrap it in a function that centralizes the handling (log + decision to continue/abort).
