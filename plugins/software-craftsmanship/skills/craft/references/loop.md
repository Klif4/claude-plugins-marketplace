# Loop mechanics — exact commands

Every command below runs from the project root. The loop assumes a git repository
and a working tree that is clean at the start of each iteration.

## Two gates, two rhythms

The loop iterates **per scenario** and gates at **two** frequencies:

| Gate | Command | When | What it proves |
|---|---|---|---|
| Fast | `yarn craft:verify:fast --scenario "<title>" <unit test paths>` | every scenario, at 3d and 3g | this scenario is red, then green, and the project typechecks |
| Full | `yarn craft:verify` | once per **feature file**, at 3j | the whole unit suite is green, domain coverage is 100%, every scenario is green |

The full gate re-runs everything. Running it once per scenario means that at
scenario 20 you re-run nineteen already-green scenarios and re-instrument the whole
domain for coverage, twice per iteration — that is the quadratic cost that makes
late iterations crawl, and it is not what makes the loop correct. The fast gate is
what drives one scenario red-to-green; the full gate is what catches the regression
and the coverage hole, and it only has to run before the feature is called done.

Keep the agent granularity at the scenario. Handing a whole feature file to one
`implementer` buys the same wall-clock saving, but it makes the design big-bang
instead of emergent, and a failing gate then names a diff spanning eight scenarios
with no way to tell which one broke.

## Why git is the enforcement mechanism

Agent scope is stated in each agent's prompt, but a prompt is a request, not a
guarantee. Hooks cannot help here: a `PreToolUse` hook receives the tool call, not
the identity of the agent making it, so it cannot tell a legitimate `tests/` write
by the test-writer from an illegitimate one by the implementer.

Git can. The working tree before an agent runs is a known state; the diff after it
runs is exactly what that agent did. Reverting the out-of-scope part of that diff
is deterministic, needs no loop-state file, and adds no friction when working by
hand outside the loop.

## The allow-list principle

Both boundary checks work the same way: list everything that changed, subtract the
paths the agent was allowed to touch, and whatever remains is a violation.

Checking only the directories an agent must *not* touch is not enough. An
implementer that edits `vitest.config.ts` to relax the coverage thresholds passes
the coverage gate undetected; one that removes `strict: true` from `cucumber.mjs` makes
undefined steps pass silently. The allow-list catches both, and everything else
nobody thought of.

Two commands describe what an agent did:

- `git diff --name-only` — tracked files changed in the working tree since the
  index. At the start of an iteration the index equals `HEAD`, and phase 3c stages
  the tests, so this always means "changed since the last checkpoint".
- `git ls-files --others --exclude-standard` — new files.

## Phase 3c — after the test-writer

Allowed: `tests/` and `features/steps/`.

```bash
git diff --name-only            | grep -vE '^(tests/|features/steps/)'
git ls-files --others --exclude-standard | grep -vE '^(tests/|features/steps/)'
```

Both must print nothing. Anything printed is a violation — a `.feature` rewritten,
a `src/` file created, a config relaxed. Record it, then revert:

```bash
git diff --name-only | grep -vE '^(tests/|features/steps/)' | xargs -r git checkout --
git ls-files --others --exclude-standard | grep -vE '^(tests/|features/steps/)' | xargs -r rm -f
```

Then snapshot the tests into the index. This snapshot is what phase 3f compares
against:

```bash
git add -A -- tests features
```

Record the list of files the test-writer wrote — it is the only thing the
implementer receives, and the `tests/` entries in it are what the fast gate runs:

```bash
git diff --cached --name-only -- tests features
```

## Phase 3d — confirm red

```bash
yarn craft:verify:fast --scenario "<exact scenario title>" <the tests/ paths from 3c>
```

It must fail. The unit gate runs only the test files just written, the acceptance
gate runs only this scenario, and neither carries coverage instrumentation, so this
takes seconds. The script escapes the title itself and matches an outline's
substituted placeholders — pass the title verbatim, quoted.

Do not run the full `yarn craft:verify` here. Proving red does not need the other
nineteen scenarios re-run; the fast gate's first red is proof enough.

A scenario that is already green here means the step definitions assert nothing, or
assert something already true. Relaunch a fresh `test-writer` with that fact,
once. If it happens twice, stop and show the user the step definitions — the
scenario itself is probably not testable as written.

## Phase 3f — after the implementer

Allowed: `src/` only. The index holds the test snapshot, so any unstaged change is
something the implementer did.

```bash
git diff --name-only            | grep -vE '^src/'
git ls-files --others --exclude-standard | grep -vE '^src/'
```

Both must print nothing. Revert any violation:

```bash
git diff --name-only | grep -vE '^src/' | xargs -r git checkout --
git ls-files --others --exclude-standard | grep -vE '^src/' | xargs -r rm -f
```

A violation here is serious. A test modified means the implementer tried to make
the specification fit the code; a config modified means it tried to lower a gate.
Revert it, record it, and relaunch a fresh implementer stating explicitly that the
previous attempt wrote outside `src/` and that the tests and the configuration are
not negotiable.

## Phase 3g — the fast gate

```bash
yarn craft:verify:fast --scenario "<exact scenario title>" <the tests/ paths from 3c>
```

| Check | What it runs |
|---|---|
| The new unit tests are green | `vitest run --reporter=dot <those files>` |
| The scenario is green | `cucumber-js --name "<title>"` |
| The project typechecks | `tsc --noEmit` |

`tsc` stays whole-project in both modes — it is cheap and it is the one check that
catches a signature this scenario broke elsewhere.

What the fast gate deliberately does **not** see: a previously passing unit test
this iteration broke, and a domain file short of 100%. Both are the full gate's job
at 3j. Do not "just also run" `yarn craft:verify` here to be safe — that is exactly
the per-scenario full run this design removed.

## Phase 3h — mapping a failure to a role

Both gates name the failing check on their `FAIL` line; map that to a role:

| Symptom | Role to relaunch | What to inject |
|---|---|---|
| `scenario "<title>"` red, unit green | `implementer` | the Cucumber tail, the scenario title |
| `unit tests` red on the new tests | `implementer` | the Vitest tail |
| `unit suite` red on a **previously passing** test *(full gate only)* | `implementer` | the tail, flagged as a regression |
| Coverage short, uncovered lines are dead code *(full gate only)* | `implementer` | the shortfall list, instruction to delete |
| Coverage short, uncovered lines are legitimate behaviour *(full gate only)* | `test-writer` | the shortfall list, the scenario |
| `typecheck` red, `src` only | `implementer` | the `tsc` tail |
| `typecheck` red, `tests` only | `test-writer` | the `tsc` tail |

Inject the tail the script printed, not a re-run with a verbose reporter. If the
digest genuinely is not enough to place the failure, run the one raw command for
that gate **in this session** and inject only the relevant lines — never hand a
full transcript to an agent.

Read the uncovered lines before deciding between the two coverage rows. A guard
clause no scenario requires is dead code and gets deleted; a business branch the
scenario implies but no test asserts is a specification hole and goes back to the
test-writer.

Every relaunch is a **new `Agent` call**. Never `SendMessage` a previous agent:
a fresh context re-reads the current state of the files instead of reasoning from a
stale mental model of what it wrote earlier.

Three attempts maximum per scenario. Beyond that, the problem is upstream — the
scenario is ambiguous, or the tests over-specify — and it is the user's call.

A failure at the **full gate** (3j) names a regression or a coverage hole, and its
cause is somewhere in the scenarios of that feature file, not necessarily the last
one. Relaunch on the file the digest names — the coverage shortfall lists domain
files, and a red unit test names its own file. Same three-attempt budget, counted
for the feature file.

## Phase 3i — regenerate the map, then commit

```bash
git diff --cached --name-only -- src/domain   # empty? skip craft:map
yarn craft:map
git add -A
git commit -m "feat(<domain>): <scenario title>"
```

`craft:map` rewrites `.craft/api-map.d.ts` from the code that just went green: the
public signatures of `src/domain`, no method bodies. It is the only thing the next
iteration's agents receive about the code already written, so it stays **per
scenario** — a stale map is what makes the next test-writer reinvent a value object
that already exists, which costs far more than the `tsc` run.

Skip it only when this iteration changed nothing under `src/domain` — a scenario
satisfied by existing domain code and a new adapter. The map would come out
identical.

It is `tsc` output, so it cannot drift from the code. No agent ever writes it, and
`.craft/` is gitignored: `git add -A` will not pick it up.

If `craft:map` fails while the gates passed, the cause is `tsconfig.map.json`, not
the domain — report it and keep going; a missing map degrades the next iteration,
it does not break it.

One scenario, one commit. The history then reads as the list of business behaviours
delivered, and any commit can be reverted without breaking another scenario.

## Phase 3j — the full gate, at the end of each feature file

Run this after the **last scenario of a feature file** goes green and is committed,
before moving to the next file:

```bash
yarn craft:verify
```

| Gate | What `craft:verify` runs |
|---|---|
| The whole unit suite is green | `vitest run --coverage --reporter=dot` |
| Domain coverage is 100% | the thresholds in `vitest.config.ts` fail that same run |
| Every scenario is green | `cucumber-js` over the whole feature set |
| The project typechecks | `tsc --noEmit` |

The suite gate and the coverage gate are deliberately **one run**: `yarn test`
followed by `yarn coverage` executes the unit suite twice for the same verdict.

On failure the script prints the tail of the failing gate and, for coverage, the
domain files short of 100% with their percentages — read straight from
`coverage/coverage-summary.json`, not from the coverage table, which lists every
file whether it is short or not.

Route the failure with the 3h table, relaunch a fresh agent, and once it is green
commit the fix on its own:

```bash
yarn craft:map
git add -A
git commit -m "fix(<domain>): <what the full gate caught>"
```

Never replace this by the raw four commands to "see more". Their full output is
several thousand tokens, it lands in the agent context on every relaunch, and the
digest already names the failing gate.

A feature file is done when this gate is green. The loop moves to the next file
only then — carrying a regression into the next feature file is what makes it
untraceable.
