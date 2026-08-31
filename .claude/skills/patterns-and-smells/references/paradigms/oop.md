# Examples — Object-Oriented Paradigm (OOP)

How the criteria from Part 1 and the smells from Part 2 of `SKILL.md` look in OOP. Read this file when the project you're implementing uses a predominantly object-oriented language/style (Java, C#, Kotlin, Python with classes, PHP with classes, etc.).

## Criterion 1 — pure logic vs. side effects

```
// Bad — mixed
class Order {
  totalWithDiscount() {
    rules = this.discountRepo.fetch();   // effect (network/DB)
    total = 0;
    for (item of this.items) total += apply(item, rules); // pure calculation mixed in
    this.repo.save(total);               // another effect
    return total;
  }
}

// Good — separated
class DiscountCalculator {
  calculate(items, rules) { ... } // pure function, testable in isolation without network/DB mocks
}
class Order {
  constructor(calculator, discountRepo, repo) { ... }
  totalWithDiscount() {
    rules = this.discountRepo.fetch();
    total = this.calculator.calculate(this.items, rules);
    this.repo.save(total);
    return total;
  }
}
```

## Criterion 2 — isolate external dependencies

Interface + implementation injected via constructor: `interface DiscountRepository { fetch(): Rules }`, never instantiate the HTTP/DB client directly inside a domain class.

## Criterion 3 — single coordination point

An orchestrating/use-case class coordinates 2+ services; the services don't know about each other and don't coordinate on their own.

## Criterion 4 — behavior per variant

```
interface Payment { process(amount): Result }
class CardPayment implements Payment { process(amount) { ... } }
class CashPayment implements Payment { process(amount) { ... } }
// selection via factory, never a switch(paymentType) in the service
```

## Criterion 5 — centralized construction

Factory or Builder when constructing the object has non-trivial rules/defaults repeated in 2+ places. If the language supports simple immutable objects (records, data classes), prefer them over a hand-rolled Builder.

## Criterion 6 — responsibility cap

More than 3-4 dependencies injected in the constructor, or a class whose description needs several "and"s → split by responsibility (extract a collaborator, or move coordination to an orchestrator).

## Smell vocabulary (classic terms from OOP books — Fowler, *Refactoring*)

- **God class**: does too much (persists + calls external services + calculates + publishes events).
- **Feature envy**: a method uses more data/state from another class than its own → move it to that class.
- **Data clumps**: the same 3+ fields travel together across several signatures → group them into a value object.
- **Lazy class**: a class that only delegates without adding value → inline it, unless it's an intentional layer port (infrastructure interface).

## Error handling

Typical mechanism: exceptions (`try/catch`, checked/unchecked). Smell: an empty `catch` or one that only logs without propagating; a generic exception (`throw new RuntimeException("something went wrong")`) with no type or context. Fix: typed domain exceptions, propagate unless the layer is explicitly meant for containment (e.g. a queue listener).

## SOLID (OOP-specific — not in `SKILL.md` because it assumes subtyping/inheritance)

- **S — Single Responsibility**: one class, one reason to change. It's the same criterion 6 from Part 1 applied to classes — if you need several "and"s to describe it, split it.
- **O — Open/Closed**: a class should be extendable (add new behavior) without modifying its existing code. Achieved with polymorphism (interface + new implementations) instead of adding one more `if`/`switch` to an existing class every time a new variant appears — see Criterion 4 above.
- **L — Liskov Substitution**: any implementation of an interface/subclass must be able to replace the base without breaking the behavior expected by its caller (don't weaken preconditions or strengthen postconditions, don't throw exceptions the base type didn't throw). Typical smell: a subclass that throws `UnsupportedOperationException` on an inherited method, or silently ignores a parameter the base did use — a sign that the "is-a" relationship wasn't real and composition would have been better than inheritance.
- **I — Interface Segregation**: an interface shouldn't force implementing methods a client doesn't need. Smell: an interface with 8+ methods where each implementation only uses 2-3 → split it into smaller, more specific interfaces.
- **D — Dependency Inversion**: high-level modules (business logic) shouldn't depend on low-level modules (infrastructure details) but on abstractions — it's the same Criterion 2 above (isolate external dependencies behind an interface), phrased as a principle about the direction of dependencies.

## Naming and contracts in OOP

Classes and interfaces are normally nouns or noun phrases; methods are normally verbs or verb phrases, subject to the repo's real convention. The name must expose contract differences that matter at the call site, such as mutating the receiver versus returning a new value (for example, Kotlin's `sort` / `sorted`). Avoid vague role words such as `Manager`, `Wrapper`, or `Helper` when they do not name a real responsibility.

`assertUserIsActive` vs `validateUserIsActive` / `checkUserIsActive` / `ensureUserIsActive` — the right verb depends on the **real contract**:
- only queries and returns a boolean → the repo's predicate form (`is…` / `has…` / `can…` are common examples);
- collects and returns the list of violations → `validate…`;
- throws when the condition doesn't hold → `validate…` / `check…` / `require…` in the repo's style;
- tries to *make* the condition true → `ensure…`;
- represents an assertion/precondition under the repo's established vocabulary → `assert…` may be accurate.

None of these verbs is universally correct without knowing the contract. Do not confuse a language keyword such as Java's `assert` (which may be disabled at runtime) with an ordinary method named `assert…` (which executes normally). In many Java/Kotlin/C# codebases `assert…` may suggest a test/debug helper, while APIs such as Spring's `Assert` use assertion vocabulary for runtime preconditions. For domain validation, choose the verb that best communicates the real contract under Step 0's hierarchy; never reject `assert…` from spelling alone.

## Lookups and absence of result

A lookup that may find nothing must communicate absence through the mechanism and vocabulary verified in that repo. Possible examples, not universal rules: Java/Spring often combines `Optional<T>` with families such as `find…`; Kotlin may use `T?` and `…OrNull`; C# may use `T?` or `TryGet(out …)`. `Optional` is only a Java example, and `find…` does not have one universal meaning even within Java. Go and Rust generally avoid `Get`/`get_` prefixes on getters, not every use of `get` and not every lookup name. Use the concrete API's own vocabulary.

## Doc-comments in OOP

Do not add doc-comments by default to internal application classes/methods (services, controllers, components, DTOs) when they only paraphrase the signature. Keep or add documentation for a non-obvious invariant, contract, effect, or constraint. On externally consumed surfaces, follow the repo's, tooling's, and ecosystem's real requirements. Never add `@param`/`@return` text that only repeats the name and type. Step 0's precedence decides the boundary; there is no universal "library vs application", "always", or "never" rule.
