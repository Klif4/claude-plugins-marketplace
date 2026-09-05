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

## Dates and time

Every date, time, instant and duration comes from `@js-joda/core`. The native
`Date` never appears — not in the domain, not in a test, not in an adapter's
signature. It is mutable, its month is zero-based, its parsing is
implementation-defined, and it silently collapses "a calendar day" and "a point in
time" into one type.

| Business notion | Type |
|---|---|
| A calendar day — a delivery date, a birthday | `LocalDate` |
| A wall-clock date and time, no zone | `LocalDateTime` |
| A point on the timeline — when something happened | `Instant` |
| A moment in a named zone — a shop's opening time | `ZonedDateTime` |
| An elapsed amount of time | `Duration` (exact) / `Period` (calendar) |

```ts
import { ChronoUnit, LocalDate, Period } from '@js-joda/core'

const DeliveryWindowShape = Record({ orderedOn: LocalDate.MIN, dueOn: LocalDate.MIN })

export class DeliveryWindow extends DeliveryWindowShape {
  static of(orderedOn: LocalDate, dueOn: LocalDate): Result<DeliveryWindow, DueDateBeforeOrder> {
    return dueOn.isBefore(orderedOn)
      ? err(new DueDateBeforeOrder(orderedOn, dueOn))
      : ok(new DeliveryWindow({ orderedOn, dueOn }))
  }

  isLateOn(day: LocalDate): boolean {
    return day.isAfter(this.dueOn)
  }

  remainingDaysOn(day: LocalDate): number {
    return day.until(this.dueOn, ChronoUnit.DAYS)
  }

  postponedBy(delay: Period): DeliveryWindow {
    return new DeliveryWindow({ orderedOn: this.orderedOn, dueOn: this.dueOn.plus(delay) })
  }
}
```

js-joda's temporal types are immutable and implement `equals` and `hashCode`, so
they sit inside an `immutable` `Record` and compare exactly under `toStrictEqual`.

`@js-joda/core` alone covers UTC and fixed offsets. Add `@js-joda/timezone` only
when the domain genuinely reasons about a named zone (`ZoneId.of('Europe/Paris')`),
and import it once at the composition root, never from the domain.

A date is still a primitive as far as rule 3 is concerned: `LocalDate` crossing a
domain boundary as "some day" is fine inside a value object, but a method taking a
bare `LocalDate` when the business says *delivery date* wants a `DeliveryDate`.

### "Now" comes from a port

`LocalDate.now()` and `Instant.now()` without an argument are forbidden in
`src/domain/**`: they read ambient state, which makes the rule untestable at its
boundary and the test dependent on the day it runs.

```ts
// src/domain/Clock.ts
import type { Instant } from '@js-joda/core'

export interface Clock {
  now(): Instant
}
```

```ts
// src/infrastructure/SystemClock.ts
import { Clock as JodaClock, Instant } from '@js-joda/core'
import type { Clock } from '@domain/Clock'

export class SystemClock implements Clock {
  private readonly source = JodaClock.systemUTC()

  now(): Instant {
    return Instant.now(this.source)
  }
}
```

The domain port and js-joda's own `Clock` share a name; alias the library one at
the single place the adapter needs it. In tests, the fake returns a fixed instant —
see `references/unit-tests.md`.

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

## Use cases and the factory

A use case orchestrates the domain through its ports. That is business
behaviour — so it belongs in the domain, and it depends on interfaces only.

```ts
// src/domain/usecases/PlaceOrder.ts
export class PlaceOrder {
  constructor(
    private readonly orders: OrderRepository,
    private readonly notifier: CustomerNotifier,
    private readonly clock: Clock,
  ) {}

  execute(command: PlaceOrderCommand): ResultAsync<OrderId, PlaceOrderFailure> {
    return command
      .basket()
      .ensureReachesMinimum(MINIMUM_ORDER_AMOUNT)
      .asyncAndThen((eligible) => Order.placedAt(this.clock.now(), eligible))
      .andThen((order) => this.orders.save(order).map(() => order))
      .andThen((order) => this.notifier.notifyOrderPlaced(order).map(() => order.id()))
  }
}
```

Nothing calls `new PlaceOrder(...)` except the factory, which lives in the domain
and takes ports:

```ts
// src/domain/UseCaseFactory.ts
export class UseCaseFactory {
  constructor(
    private readonly orders: OrderRepository,
    private readonly notifier: CustomerNotifier,
    private readonly clock: Clock,
  ) {}

  placeOrder(): PlaceOrder {
    return new PlaceOrder(this.orders, this.notifier, this.clock)
  }

  cancelOrder(): CancelOrder {
    return new CancelOrder(this.orders, this.clock)
  }
}
```

A method per use case, named after the business action. The factory holds no
state, decides nothing, and contains no `if` — the moment it needs one, the
decision belongs in a use case.

### Composition root

`src/application/` is where the concrete adapters are named, exactly once.

```ts
// src/application/useCases.ts
import { UseCaseFactory } from '@domain/UseCaseFactory'
import { EmailCustomerNotifier } from '@infrastructure/EmailCustomerNotifier'
import { PostgresOrderRepository } from '@infrastructure/PostgresOrderRepository'
import { SystemClock } from '@infrastructure/SystemClock'

export const useCasesFor = (client: DatabaseClient, mailer: Mailer): UseCaseFactory =>
  new UseCaseFactory(
    new PostgresOrderRepository(client),
    new EmailCustomerNotifier(mailer),
    new SystemClock(),
  )
```

### Calling a use case from the edge

The controller receives the factory, asks it for the use case it needs, and does
nothing else: translate the request into a command, translate the `Result` into a
response.

```ts
// src/application/http/OrderController.ts
export class OrderController {
  constructor(private readonly useCases: UseCaseFactory) {}

  place(request: PlaceOrderRequest): Promise<HttpResponse> {
    return this.useCases
      .placeOrder()
      .execute(PlaceOrderCommand.from(request))
      .match(created, toHttpFailure)
  }
}
```

No business rule at the edge: a controller that inspects the outcome to decide
what the domain should have done has taken a decision away from a use case. The
same shape serves a CLI, a queue consumer or a scheduled job — each one asks the
factory, none of them wires a dependency.

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
