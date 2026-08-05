# Examples — Frontend with Flutter

Frontend is not a paradigm: it's a type of project that can be written in any of the paradigms from `references/paradigms/` (Flutter/Dart leans toward OOP with its classes and widgets, though the widget tree is composed in a fairly functional/declarative way). Read this file in addition to the project's real paradigm.

## The central criterion: separate data, presentation, and interaction

A widget shouldn't fetch data, calculate business logic, and build the UI tree, all at once.

```dart
// Bad — everything in the widget
class OrderList extends StatefulWidget {
  @override
  State<OrderList> createState() => _OrderListState();
}
class _OrderListState extends State<OrderList> {
  List<Order> orders = [];
  @override
  void initState() {
    super.initState();
    http.get(Uri.parse("/api/orders")).then((r) {
      setState(() => orders = parseOrders(r.body));
    });
  }
  double get total => orders.fold(0, (acc, p) => acc + calculateDiscount(p)); // business logic in the widget
  @override
  Widget build(BuildContext context) => Text("$total");
}

// Good — data/state in a provider/notifier, business logic in a separate function
class OrdersNotifier extends ChangeNotifier {
  List<Order> orders = [];
  Future<void> load() async {
    final r = await http.get(Uri.parse("/api/orders"));
    orders = parseOrders(r.body);
    notifyListeners();
  }
}
double calculateTotal(List<Order> orders) => ...; // pure function, testable without widgets

class OrderList extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final orders = context.watch<OrdersNotifier>().orders;
    return Text("${calculateTotal(orders)}");
  }
}
```

## Other criteria specific to Flutter

- **Giant widgets with many nested `if`/`? :`** in `build()` for every visual variant → prefer composition: small widgets combined (extract sub-widgets) instead of a `build()` with internal branches for each case.
- **Shared state between distant widgets**: use whatever mechanism the project already uses (Provider, Riverpod, Bloc/Cubit, GetX). Never pass the same data through the constructor of 4+ intermediate widgets just to get it down to the one that needs it.
- **Reusing logic between widgets**: extract it to a service/repository/notifier/bloc, according to whatever state-management pattern the project already uses. Don't copy the same HTTP call or calculation into 2+ widgets.
- **Business logic in `build()`**: any calculation that doesn't depend on how it's rendered (totals, validations, transformations) goes in a separate business function/class, testable with a `WidgetTester` in between or directly with pure Dart unit tests.
- **Leaking the API's raw shape**: parsing the HTTP response's JSON directly inside `build()` or using dynamic maps (`Map<String, dynamic>`) in the UI instead of mapping it first to the frontend's own model/type (`class`/`freezed`).

## Error handling

Smell: a `Future`/`async` with no `try/catch` or error-state handling, letting an uncaught exception break the widget (`FlutterError`) or a `FutureBuilder`/`StreamBuilder` not checking `snapshot.hasError`. Fix: wrap async calls in `try/catch` (or use `AsyncValue`/`Either` if the project uses Riverpod/`fpdart`), explicitly model the error state alongside `loading`/`data`, and check `snapshot.hasError` in any `FutureBuilder`/`StreamBuilder` to show feedback to the user.
