# Examples — Frontend with vanilla JS (no framework)

Frontend is not a paradigm: it's a type of project that can be written in any of the paradigms from `references/paradigms/` (vanilla JS tends to mix imperative with some functional; see also `references/paradigms/imperative.md`). Read this file in addition to the project's real paradigm.

## The central criterion: separate data, presentation, and interaction

A single listener/function shouldn't fetch data, calculate business logic, and touch the DOM, all at once.

```js
// Bad — everything in the same listener
document.addEventListener("DOMContentLoaded", async () => {
  const orders = await fetch("/api/orders").then(r => r.json());
  let total = 0;
  for (const p of orders) total += p.amount * (1 - p.discount); // business logic mixed with the render
  document.querySelector("#total").textContent = total;
});

// Good — separated by function/module
async function getOrders() { return fetch("/api/orders").then(r => r.json()); }
function calculateTotal(orders) { return orders.reduce((acc, p) => acc + calculateDiscount(p), 0); }
function renderTotal(total) { document.querySelector("#total").textContent = total; }

async function init() {
  const orders = await getOrders();
  renderTotal(calculateTotal(orders));
}
document.addEventListener("DOMContentLoaded", init);
```

## Other criteria specific to vanilla JS

- **Scattered DOM manipulation**: `document.querySelector` repeated throughout the file, mixed with business logic → centralize DOM access in dedicated render functions, separate from the ones that calculate data.
- **Unencapsulated mutable global state** (loose module-level variables any function can touch) → encapsulate the state in an object/module with a clear API (module/observer pattern), or pass it explicitly between functions.
- **Reusing logic between pages/views**: extract it to a shared module (`import`/`export`). Don't copy-paste the same block of code between HTML/JS files.
- **Duplicated or accumulated listeners** (adding the same `addEventListener` on every re-render without cleaning up the previous one) → remove the previous listener or use event delegation.
- **Leaking the API's raw shape**: using the raw JSON of the HTTP response directly when touching the DOM instead of mapping it first to the frontend's own object.

## Error handling

Smell: a `fetch`/promise with no `.catch` or `try/catch` around an `await`, letting a network failure silently break the flow or leave an unhandled rejected promise in the console. Fix: wrap async calls in `try/catch`, model an explicit error state, and update the DOM to show it to the user, instead of letting it fail silently.
