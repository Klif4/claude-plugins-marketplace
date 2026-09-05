# Loop mechanics — exact commands

Every command below runs from the project root. The loop assumes a git repository
and a working tree that is clean at the start of each iteration.

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
gate 3 undetected; one that removes `strict: true` from `cucumber.mjs` makes
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
implementer receives:

```bash
git diff --cached --name-only -- tests features
```

## Phase 3d — confirm red

```bash
yarn test:acceptance --name "<exact scenario title>"   # must fail
yarn test                                              # must fail
```

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

## Phase 3g — the three gates

```bash
yarn test:acceptance --name "<exact scenario title>"   # gate 1
yarn test                                              # gate 2 — whole suite
yarn coverage                                          # gate 3 — thresholds fail the run
```

Gate 3 relies on the per-glob thresholds set in `vitest.config.ts`
(`src/domain/**` at 100% for lines, branches, functions and statements), so the
exit code is the verdict. To report *which* files fall short:

```bash
jq -r '
  to_entries[]
  | select(.key | test("src/domain/"))
  | select([.value.lines.pct, .value.branches.pct, .value.functions.pct, .value.statements.pct] | min < 100)
  | "\(.key)  lines=\(.value.lines.pct)% branches=\(.value.branches.pct)%"
' coverage/coverage-summary.json
```

## Phase 3h — mapping a failure to a role

| Symptom | Role to relaunch | What to inject |
|---|---|---|
| Gate 1 red, gate 2 green | `implementer` | the Cucumber output, the scenario title |
| Gate 2 red on the new tests | `implementer` | the failing Vitest output |
| Gate 2 red on a **previously passing** test | `implementer` | the regression output, flagged as a regression |
| Gate 3 short, uncovered lines are dead code | `implementer` | the uncovered file:line list, instruction to delete |
| Gate 3 short, uncovered lines are legitimate behaviour | `test-writer` | the uncovered file:line list, the scenario |
| Typecheck red, `src` only | `implementer` | the `tsc` output |
| Typecheck red, `tests` only | `test-writer` | the `tsc` output |

Read the uncovered lines before deciding between the last two rows. A guard clause
no scenario requires is dead code and gets deleted; a business branch the scenario
implies but no test asserts is a specification hole and goes back to the
test-writer.

Every relaunch is a **new `Agent` call**. Never `SendMessage` a previous agent:
a fresh context re-reads the current state of the files instead of reasoning from a
stale mental model of what it wrote earlier.

Three attempts maximum per scenario. Beyond that, the problem is upstream — the
scenario is ambiguous, or the tests over-specify — and it is the user's call.

## Phase 3i — commit

```bash
git add -A
git commit -m "feat(<domain>): <scenario title>"
```

One scenario, one commit. The history then reads as the list of business behaviours
delivered, and any commit can be reverted without breaking another scenario.
