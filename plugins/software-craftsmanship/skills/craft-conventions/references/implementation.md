# Implementation patterns

## Value object

Private constructor, static validating factory, structural equality, no bare
primitive crossing the boundary.

```ts
import { Record } from 'immutable'
import { type Result, err, ok } from 'neverthrow'

const MoneyShape = Record({ cents: 0, currency: 'EUR' })

export class Money extends MoneyShape {
  static euros(amount: number): Money {
    return new Money({ cents: Math.round(amount * 100), currency: 'EUR' })
  }

  static fromCents(cents: number): Result<Money, NegativeAmount> {
    return cents < 0 ? err(new NegativeAmount(cents)) : ok(new Money({ cents }))
  }

  plus(other: Money): Money {
    return new Money({ cents: this.cents + other.cents })
  }

  isBelow(threshold: Money): boolean {
    return this.cents < threshold.cents
  }
}
```

`Record` gives `equals`, `hashCode` and structural equality for free — which is
what makes `toStrictEqual` exact in tests.

A factory that can fail returns a `Result`. A factory that cannot (a literal known
to be valid) returns the value directly.

## Domain errors

Named after the business rule, not after the technical failure.

```ts
export class BelowMinimumAmount {
  readonly _tag = 'BelowMinimumAmount'
  constructor(readonly minimum: Money) {}
}

export class OrderAlreadyShipped {
  readonly _tag = 'OrderAlreadyShipped'
  constructor(readonly shippedOn: ShipmentDate) {}
}

export type CheckoutFailure = BelowMinimumAmount | OrderAlreadyShipped
```

The `_tag` discriminant lets a caller branch exhaustively without `instanceof`.
Errors carry the data the caller needs to react — never a formatted message.

## Result chaining

```ts
// Imperative, throws, mutates — refuse
function checkout(basket: Basket): Order {
  if (basket.total() < MINIMUM) throw new Error('too small')
  let order = new Order()
  for (const line of basket.lines) { order.add(line) }
  return order
}

// Declarative, chained, total — keep
const checkout = (basket: Basket): Result<Order, CheckoutFailure> =>
  basket
    .ensureReachesMinimum(MINIMUM_ORDER_AMOUNT)
    .andThen((eligible) => Order.place(eligible.customer(), eligible.lines()))
    .map((order) => order.withShipping(shippingFor(order)))
```

No `let`, no imperative loop, no mutable accumulator. Two levels of indentation
maximum inside a method.

For asynchronous work, `ResultAsync` chains the same way:

```ts
const placeOrder = (command: PlaceOrderCommand): ResultAsync<OrderId, PlaceOrderFailure> =>
  this.customers
    .byId(command.customerId())
    .andThen((customer) => customer.checkout(command.basket()))
    .andThen((order) => this.orders.save(order).map(() => order.id()))
```

## Immutable collections

Every iterable goes through `immutable`.

```ts
import { List, Map } from 'immutable'

export class Basket {
  private constructor(private readonly lines: List<BasketLine>) {}

  static empty(): Basket {
    return new Basket(List())
  }

  add(line: BasketLine): Basket {
    return new Basket(this.lines.push(line))
  }

  total(): Money {
    return this.lines.reduce((sum, line) => sum.plus(line.amount()), Money.euros(0))
  }

  groupedByCategory(): Map<Category, List<BasketLine>> {
    return this.lines.groupBy((line) => line.category()).toMap().map(List)
  }
}
```

No native array, no object literal used as a dictionary, no `push` on an array, no
spread used to fake immutability.

## Tell, don't ask

```ts
// Asks — the caller decides on the object's behalf
if (order.status === 'PENDING' && order.total > MINIMUM) {
  order.status = 'CONFIRMED'
  mailer.send(order.customerEmail, buildConfirmation(order))
}

// Tells — the object owns its rule and its transition
order.confirm().map((confirmed) => confirmed.announceTo(this.notifier))
```

A getter exists for presentation at the edge, and nowhere else. Any getter whose
only reason to exist is to let a caller decide is a design smell: move the decision
into the object.

## Ports and adapters

The port is an interface **in the domain**, named after the domain's need.

```ts
// src/domain/OrderRepository.ts
export interface OrderRepository {
  save(order: Order): ResultAsync<void, PersistenceFailure>
  byId(id: OrderId): ResultAsync<Order, OrderNotFound>
}
```

The use case depends on the interface, injected through the constructor.

```ts
// src/application/PlaceOrder.ts
export class PlaceOrder {
  constructor(
    private readonly orders: OrderRepository,
    private readonly notifier: CustomerNotifier,
  ) {}

  execute(command: PlaceOrderCommand): ResultAsync<OrderId, PlaceOrderFailure> { … }
}
```

The adapter lives in `infrastructure` and is the only place a `try/catch` is
allowed — to convert a library exception into a `Result` immediately.

```ts
// src/infrastructure/PostgresOrderRepository.ts
save(order: Order): ResultAsync<void, PersistenceFailure> {
  return ResultAsync.fromPromise(
    this.client.query(INSERT_ORDER, toRow(order)),
    (cause) => new PersistenceFailure(cause),
  ).map(() => undefined)
}
```

## Speaking names

No abbreviations. No `data`, `info`, `manager`, `helper`, `utils`, `process`,
`handle`, `doIt`.

No comment explaining *what* the code does — if a comment is needed, extract a
method whose name says it. A comment is justified only for a *why* that cannot be
derived from the code: an external constraint, a counter-intuitive business
decision, a deliberate deviation.

## Deleting undemanded code

`src/domain/**` is gated at 100% coverage. An uncovered branch is almost always
one of:

- a defensive guard against a state the type system already prevents;
- a speculative case no scenario describes;
- an optional parameter nobody passes;
- an unused public method left behind by a refactoring.

Delete it. Untested code is undemanded code, and it is the code that rots first.

Only when the branch is genuinely required business behaviour with no test
demanding it is it a specification hole — and then the fix is a new test, written
by the test-writer, not a defensive line in the implementation.
