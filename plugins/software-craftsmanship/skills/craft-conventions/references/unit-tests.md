# Unit tests and step definitions

## Naming

`describe` names the unit under test. `it` states a behaviour in business
language, as a full sentence.

```ts
describe('Checkout', () => {
  it('refuses an order below the minimum amount', () => { … })
  it('places the order when the amount is exactly the minimum', () => { … })
  it('charges no shipping above the free shipping threshold', () => { … })
})
```

Never `it('should work')`, `it('test 1')`, `it('returns true')`,
`it('calls the repository')`.

The rule of thumb: read the `it` sentences of a file aloud. If they do not describe
the feature to someone who has not read the code, they are named wrong.

## Behaviour, not implementation

```ts
// Couples to the implementation — the test breaks on any refactoring
it('applies the discount', () => {
  const spy = vi.spyOn(basket as never, 'computeSubtotal')
  basket.applyDiscount(discount)
  expect(spy).toHaveBeenCalledTimes(1)
})

// Asserts the behaviour — survives any refactoring that preserves it
it('reduces the basket total by the discount rate', () => {
  const discounted = basketWorth(Money.euros(100)).applyDiscount(tenPercent)

  expect(discounted.total()).toStrictEqual(Money.euros(90))
})
```

Forbidden: spying on a private method, asserting on an internal helper, on the
order of internal calls, on the call count of something that is not a contract, or
on an object's internal structure.

If renaming a private method breaks a test, the test is wrong.

## Exhaustiveness with `it.each`

Use a named case table with real values, covering the exact boundaries.

```ts
describe('Shipping cost', () => {
  it.each([
    { basket: Money.euros(24.99), expected: Money.euros(4.9), case: 'below the minimum' },
    { basket: Money.euros(25.0),  expected: Money.euros(4.9), case: 'at the minimum' },
    { basket: Money.euros(59.99), expected: Money.euros(4.9), case: 'just below free shipping' },
    { basket: Money.euros(60.0),  expected: Money.euros(0),   case: 'at the free shipping threshold' },
  ])('costs $expected for a basket $case', ({ basket, expected }) => {
    expect(shippingCostFor(basket)).toStrictEqual(expected)
  })
})
```

A table whose rows all exercise the same branch adds noise, not coverage. One row
per distinct behaviour.

## Builders

Object mothers live in `tests/builders/`. The default is a valid, plausible case;
`with…()` methods return a new instance.

```ts
export class OrderBuilder {
  private constructor(
    private readonly customer: CustomerName,
    private readonly lines: List<OrderLine>,
  ) {}

  static anOrder(): OrderBuilder {
    return new OrderBuilder(
      CustomerName.of('Camille Fournier'),
      List.of(OrderLine.of(ProductRef.of('SKU-4412'), Quantity.of(1), Money.euros(149.9))),
    )
  }

  withLines(lines: List<OrderLine>): OrderBuilder {
    return new OrderBuilder(this.customer, lines)
  }

  build(): Order {
    return Order.place(this.customer, this.lines)._unsafeUnwrap()
  }
}
```

Each test then states only what it cares about:
`OrderBuilder.anOrder().withLines(emptyLines).build()`.

## Fakes and mocks

**Hand-written fake** for a stateful port — a repository, a store, a clock. It
reads as domain vocabulary and its behaviour is inspectable.

```ts
export class InMemoryOrderRepository implements OrderRepository {
  private orders: Map<OrderId, Order> = Map()

  save(order: Order): ResultAsync<void, PersistenceFailure> { … }
  byId(id: OrderId): ResultAsync<Order, OrderNotFound> { … }
}
```

**`mock<Port>()` from `vitest-mock-extended`** for a stateless port where the point
is that a command was sent.

```ts
const notifier = mock<CustomerNotifier>()

placeOrder.execute(command)

expect(notifier.notifyOrderPlaced).toHaveBeenCalledWith(expectedConfirmation)
```

Never mock an entity, a value object, an aggregate or a pure function. Those are
instantiated for real, with real values — mocking them means asserting against a
fiction.

## Asserting on `Result`

The domain throws nothing, so assert the whole `Result`. Immutable value objects
have structural equality, which makes `toStrictEqual` exact.

```ts
expect(checkout.execute(basketWorth(Money.euros(24.99))))
  .toStrictEqual(err(new BelowMinimumAmount(Money.euros(25))))

expect(EmailAddress.create('camille@example.com'))
  .toStrictEqual(ok(EmailAddress.create('camille@example.com')._unsafeUnwrap()))
```

Never `expect(() => …).toThrow()` against domain code — a domain that throws is
already a bug.

Reach for `_unsafeUnwrap()` only inside builders, never in an assertion: unwrapping
in a test discards the failure case the assertion was supposed to pin down.

## Step definitions

Steps drive the use case through its **primary port**, with in-memory adapters from
`features/steps/support/fakes/` on the secondary side. No HTTP, no database, no
browser — a scenario runs in milliseconds, like a unit test.

```ts
Given('{customer} has a basket worth {money}', function (customer, amount) {
  this.basket = BasketBuilder.aBasket().worth(amount).for(customer).build()
})

When('she checks out', function () {
  this.outcome = this.checkout.execute(new CheckoutCommand(this.basket))
})

Then('checkout is refused because the order is below the minimum amount', function () {
  expect(this.outcome).toStrictEqual(err(new BelowMinimumAmount(this.minimumAmount)))
})
```

`features/steps/**` never imports from `tests/**`. The acceptance suite keeps its
own fakes and builders. The duplication is deliberate: neither suite can break the
other by changing a shared helper.

## The tests are the specification

An implementation is written against the tests, not against the intent behind them.
Anything a test does not assert is not specified — and anything the implementation
does that no test asserts is code nobody asked for.

That is why domain coverage is gated at 100%: it is the mechanical check that the
implementation contains nothing the specification did not demand.
