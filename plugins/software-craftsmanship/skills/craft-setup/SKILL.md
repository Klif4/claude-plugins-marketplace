---
name: craft-setup
description: This skill should be used when the user asks to "set up the craft toolchain", "bootstrap a BDD TypeScript project", "add vitest and cucumber", "set up hexagonal architecture", "configure 100% domain coverage", or when the craft loop reports a missing dependency or script. It installs Vite, Vitest, Cucumber, Immutable, neverthrow, js-joda and vitest-mock-extended with yarn, and lays out the hexagonal directory structure with use cases in the domain.
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
ls tsconfig.json vitest.config.ts vite.config.ts cucumber.mjs 2>/dev/null
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
| `vite` | build |

Add `@js-joda/timezone` only if the domain reasons about named zones
(`ZoneId.of('Europe/Paris')`); `@js-joda/core` alone covers UTC and fixed offsets.
Do not install it speculatively.

## 3. Configuration

Copy from `assets/`, adapting nothing unless the project already diverges
(`mkdir -p scripts` first — two of them land there):

| Asset | Destination | What matters in it |
|---|---|---|
| `assets/tsconfig.json` | `tsconfig.json` | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `@domain`/`@application`/`@infrastructure` aliases |
| `assets/vitest.config.ts` | `vitest.config.ts` | **100% thresholds on `src/domain/**`** — this is what the loop's coverage gate reads |
| `assets/vite.config.ts` | `vite.config.ts` | same aliases, ES2022 |
| `assets/cucumber.mjs` | `cucumber.mjs` | `strict: true` so undefined steps fail rather than pass silently |
| `assets/tsconfig.map.json` | `tsconfig.map.json` | emits the domain's declarations — the input of `yarn craft:map` |
| `assets/craft-verify.mjs` | `scripts/craft-verify.mjs` | the loop's gate runner: a digest, not a transcript |
| `assets/craft-map.mjs` | `scripts/craft-map.mjs` | regenerates `.craft/api-map.d.ts` |
| `assets/package-scripts.json` | merge into `package.json` | `"type": "module"` and the eight scripts |

The scripts to merge:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:acceptance": "NODE_OPTIONS='--import tsx' cucumber-js",
"coverage": "vitest run --coverage",
"typecheck": "tsc --noEmit",
"build": "vite build",
"craft:verify": "node scripts/craft-verify.mjs",
"craft:map": "tsc -p tsconfig.map.json && node scripts/craft-map.mjs"
```

The last two exist for the loop, and both are there to keep agent context small.

`craft:verify` runs the three gates and prints one line per gate when they pass,
the tail of the output when one fails. The four raw commands print the name of
every test file and a coverage table over the whole project — several thousand
tokens landing in an agent's context on every attempt. It also runs the unit suite
**once** for both the suite gate and the coverage gate, where `yarn test` followed
by `yarn coverage` runs it twice.

`craft:map` regenerates `.craft/api-map.d.ts`: every public signature of
`src/domain`, no method bodies. It is what a fresh agent reads to learn what
already exists. Without it the loop hands each agent the path of every file
written so far, so iteration 20 costs twenty times iteration 1. It is emitted by
`tsc` from the real code, so it cannot drift — which is why no agent ever writes
it.

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
yarn test         # "no test files found" is the expected result on an empty project
yarn coverage
```

The two loop scripts are **not** run here, and neither is a failure at this stage:

- `yarn craft:verify` needs at least one test and one scenario — on an empty
  project vitest and cucumber both exit non-zero on finding nothing.
- `yarn craft:map` needs a `src/domain` that compiles, and this skill deliberately
  leaves `src/` empty.

The loop runs both from its first iteration onwards, and its agents treat a missing
map as "nothing exists yet".

Report the final state and point the user at the `craft` skill to start the loop.

## What this skill does not do

It writes no domain code, no value object, no `Result` helper and no example.
The first line of `src/` is written by the `implementer` agent, driven by a test.
Scaffolding a domain here would hand the loop code that no scenario asked for.
