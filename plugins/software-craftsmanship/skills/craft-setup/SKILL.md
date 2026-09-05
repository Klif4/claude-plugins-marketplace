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

Copy from `assets/`, adapting nothing unless the project already diverges:

| Asset | Destination | What matters in it |
|---|---|---|
| `assets/tsconfig.json` | `tsconfig.json` | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `@domain`/`@application`/`@infrastructure` aliases |
| `assets/vitest.config.ts` | `vitest.config.ts` | **100% thresholds on `src/domain/**`** — this is what gate 3 of the loop reads |
| `assets/vite.config.ts` | `vite.config.ts` | same aliases, ES2022 |
| `assets/cucumber.mjs` | `cucumber.mjs` | `strict: true` so undefined steps fail rather than pass silently |
| `assets/package-scripts.json` | merge into `package.json` | `"type": "module"` and the six scripts |

The scripts to merge:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:acceptance": "NODE_OPTIONS='--import tsx' cucumber-js",
"coverage": "vitest run --coverage",
"typecheck": "tsc --noEmit",
"build": "vite build"
```

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
```

## 6. Verify

```bash
yarn typecheck
yarn test         # "no test files found" is the expected result on an empty project
yarn coverage
```

Report the final state and point the user at the `craft` skill to start the loop.

## What this skill does not do

It writes no domain code, no value object, no `Result` helper and no example.
The first line of `src/` is written by the `implementer` agent, driven by a test.
Scaffolding a domain here would hand the loop code that no scenario asked for.
