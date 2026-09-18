---
name: craft-conventions
description: This skill should be used when writing TypeScript by hand, outside the craft loop, in a project recognisable by neverthrow, immutable and @js-joda/core in its package.json, a features/ directory of .feature files, or a src/domain + src/application + src/infrastructure layout. Also when the user asks "follow the craft conventions", "what are our rules for value objects", "how do we write step definitions here", "how do we handle errors without throwing", "how do we represent a value that may be absent", "where do use cases go", "how do we build a use case", "how do we handle dates here". It carries the rulebook shared by the bdd-writer, test-writer and implementer agents, so hand-written code matches agent-written code. For auditing existing code against these rules, use craft-review instead.
---

# Craft conventions

The rulebook the `craft` loop enforces. Apply it when writing code by hand so that
hand-written and agent-written code are indistinguishable. To audit code that
already exists, use `craft-review`, which produces a ranked report.

Everything — scenarios, tests, code, identifiers — is written in **English**.
The package manager is **yarn**.

## The nine rules that decide most reviews

1. **The domain throws nothing.** Every fallible operation returns
   `Result<T, E>` from `neverthrow`, with named domain errors. `try/catch` exists
   only in `infrastructure`, to convert a library exception into a `Result` on the
   spot.
2. **Absence is a value, and its name is `Option`.** `undefined` and `null` never
   appear in `src/domain/**` — not as a return type, not as a property, not as an
   optional `?` parameter, not as a union member. Something that may be missing is
   an `Option<T>` from `@domain/Option`, and the caller gets at it through
   `map`, `andThen`, `unwrapOr`, `okOr` or `match` — never by testing for
   emptiness first. An adapter that receives a nullable value from a library
   converts it on the spot with `Option.fromNullable`, and nothing downstream
   ever sees the hole.
3. **Everything is immutable.** `readonly` properties, `private` constructors,
   static factories, and methods that return a new instance instead of mutating.
   Every iterable is an `immutable` `List`, `Map`, `Set` or `Record` — never a
   native array, never an object literal used as a dictionary.
4. **No primitive obsession.** No bare `string`, `number` or `boolean` crosses a
   domain boundary. `Money`, `OrderId`, `EmailAddress` — each validating in its
   own factory.
5. **Tell, don't ask.** Objects expose behaviour, not innards. `order.cancel()`,
   never `if (order.status === 'PENDING')`. A getter exists for presentation at the
   edge, and nowhere else.
6. **Tests assert behaviour.** What is observable from outside: the returned value,
   the `Result`, the state reached through the public API, the command sent on an
   outgoing port. A test that breaks when a private method is renamed is a wrong
   test.
7. **Time is a value, and it is injected.** Every date, time, instant and duration
   comes from `@js-joda/core` — `LocalDate`, `LocalDateTime`, `Instant`,
   `ZonedDateTime`, `Duration`, `Period`. Never the native `Date`, never a
   timestamp as a `number`. The present moment is never read from ambient state:
   it arrives through a `Clock` port, so every time-dependent rule is testable at
   an exact instant.
8. **Use cases live in the domain, and the factory builds them.** A use case is
   business orchestration, not plumbing: it sits in `src/domain/usecases/` and
   depends on ports only. Nothing instantiates a use case with `new` except the
   `UseCaseFactory` — controllers, CLI entry points and step definitions all ask
   the factory.
9. **The code carries no comments.** No explanatory comment, no header banner, no
   section divider, no commented-out code, no `TODO`. If something needs
   explaining, the code is not saying it yet: rename the variable, extract a method
   whose name is the sentence you were about to write, or turn the condition into a
   named predicate. What must survive as prose belongs in a test name, a domain
   error, a Gherkin scenario or a commit message — never in the source.

## Layering

```
src/domain/         entities, value objects, domain errors, Option, ports
                    (interfaces), use cases (usecases/), and the UseCaseFactory
                    that builds them
src/infrastructure/ concrete adapters — implement the ports
src/application/    composition root — instantiates the adapters, builds the
                    factory, and exposes the app: HTTP controllers, CLI, entry point
```

`domain` depends on nothing. `infrastructure` depends on `domain`. `application`
depends on both, and is the **only** layer allowed to name a concrete adapter. No
arrow ever points into the domain from outside.

Ports are interfaces declared **in the domain** and named after the domain's need
(`OrderRepository`, `PaymentGateway`, `Clock`), never after the technology.

### Use cases and the factory

A use case orchestrates the domain through its ports, and that is domain
behaviour — so it lives in `src/domain/usecases/`, under the same 100% coverage
gate as the rest of the domain.

The `UseCaseFactory` sits in `src/domain/` too. It takes **ports** in its
constructor and hands out ready-to-run use cases:

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
}
```

`src/application/` builds it once with the real adapters, and every caller — an
HTTP controller, a CLI command, a job — asks the factory rather than wiring
dependencies itself. Tests and step definitions build the same factory with
in-memory fakes, which is what keeps the acceptance suite driving the same
composition the app runs.

`references/implementation.md` has the composition root and the controller.

## Test layout

```
tests/domain/                 unit tests for entities, value objects, domain rules
tests/domain/usecases/        unit tests for the use cases, built through the factory
tests/application/            unit tests for controllers and composition
tests/fakes/                  in-memory adapters and clocks — unit suite only
tests/builders/               object mothers with real values

features/*.feature            Gherkin — business intent only
features/steps/*.steps.ts     step definitions driving the primary ports
features/steps/support/fakes/ in-memory adapters — acceptance suite only
```

`features/**` never imports from `tests/**`, and the reverse. Each suite owns its
fakes; the duplication is deliberate and buys their independence.

## Domain coverage is 100%

`src/domain/**` must reach 100% in lines, branches, functions and statements —
enforced by the thresholds in `vitest.config.ts`. Since the use cases and the
`UseCaseFactory` live there, they are under the gate too: a use case branch no
test exercises fails the build, and the factory is covered because the tests build
their use cases through it rather than with `new`.

`src/application/**` and `src/infrastructure/**` are outside the gate — wiring and
adapters are covered by integration tests, not by the domain threshold.

An uncovered branch is not a missing test by default. It is usually **code nobody
asked for**: a defensive guard, a speculative case, an unused optional parameter.
Delete it first; only treat it as a specification hole when the behaviour is
genuinely required and no test demands it.

## Declarative, and readable first

The style is declarative — `Result` combinators, `immutable` operators, no `let`,
no imperative loop, no mutation. Chaining is the pattern that usually expresses it,
but it is a direction to follow when it pays, not a rule to satisfy: chain while
the chain reads as one sentence about the business, and break it into named `const`
steps or an extracted method as soon as it stops. Simplicity and ergonomics decide
which shape wins; the bans on `let`, loops and mutation hold in either.

## Additional resources

### Reference files

- **`references/gherkin.md`** — writing scenarios that reveal intent: real values,
  declarative phrasing, boundaries, reusable steps, and what makes a scenario leak
  technology.
- **`references/unit-tests.md`** — Vitest and Cucumber patterns: naming, `it.each`
  tables, builders, when a `mock<Port>()` beats a hand-written fake, asserting on
  `Result`, and the assertions that couple a test to an implementation.
- **`references/implementation.md`** — value objects, `Result` chaining and when to
  break a chain, `Option` in place of `undefined`, Immutable
  collections, dates with js-joda, tell-don't-ask, use cases and the
  `UseCaseFactory`, ports and adapters, with before/after code.
- **`references/tooling.md`** — yarn scripts, Vitest coverage thresholds, running
  Cucumber with tsx, and running a single scenario.

### Related skills

- **`craft`** — the orchestrated BDD → tests → implementation loop.
- **`craft-setup`** — bootstraps the toolchain and layout.
- **`craft-review`** — review pass over existing code against these rules.
