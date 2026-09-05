# software-craftsmanship

BDD → tests → implementation, one Gherkin scenario at a time, driven by three
agents that **never share context**.

TypeScript · Vite · Vitest · Cucumber · Immutable · neverthrow · vitest-mock-extended

## Why three isolated agents

The three roles have conflicting incentives, and a single agent holding all three
resolves the conflict in the wrong direction every time:

- An agent that knows the implementation writes tests that fit it.
- An agent that knows why it wrote a test implements the intent behind the test
  rather than the test itself — and the gap between the two is where bugs settle.

So each role runs as a separate `Agent` call with a fresh context, and the channel
between them is deliberately narrow:

```
bdd-writer   ──.feature──▶  test-writer  ──test files on disk──▶  implementer
   writes                     writes                                writes
features/**/*.feature      tests/**                              src/**
                           features/steps/**
```

The implementer receives file **paths**, never the test-writer's reasoning. It has
to read the tests, because the tests are the specification.

## Boundaries are enforced, not requested

Each agent's scope is stated in its prompt — and checked in git after it runs.
Hooks cannot do this: a `PreToolUse` hook sees the tool call, not which agent made
it, so it cannot tell a legitimate `tests/` write from an illegitimate one.

Git can. The manager snapshots the tree, runs the agent, diffs, and reverts
whatever landed outside the agent's scope. Deterministic, no loop-state file, and
no friction when you work by hand outside the loop.

## Three gates per iteration

No scenario is done until all three pass:

| Gate | Command |
|---|---|
| The scenario is green | `yarn test:acceptance --name "<title>"` |
| The whole unit suite is green | `yarn test` |
| `src/domain/**` is at 100% coverage | `yarn coverage` |

Gate 3 is not a vanity metric. It is the mechanical check that the implementation
contains nothing the specification did not demand: an uncovered branch is code
nobody asked for, and the implementer deletes it rather than defending it.

## Contents

| Path | Role |
|---|---|
| `skills/craft/` | The manager loop → `/software-craftsmanship:craft` |
| `skills/craft-setup/` | Toolchain and hexagonal layout bootstrap |
| `skills/craft-conventions/` | The rulebook shared by the three agents |
| `skills/craft-review/` | Craft audit of existing code |
| `agents/bdd-writer.md` | Writes `.feature` files. Nothing else. |
| `agents/test-writer.md` | Writes `tests/**` and `features/steps/**`. Never `src/`. |
| `agents/implementer.md` | Writes `src/**`. Never touches a test. |

## Usage

```bash
# Bootstrap a project
/software-craftsmanship:craft-setup

# Run the loop from a business need
/software-craftsmanship:craft a minimum order amount is enforced at checkout

# Or from an existing feature file
/software-craftsmanship:craft features/checkout.feature

# Audit existing code
/software-craftsmanship:craft-review src/domain
```

`craft-conventions` loads on its own whenever Claude writes TypeScript in a project
that follows these rules, so hand-written code matches agent-written code.

## Project layout it expects

```
src/domain/                   entities, value objects, domain errors, ports
src/application/              use cases
src/infrastructure/           concrete adapters

tests/domain/                 unit tests
tests/application/            unit tests
tests/fakes/                  in-memory adapters — unit suite only
tests/builders/               object mothers

features/*.feature            Gherkin, English, business intent only
features/steps/*.steps.ts     step definitions driving the primary ports
features/steps/support/fakes/ in-memory adapters — acceptance suite only
```

`features/**` never imports from `tests/**`, and the reverse. Each suite owns its
fakes; the duplication is deliberate and buys their independence.

## Rules the agents enforce

Everything — scenarios, tests, code, identifiers — is written in **English**.
The package manager is **yarn**.

- The domain throws nothing: `Result` / `ResultAsync` from `neverthrow`, with named
  domain errors.
- Everything immutable: `readonly`, private constructors, static factories, methods
  returning new instances. Every iterable is an `immutable` `List`, `Map`, `Set` or
  `Record`.
- No primitive obsession: no bare `string`, `number` or `boolean` crosses a domain
  boundary.
- Tell, don't ask: `order.cancel()`, never `if (order.status === 'PENDING')`.
- Hexagonal layering, dependency rule inward, ports named after the domain's need.
- Tests assert behaviour, never implementation. Real values, never `foo` or `123`.

See `skills/craft-conventions/references/` for the detailed rules with worked
examples.
