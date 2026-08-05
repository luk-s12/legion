# Examples — Frontend with React

Frontend is not a paradigm: it's a type of project that can be written in any of the paradigms from `references/paradigms/` (React mixes imperative + functional, with hooks). Read this file in addition to the project's real paradigm.

## The central criterion: separate data, presentation, and interaction

A component shouldn't fetch data, calculate business logic, and render, all at once.

```jsx
// Bad — everything mixed together
function OrderList() {
  const [orders, setOrders] = useState([]);
  useEffect(() => { fetch("/api/orders").then(r => r.json()).then(setOrders); }, []);
  const total = orders.reduce((acc, p) => acc + calculateDiscount(p), 0); // business logic in the component
  return <div onClick={() => fetch("/api/orders", {method: "POST"})}>...</div>;
}

// Good — separated
function useOrders() {           // data/state in its own hook
  const [orders, setOrders] = useState([]);
  useEffect(() => { fetch("/api/orders").then(r => r.json()).then(setOrders); }, []);
  return orders;
}
function calculateTotal(orders) { ... }  // business logic, pure, testable without rendering anything

function OrderList() {
  const orders = useOrders();
  const total = calculateTotal(orders);
  return <div onClick={createOrder}>...</div>;
}
```

## Other criteria specific to React

- **Giant components with many conditional props** (`{condition && <X/>}` chained for every visual variant) → prefer composition: small components combined instead of one with internal branches.
- **Shared state between distant components**: use whatever mechanism the project already uses (Context, Redux, Zustand, Jotai). Never prop drilling of 4+ levels just to pass down one value.
- **Reusing logic between components**: extract it to a **custom hook** (`use*`). Don't copy the same `useEffect`/calculation into 2+ components.
- **`useEffect` as a catch-all**: the same effect doing fetch + subscribing a listener + syncing other state → split into independent effects, one per responsibility/dependency.
- **Leaking the API's raw shape**: using the raw JSON of the HTTP response directly in JSX instead of mapping it first to the frontend's own type.

## Error handling

Smell: a `fetch`/promise with no error handling, letting a network failure silently break the render or leave an unhandled rejected promise. Fix: model state as `{ data, loading, error }` (by hand or with the project's fetching library — React Query, SWR) and show feedback to the user on error, instead of leaving it uncaught.
