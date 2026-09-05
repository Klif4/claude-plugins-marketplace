---
name: craft-conventions
description: This skill should be used when writing TypeScript by hand, outside the craft loop, in a project recognisable by neverthrow and immutable in its package.json, a features/ directory of .feature files, or a src/domain + src/application + src/infrastructure layout. Also when the user asks "follow the craft conventions", "what are our rules for value objects", "how do we write step definitions here", "how do we handle errors without throwing". It carries the rulebook shared by the bdd-writer, test-writer and implementer agents, so hand-written code matches agent-written code. For auditing existing code against these rules, use craft-review instead.
---

# Craft conventions

The rulebook the `craft` loop enforces. Apply it when writing code by hand so that
hand-written and agent-written code are indistinguishable. To audit code that
already exists, use `craft-review`, which produces a ranked report.

Everything — scenarios, tests, code, identifiers — is written in **English**.
The package manager is **yarn**.

## The five rules that decide most reviews

1. **The domain throws nothing.** Every fallible operation returns
   `Result<T, E>` from `neverthrow`, with named domain errors. `try/catch` exists
   only in `infrastructure`, to convert a library exception into a `Result` on the
   spot.
2. **Everything is immutable.** `readonly` properties, `private` constructors,
   static factories, and methods that return a new instance instead of mutating.
   Every iterable is an `immutable` `List`, `Map`, `Set` or `Record` — never a
   native array, never an object literal used as a dictionary.
3. **No primitive obsession.** No bare `string`, `number` or `boolean` crosses a
   domain boundary. `Money`, `OrderId`, `EmailAddress` — each validating in its
   own factory.
4. **Tell, don't ask.** Objects expose behaviour, not innards. `order.cancel()`,
   never `if (order.status === 'PENDING')`. A getter exists for presentation at the
   edge, and nowhere else.
5. **Tests assert behaviour.** What is observable from outside: the returned value,
   the `Result`, the state reached through the public API, the command sent on an
   outgoing port. A test that breaks when a private method is renamed is a wrong
   test.

## Layering

```
src/domain/         entities, value objects, domain errors, ports (interfaces)
src/application/    use cases — orchestrate the domain through the ports
src/infrastructure/ concrete adapters — implement the ports
```

`domain` depends on nothing. `application` depends on `domain` only.
`infrastructure` depends on `domain`. No arrow points outward.

Ports are interfaces declared **in the domain** and named after the domain's need
(`OrderRepository`, `PaymentGateway`), never after the technology.

## Test layout

```
tests/domain/                 unit tests for the domain
tests/application/            unit tests for the use cases
tests/fakes/                  in-memory adapters — unit suite only
tests/builders/               object mothers with real values

features/*.feature            Gherkin — business intent only
features/steps/*.steps.ts     step definitions driving the primary ports
features/steps/support/fakes/ in-memory adapters — acceptance suite only
```

`features/**` never imports from `tests/**`, and the reverse. Each suite owns its
fakes; the duplication is deliberate and buys their independence.

## Domain coverage is 100%

`src/domain/**` must reach 100% in lines, branches, functions and statements —
enforced by the thresholds in `vitest.config.ts`.

An uncovered branch is not a missing test by default. It is usually **code nobody
asked for**: a defensive guard, a speculative case, an unused optional parameter.
Delete it first; only treat it as a specification hole when the behaviour is
genuinely required and no test demands it.

## Additional resources

### Reference files

- **`references/gherkin.md`** — writing scenarios that reveal intent: real values,
  declarative phrasing, boundaries, reusable steps, and what makes a scenario leak
  technology.
- **`references/unit-tests.md`** — Vitest and Cucumber patterns: naming, `it.each`
  tables, builders, when a `mock<Port>()` beats a hand-written fake, asserting on
  `Result`, and the assertions that couple a test to an implementation.
- **`references/implementation.md`** — value objects, `Result` chaining, Immutable
  collections, tell-don't-ask, ports and adapters, with before/after code.
- **`references/tooling.md`** — yarn scripts, Vitest coverage thresholds, running
  Cucumber with tsx, and running a single scenario.

### Related skills

- **`craft`** — the orchestrated BDD → tests → implementation loop.
- **`craft-setup`** — bootstraps the toolchain and layout.
- **`craft-review`** — review pass over existing code against these rules.
