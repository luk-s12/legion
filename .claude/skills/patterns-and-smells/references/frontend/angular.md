# Examples — Frontend with Angular

Frontend is not a paradigm: it's a type of project that can be written in any of the paradigms from `references/paradigms/` (Angular leans more toward OOP with its classes, decorators, and dependency injection — see also `references/paradigms/oop.md`). Read this file in addition to the project's real paradigm.

## The central criterion: separate data, presentation, and interaction

A component shouldn't fetch data, calculate business logic, and render, all at once.

```ts
// Bad — the component fetches and calculates
@Component({...})
class OrderListComponent {
  orders: Order[] = [];
  constructor(private http: HttpClient) {
    this.http.get("/api/orders").subscribe(p => this.orders = p);
  }
  get total() { return this.orders.reduce((acc, p) => acc + this.calculateDiscount(p), 0); } // business logic here
}

// Good — data in an injected service, business logic in a separate function/service
@Injectable({ providedIn: "root" })
class OrdersService {
  constructor(private http: HttpClient) {}
  getOrders() { return this.http.get<Order[]>("/api/orders"); }
}

@Component({...})
class OrderListComponent {
  orders: Order[] = [];
  constructor(private ordersService: OrdersService) {}
  ngOnInit() { this.ordersService.getOrders().subscribe(p => this.orders = p); }
  get total() { return calculateTotal(this.orders); } // imported pure function, not a component method
}
```

## Other criteria specific to Angular

- **Giant components with many chained `*ngIf`/`*ngSwitchCase`** for every visual variant → prefer composition: small components combined instead of one with internal branches.
- **Shared state between distant components**: use whatever mechanism the project already uses (a singleton service with `BehaviorSubject`/signal, or NgRx if the project uses it). Never cascading `@Input` through 4+ levels just to pass down one value.
- **Reusing logic between components**: extract it to an **injectable service** (`@Injectable`). Don't copy the same HTTP call or calculation into 2+ components.
- **Too many dependencies injected into the same component/service** (constructor with 5+ parameters) → a sign it does too much, split responsibilities (see Part 1, criterion 6 of `SKILL.md`).
- **Leaking the API's raw shape**: using the raw DTO of the HTTP response directly in the template instead of mapping it first to the frontend's own type/model.

## Error handling

Smell: an `Observable`/`subscribe` with no error handling (missing `catchError` or `subscribe`'s second callback), letting a network failure silently break the flow. Fix: use RxJS's `catchError` operator to turn the error into a manageable state, and model `{ data, loading, error }` in the component or service, showing feedback to the user.
