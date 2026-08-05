# Examples — Frontend with Vue

Frontend is not a paradigm: it's a type of project that can be written in any of the paradigms from `references/paradigms/` (Vue mixes imperative + functional, with composables). Read this file in addition to the project's real paradigm.

## The central criterion: separate data, presentation, and interaction

A component shouldn't fetch data, calculate business logic, and render, all at once.

```vue
<!-- Bad — everything in the component -->
<script setup>
const orders = ref([]);
onMounted(async () => { orders.value = await fetch("/api/orders").then(r => r.json()); });
const total = computed(() => orders.value.reduce((acc, p) => acc + calculateDiscount(p), 0)); // business logic here
</script>

<!-- Good — separated into a composable -->
<!-- useOrders.js -->
export function useOrders() {
  const orders = ref([]);
  onMounted(async () => { orders.value = await fetchOrders(); });
  return { orders };
}

<!-- OrderList.vue -->
<script setup>
const { orders } = useOrders();
const total = computed(() => calculateTotal(orders.value)); // calculateTotal: separate pure function
</script>
```

## Other criteria specific to Vue

- **Giant components with many chained `v-if`/`v-else-if`** for every visual variant → prefer composition: small components combined instead of one with internal branches.
- **Shared state between distant components**: use whatever mechanism the project already uses (Pinia, Vuex, or `provide`/`inject` for narrow cases). Never cascade props through 4+ levels just to pass down one value.
- **Reusing logic between components**: extract it to a **composable** (`use*.js`). Don't copy the same `watch`/`computed` into 2+ components.
- **`watch`/`watchEffect` as a catch-all**: the same watcher doing fetch + syncing other state + mutating a third one → split by responsibility.
- **Leaking the API's raw shape**: using the raw JSON of the HTTP response directly in the template instead of mapping it first to the frontend's own type.

## Error handling

Smell: a `fetch`/promise inside `onMounted` with no `try/catch`, letting a network failure silently break the render. Fix: model state as `{ data, loading, error }` with refs (or with the project's fetching library — VueQuery) and show feedback to the user on error.
