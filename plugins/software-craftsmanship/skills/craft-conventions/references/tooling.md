# Tooling

The package manager is **yarn**. Never npm.

## Scripts

```json
"test": "vitest run",
"test:watch": "vitest",
"test:acceptance": "NODE_OPTIONS='--import tsx' cucumber-js",
"coverage": "vitest run --coverage",
"typecheck": "tsc --noEmit",
"build": "vite build"
```

## Running one scenario

```bash
yarn test:acceptance --name "An order just below the minimum is refused"
```

`--name` matches the scenario title as a regular expression. Quote it, and use the
title exactly as written in the `.feature` file. For a `Scenario Outline`, the
title matches every generated example.

Other useful selections:

```bash
yarn test:acceptance features/checkout.feature          # one file
yarn test:acceptance features/checkout.feature:14       # one scenario by line
yarn test:acceptance --tags '@wip'                      # by tag
```

## Running one unit test file

```bash
yarn test tests/domain/Money.spec.ts
yarn test -t 'refuses an order below the minimum amount'
```

## Coverage thresholds

`vitest.config.ts` gates `src/domain/**` at 100%:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'json-summary'],
  include: ['src/**/*.ts'],
  exclude: ['src/**/index.ts', 'src/infrastructure/**', 'src/application/**'],
  thresholds: {
    '**/src/domain/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
  },
}
```

`yarn coverage` exits non-zero when the threshold is missed, so its exit code is
the verdict — no parsing needed. `yarn craft:verify` wraps it (see below) and
already prints the shortfall; the query below is for when you want it on its own.
To find out *which* files fall short:

```bash
jq -r '
  to_entries[]
  | select(.key | test("src/domain/"))
  | select([.value.lines.pct, .value.branches.pct, .value.functions.pct, .value.statements.pct] | min < 100)
  | "\(.key)  lines=\(.value.lines.pct)% branches=\(.value.branches.pct)%"
' coverage/coverage-summary.json
```

`src/infrastructure/**` and `src/application/**` are excluded on purpose: adapters
are covered by their own integration tests, and the composition root is wiring.
Holding either to 100% pushes people towards mocking the library they are adapting,
or towards testing that a constructor was called.

The gate covers `src/domain/**`, which now includes `src/domain/usecases/**` and
`src/domain/UseCaseFactory.ts` — that is deliberate: a use case is business
behaviour and every branch of it must be demanded by a test.

## The two loop scripts

`craft-setup` installs two scripts that exist for the `craft` loop, and that are
just as usable by hand:

| Script | What it does |
|---|---|
| `yarn craft:verify` | unit suite, domain coverage, acceptance scenarios and `tsc`, in one run — one line per gate when green, the tail of the output plus the coverage shortfall when red |
| `yarn craft:map` | regenerates `.craft/api-map.d.ts`: every public signature of `src/domain`, no method bodies, emitted by `tsc` |

Both exist to keep an agent's context small. A fresh agent has to be told what
already exists, and the map says it in ~1 line per export instead of forty files;
`craft:verify` says a suite is red in a handful of lines instead of a transcript.
`craft:verify` also runs the unit suite **once** for both the suite gate and the
coverage gate, where `yarn test` then `yarn coverage` runs it twice.

The map is `tsc` output, so it cannot drift from the code — which is why nothing
ever edits it by hand, and why `.craft/` is gitignored.

## Dates

`@js-joda/core` is a runtime dependency, imported by the domain like `immutable`
and `neverthrow`. It needs no configuration.

`@js-joda/timezone` is added only when the domain reasons about a named zone. It
registers its data as a side effect, so import it once at the composition root
(`src/application/`) and never from `src/domain/**`:

```ts
import '@js-joda/timezone'
```

## Cucumber with TypeScript under ESM

`package.json` declares `"type": "module"`, and `tsx` is loaded through
`NODE_OPTIONS='--import tsx'`. `cucumber.mjs` sets:

```js
export default {
  paths: ['features/**/*.feature'],
  import: ['features/steps/**/*.ts'],
  format: ['progress', 'summary'],
  strict: true,
}
```

`strict: true` matters for the craft loop: undefined and pending steps fail the run
instead of passing silently, so a scenario is always unambiguously red or green.

## Path aliases

`@domain`, `@application` and `@infrastructure` are declared in three places and
must stay in sync: `tsconfig.json` (`paths`), `vitest.config.ts` (`resolve.alias`)
and `vite.config.ts` (`resolve.alias`). Cucumber resolves them through `tsx`, which
reads `tsconfig.json`.

**Only subpath imports are supported**: `@domain/Money` resolves everywhere,
`@domain` bare does not. The two config styles differ — `tsconfig.json` maps
`"@domain/*"` to `["src/domain/*"]`, while Vite and Vitest alias the bare key
`'@domain'` to the directory — and they agree only on the subpath form. Importing
a barrel with `from '@domain'` resolves under Vite and Vitest and then fails
`yarn typecheck`. Import the module, not the directory.
