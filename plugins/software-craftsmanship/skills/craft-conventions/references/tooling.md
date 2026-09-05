# Tooling

The package manager is **yarn**. Never npm.

## Scripts

```json
"test": "vitest run",
"test:watch": "vitest",
"test:acceptance": "cucumber-js",
"coverage": "vitest run --coverage",
"typecheck": "tsc --noEmit",
"build": "vite build",
"craft:verify": "node scripts/craft-verify.mjs",
"craft:verify:fast": "node scripts/craft-verify.mjs --fast",
"craft:map": "tsc -p tsconfig.map.json && node scripts/craft-map.mjs"
```

## Running one scenario

```bash
yarn test:acceptance --name "An order just below the minimum is refused"
```

`--name` is a **regex**, not a literal: a title containing `.`, `(` or `?` matches
more than you think, and a `Scenario Outline` title is matched after its
placeholders have been substituted with the row's values. `yarn craft:verify:fast`
handles both — it escapes the title and turns `<placeholder>` into `.+` — so prefer
it when you want one scenario plus its unit tests and a typecheck.

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

## The three loop scripts

`craft-setup` installs three scripts that exist for the `craft` loop, and that are
just as usable by hand:

| Script | What it does |
|---|---|
| `yarn craft:verify:fast --scenario "<title>" <unit test paths>` | one scenario, the unit test files that specify it, and `tsc` — no coverage instrumentation, no re-run of the scenarios already delivered |
| `yarn craft:verify` | the whole unit suite, domain coverage, every acceptance scenario and `tsc`, in one run — one line per gate when green, the tail of the output plus the coverage shortfall when red |
| `yarn craft:map` | regenerates `.craft/api-map.d.ts`: every public signature of `src/domain`, no method bodies, emitted by `tsc` |

The two gates run at different rhythms: the fast one on every scenario, the full
one once per feature file. The full gate re-runs everything, so running it per
scenario re-verifies every already-green scenario each time — a cost that grows
with the feature and buys nothing that the end-of-file run does not catch.

All three exist to keep an agent's context small. A fresh agent has to be told what
already exists, and the map says it in ~1 line per export instead of forty files;
either gate says a suite is red in a handful of lines instead of a transcript.
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

`package.json` declares `"type": "module"`, and `cucumber.mjs` installs `tsx`'s ESM
hooks itself:

```js
import { register } from 'tsx/esm/api'

register()

export default {
  import: ['features/steps/**/*.ts'],
  format: ['progress', 'summary'],
  formatOptions: { snippetInterface: 'async-await' },
  strict: true,
}
```

Three points, each of which a `NODE_OPTIONS`-based setup gets wrong:

- **`register()` in the config, not `NODE_OPTIONS='--import tsx'` in the script.**
  The script stays a bare `cucumber-js`, so a run launched from an IDE gutter — which
  invokes `cucumber-js` directly and never sees the yarn script's environment — loads
  the TypeScript steps like a run from the terminal.
- **No `paths` key.** `cucumber-js` already defaults to `features/**/*.feature`.
  Setting it here would be *merged with*, not overridden by, the feature file an IDE
  passes on the command line, so asking for one scenario would run the whole suite.
- **`strict: true`** matters for the craft loop: undefined and pending steps fail the
  run instead of passing silently, so a scenario is always unambiguously red or green.

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
