---
name: craft-review
description: This skill should be used when the user asks to "review this for craft", "craft audit", "audit my domain", "check craft conventions", "is this code idiomatic craft", "find primitive obsession", "find code that throws", "check for mutations", "are these tests coupled to the implementation", or wants existing TypeScript audited against software craftsmanship rules. It reports violations of immutability, no-throw, primitive obsession, tell-don't-ask, hexagonal layering and behaviour-based testing, ranked by cost to fix later.
argument-hint: "[path, or nothing to review the current diff]"
allowed-tools: Read, Grep, Glob, Bash
---

# Craft review

Audit existing TypeScript against the rules in `craft-conventions`. Report; do not
fix unless asked.

## Resolve the target

The target is what the user named — `$ARGUMENTS` when invoked as a slash command.
Resolve it once, into a shell variable every command below reuses:

```bash
# An explicit path
TARGET="src/domain"

# Or the current diff, when no target was given
TARGET=$(git diff --name-only HEAD -- '*.ts' \
         || git diff --name-only origin/HEAD... -- '*.ts')
```

`grep -r` accepts a directory or a list of files indifferently, so the same
commands serve both cases. Where a command below narrows to a layer
(`src/domain`, `tests`), intersect that layer with `$TARGET` rather than replacing
it — reviewing `src/application/PlaceOrder.ts` must not silently audit the whole
project.

## Method

Grep is the first pass, not the verdict. Every hit below needs reading in context:
a `let` inside a build script is fine, a `let` inside an aggregate is not. Report
only what survives reading.

## Detection pass

Run these over `$TARGET`, then read each hit. The layer paths shown are the default
when the target is the whole project; narrow them to `$TARGET` otherwise. Add
`2>/dev/null` where a layer may not exist.

```bash
# Exceptions in domain and application
grep -rnE '\bthrow\b|\btry\s*\{' src/domain src/application

# Mutation and imperative style
grep -rnE '\blet\b|\bfor\s*\(|\bwhile\s*\(|\.push\(|\.pop\(|\.splice\(|\.sort\(' src/domain src/application

# Native iterables where immutable is required
grep -rnE ':\s*[A-Za-z<>]+\[\]|\bArray<|\bnew Map\(|\bnew Set\(|Object\.keys\(' src/domain src/application

# Primitive obsession at domain boundaries
grep -rnE '\((\w+): (string|number|boolean)|\): (string|number|boolean)\b' src/domain

# Dependency rule violations
grep -rn "from '.*infrastructure" src/domain src/application
grep -rn "from '.*application" src/domain

# Cross-suite coupling
grep -rn "from '.*tests/" features
grep -rn "from '.*features/" tests

# Tests coupled to the implementation
grep -rnE 'spyOn|toHaveBeenCalledTimes|\[.private|as never|as unknown as' tests features

# Escapes and disabled tests
grep -rnE '@ts-ignore|@ts-expect-error|:\s*any\b|\.skip\(|\.todo\(|\.only\(' src tests features
```

Then check the gates — always project-wide, whatever the target:

```bash
yarn coverage 2>&1 | tail -20
yarn typecheck
```

## What to report, ranked

Rank by what it costs to fix later, not by how many hits there are.

**1. Structural — expensive to reverse**
- Dependency rule violated: `domain` importing from `infrastructure` or
  `application`. Every later change compounds this.
- Primitive obsession at a domain boundary: a bare `string` or `number` crossing
  into the domain. Every caller added meanwhile has to be revisited.
- A port named after its technology (`StripeGateway`, `PostgresRepository` as an
  interface in `domain`) — the domain has learned about a vendor.

**2. Behavioural — silent bugs**
- `throw` in `domain` or `application`: a failure path invisible in the signature.
- Mutation of a value object or an aggregate: aliasing bugs that surface far from
  the cause.
- Tell-don't-ask violations: a rule duplicated across callers because the object
  will not own it. Report each caller that re-implements the same condition.

**3. Test quality — false confidence**
- Assertions on private methods, call counts, or call order: the suite blocks
  refactoring instead of enabling it.
- `mock<T>()` on an entity, a value object or a pure function: asserting against a
  fiction.
- `.skip` / `.todo` / `.only` left behind: `.only` silently shrinks the suite.
- Placeholder data (`foo`, `test`, `123`): a test whose values say nothing about
  the rule.

**4. Style — cheap to fix, fix in passing**
- `let`, imperative loops, native arrays where `immutable` is required.
- Names like `data`, `info`, `manager`, `helper`, `utils`, `process`.
- Comments explaining *what* rather than *why*.

## Uncovered domain code

Every uncovered line in `src/domain/**` is a finding. Classify each one:

- **Undemanded code** — a defensive guard, a speculative case, an unused
  parameter or method. Recommend deleting it.
- **Specification hole** — legitimate business behaviour no test demands.
  Recommend a test, and name the behaviour it should assert.

Default to the first reading. Untested code is usually code nobody asked for.

## Report format

Group by the four ranks above. For each finding:

```
src/domain/Order.ts:42 — throws instead of returning a Result
  `throw new Error('already shipped')` hides a failure path from the signature;
  every caller has to know about it without the compiler saying so.
  → return `err(new OrderAlreadyShipped(this.shippedOn))`
```

Say what is wrong, why it costs something, and what to do instead. Skip anything
that is only a matter of taste.

Close with the two gates (`yarn coverage`, `yarn typecheck`) and, when the code is
clean on a rank, say so — a review that only lists problems does not tell the
reader what is already solid.

## Related skills

- **`craft-conventions`** — the rules this review applies.
- **`craft`** — the loop that produces code satisfying them by construction.
