---
name: craft-setup
description: This skill should be used when the user asks to "set up the craft toolchain", "bootstrap a BDD TypeScript project", "add vitest and cucumber", "set up hexagonal architecture", "configure 100% domain coverage", or when the craft loop reports a missing dependency or script. It installs Vitest, Cucumber, Immutable, neverthrow, js-joda and vitest-mock-extended with yarn, lays down the domain `Option` type that replaces `undefined`, and lays out the hexagonal directory structure with use cases in the domain.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Craft toolchain setup

Bring a TypeScript project to the state the `craft` loop expects: the toolchain,
the strict configuration, the hexagonal layout, and the coverage gate.

This skill is **idempotent**. Inspect what already exists before writing anything,
and never overwrite a config the project already customised — report the
divergence instead.

## 1. Inspect

```bash
cat package.json 2>/dev/null
ls tsconfig.json vitest.config.ts cucumber.mjs tsconfig.map.json 2>/dev/null
ls -d src tests features 2>/dev/null
```

Report what is already in place. Only act on what is missing.

If `package.json` is absent, create it first — `yarn add` needs it:

```bash
yarn init -y
```

## 2. Dependencies

Use **yarn**, never npm.

```bash
yarn add immutable neverthrow @js-joda/core
yarn add -D typescript vite vitest @vitest/coverage-v8 \
            @cucumber/cucumber tsx vitest-mock-extended @types/node
```

| Package | Why |
|---|---|
| `immutable` | every iterable in the domain: `List`, `Map`, `Set`, `Record` |
| `neverthrow` | `Result` / `ResultAsync` — the domain throws nothing |
| `@js-joda/core` | every date, time, instant and duration — the native `Date` is banned |
| `vitest` + `@vitest/coverage-v8` | unit tests and the 100% domain gate |
| `@cucumber/cucumber` + `tsx` | executable Gherkin, TypeScript steps under ESM |
| `vitest-mock-extended` | typed `mock<Port>()` for outgoing ports |
| `vite` | Vitest's peer dependency, nothing more — no `vite.config.ts`, no `build` script |

The loop produces a domain, not an artefact. Add a bundler configuration the day
the project ships one, not before.

Add `@js-joda/timezone` only if the domain reasons about named zones
(`ZoneId.of('Europe/Paris')`); `@js-joda/core` alone covers UTC and fixed offsets.
Do not install it speculatively.

## 3. Configuration

Copy from `assets/`, adapting nothing unless the project already diverges
(`mkdir -p scripts` first — four of them land there):

| Asset | Destination | What matters in it |
|---|---|---|
| `assets/tsconfig.json` | `tsconfig.json` | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, relative `@domain`/`@application`/`@infrastructure` aliases and no `baseUrl` (TypeScript 7 removed it), `incremental` with its build info under `.craft/` — the loop typechecks after every edit, and a whole-project recompilation each time is the single most expensive thing it does for nothing |
| `assets/vitest.config.ts` | `vitest.config.ts` | **100% thresholds on `src/domain/**`** — this is what the loop's coverage gate reads |
| `assets/cucumber.mjs` | `cucumber.mjs` | registers `tsx`'s ESM hooks itself, declares no `paths`, `strict: true` |
| `assets/tsconfig.map.json` | `tsconfig.map.json` | emits the domain's declarations with `rootDir` pinned to `src/domain` — the input of `yarn craft:map` |
| `assets/craft-verify.mjs` | `scripts/craft-verify.mjs` | the loop's gate runner, in two modes: a digest, not a transcript |
| `assets/craft-map.mjs` | `scripts/craft-map.mjs` | runs `tsc -p tsconfig.map.json` on a clean staging dir and assembles `.craft/api-map.d.ts` |
| `assets/craft-scope.mjs` | `scripts/craft-scope.mjs` | the loop's boundary check: lists what an agent wrote outside its allow-list, reverts it, snapshots the rest |
| `assets/craft-commit.mjs` | `scripts/craft-commit.mjs` | closes an iteration: conditional `craft:map`, stage, commit |
| `assets/Option.ts` | `src/domain/Option.ts` | the domain's absent-value type — `undefined` and `null` are banned under `src/domain/**` |
| `assets/Option.test.ts` | `tests/domain/Option.test.ts` | its specification, and what keeps it at 100% under the coverage gate |
| `assets/package-scripts.json` | merge into `package.json` | `"type": "module"` and the ten scripts |

The scripts to merge:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:acceptance": "cucumber-js",
"coverage": "vitest run --coverage",
"typecheck": "tsc --noEmit",
"craft:verify": "node scripts/craft-verify.mjs",
"craft:verify:fast": "node scripts/craft-verify.mjs --fast",
"craft:map": "node scripts/craft-map.mjs",
"craft:scope": "node scripts/craft-scope.mjs",
"craft:commit": "node scripts/craft-commit.mjs"
```

`test:acceptance` is a bare `cucumber-js` with no `NODE_OPTIONS`: `cucumber.mjs`
calls `register()` from `tsx/esm/api` itself, so the TypeScript steps load whether
the run comes from yarn, from `craft:verify`, or from an IDE gutter that invokes
`cucumber-js` directly. That config also declares no `paths` — cucumber-js already
defaults to `features/**/*.feature`, and a `paths` key would be merged with, not
overridden by, the feature file an IDE passes on the command line, turning "run this
one scenario" into a full-suite run.

The last five exist for the loop: to keep agent context small, to keep the loop's
wall-clock from growing with the feature, and to keep the number of round-trips
between two agent launches down to a handful.

`craft:verify` is the **full gate**: the whole unit suite, domain coverage at 100%,
every acceptance scenario and `tsc`. It prints one line per gate when they pass, the
tail of the output when one fails. The four raw commands print the name of every
test file and a coverage table over the whole project — several thousand tokens
landing in an agent's context on every attempt. It also runs the unit suite **once**
for both the suite gate and the coverage gate, where `yarn test` followed by
`yarn coverage` runs it twice.

`craft:verify:fast --feature <path> <unit test paths>` is the **feature-file
gate**: the scenarios of that one file, those test files, and `tsc` — no coverage
instrumentation and no re-run of the feature files already delivered. Its checks are
independent, so they run **concurrently**: the gate costs the slowest of them rather
than their sum. The loop drives one feature file per iteration, and this is the gate
its agents run while they work; the full gate runs once, after it is green. Handing
the agents the full gate instead costs minutes per attempt, for checks that only
need to hold once the file is done.

`--no-typecheck` drops `tsc` from it. That is the form the agents run after every
edit — the orchestrator runs the complete fast gate the moment they hand back, so
a type error cannot survive the iteration — and it is what keeps a one-line edit
from paying for a compilation.

`craft:scope --allow <prefixes> [--stage <paths>]` is the **boundary check**: it
lists everything that changed outside the prefixes an agent was allowed to write,
reverts it, and optionally snapshots the allowed part into the git index and prints
what was written. It replaces six commands the orchestrator used to run by hand
between two agents. A tracked violation is restored from the index; an untracked one
is deleted under `src/`, `tests/` and `features/`, and merely reported outside them
— the loop never deletes a file it cannot be sure it created.

`craft:commit "<message>"` closes an iteration: it regenerates the map when
`src/domain` changed, stages, and commits. A failed map is reported and does not
stop the commit.

`craft:map` regenerates `.craft/api-map.d.ts`: every public signature of
`src/domain`, no method bodies. It is what a fresh agent reads to learn what
already exists. Without it the loop hands each agent the path of every file
written so far, so iteration 20 costs twenty times iteration 1. It is emitted by
`tsc` from the real code, so it cannot drift — which is why no agent ever writes
it. The script owns the `tsc` run and wipes `.craft/dts` first, so a failed run
never leaves declarations that a later run would fold into the map twice.

Both scripts are plain Node with no dependency of their own.

Merge into an existing `package.json` with `jq`, never by rewriting the file. The
existing file goes **last** in the `*` merge so a script the project already
defines wins over the template — the skill adds what is missing and overwrites
nothing:

```bash
ASSET="${CLAUDE_PLUGIN_ROOT}/skills/craft-setup/assets/package-scripts.json"
jq -s '.[1] * .[0]' package.json "$ASSET" > package.json.tmp \
  && mv package.json.tmp package.json
```

Then report any script whose existing definition differs from the template, so the
user can decide.

## 4. Layout

```bash
mkdir -p src/domain/usecases src/infrastructure src/application
mkdir -p tests/domain/usecases tests/application tests/fakes tests/builders
mkdir -p features/steps/support/fakes
mkdir -p scripts
```

```
src/domain/         entities, value objects, domain errors, ports, use cases,
                    and the UseCaseFactory that builds them from ports
src/infrastructure/ concrete adapters — implement the ports
src/application/    composition root — instantiates the adapters, builds the
                    factory, and exposes the app: HTTP controllers, CLI, entry point
```

Their unit tests are mirrored under `tests/`, and the acceptance suite lives under
`features/`. The `craft-conventions` skill holds the rationale for this layout and
the dependency rule it encodes.

Two consequences worth stating at setup time. **Use cases are domain code**, so
they sit under the 100% coverage gate along with the `UseCaseFactory` — which is
covered because tests and step definitions build their use cases through the
factory rather than with `new`. And **`src/application/` is the only layer that
names a concrete adapter**: it is excluded from the coverage gate for that reason.

One point matters at setup time: **the two fake directories are deliberate.**
`features/steps/support/fakes/` and `tests/fakes/` hold the same in-memory adapters,
duplicated on purpose. `features/**` never imports from `tests/**`, and the reverse
— so neither suite can break the other by changing a shared helper.

### The `Option` type

`Option.ts` is the one piece of domain code this skill writes, and it is
deliberate: rule 2 bans `undefined` and `null` from `src/domain/**`, so the type
that replaces them has to exist before the first scenario is written. It ships
with its own test file, so it lands already at 100% and the coverage gate stays
meaningful from the first iteration.

It depends only on `immutable` (for `equals`/`hashCode`, so an `Option` composes
inside a `Record`) and on `neverthrow` (for `okOr`, which turns an absence into a
named domain failure). Copy both files verbatim; if the project already has an
`Option`, report the divergence rather than overwriting it.

```bash
ASSETS="${CLAUDE_PLUGIN_ROOT}/skills/craft-setup/assets"
cp "$ASSETS/Option.ts" src/domain/Option.ts
cp "$ASSETS/Option.test.ts" tests/domain/Option.test.ts
```

The two destination directories were created by the layout above.

## 5. Add to .gitignore

```
node_modules/
coverage/
dist/
.craft/
```

`.craft/` holds the generated API map. It is regenerated from the code at every
commit of the loop, so committing it would only add conflicts.

## 6. Verify

```bash
yarn typecheck
yarn test         # Option.test.ts is the only suite at this point, and it is green
yarn coverage     # src/domain/Option.ts at 100% on all four metrics
```

Step definitions will import their assertions explicitly
(`import { expect } from 'vitest'`); the `test-writer` knows, and
`references/tooling.md` in `craft-conventions` says why.

The two loop scripts are **not** run here, and neither is a failure at this stage:

- `yarn craft:verify` and `yarn craft:verify:fast` need at least one scenario —
  and there is none yet, so cucumber exits non-zero on finding nothing.
- `yarn craft:map` would emit a map holding `Option` alone. Leave it to the loop,
  which regenerates it at every iteration.

The loop runs both from its first iteration onwards, and its agents treat a missing
map as "nothing exists yet".

Report the final state and point the user at the `craft` skill to start the loop.

## What this skill does not do

Apart from `Option.ts` and its test, it writes no domain code: no value object, no
entity, no `Result` helper, no example. Everything else under `src/` is written by
the `implementer` agent, driven by a test. Scaffolding a domain here would hand the
loop code that no scenario asked for.

`Option` is the exception because it is the vocabulary the rules are stated in, not
a piece of the business: no scenario can ask for it, and every scenario that
mentions something optional needs it already there.
