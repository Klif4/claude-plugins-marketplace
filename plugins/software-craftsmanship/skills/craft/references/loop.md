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
implementer receives:

```bash
git diff --cached --name-only -- tests features
```

## Phase 3d — confirm red

```bash
yarn test:acceptance --name "<exact scenario title>"   # must fail
yarn craft:verify                                      # must fail
```

`craft:verify` stops at the first red gate and prints only the tail of its output.
That is enough here: one red gate proves the suite is red, and the full transcript
of a failing suite is several thousand tokens nobody reads.

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
yarn craft:verify
```

One command, three gates, and its exit code is the verdict:

| Gate | What `craft:verify` runs |
|---|---|
| The whole unit suite is green | `vitest run --coverage --reporter=dot` |
| Domain coverage is 100% | the thresholds in `vitest.config.ts` fail that same run |
| Every scenario is green | `cucumber-js` over the whole feature set |
| *(plus)* the project typechecks | `tsc --noEmit` |

The suite gate and the coverage gate are deliberately **one run**: `yarn test`
followed by `yarn coverage` executes the unit suite twice for the same verdict.

Running the whole acceptance suite rather than `--name "<title>"` costs one command
and catches the scenario that this iteration broke. The named form stays useful at
3d, where only the new scenario matters.

On failure the script prints the tail of the failing gate and, for coverage, the
domain files short of 100% with their percentages — read straight from
`coverage/coverage-summary.json`, not from the coverage table, which lists every
file whether it is short or not.

Never replace this by the raw four commands to "see more". Their full output is
several thousand tokens, it lands in the agent context on every relaunch, and the
digest already names the failing gate.

## Phase 3h — mapping a failure to a role

`craft:verify` names the failing gate on its `FAIL` line; map that to a role:

| Symptom | Role to relaunch | What to inject |
|---|---|---|
| `acceptance scenarios` red, unit green | `implementer` | the Cucumber tail, the scenario title |
| `unit suite` red on the new tests | `implementer` | the Vitest tail |
| `unit suite` red on a **previously passing** test | `implementer` | the tail, flagged as a regression |
| Coverage short, uncovered lines are dead code | `implementer` | the shortfall list, instruction to delete |
| Coverage short, uncovered lines are legitimate behaviour | `test-writer` | the shortfall list, the scenario |
| `typecheck` red, `src` only | `implementer` | the `tsc` tail |
| `typecheck` red, `tests` only | `test-writer` | the `tsc` tail |

Inject the tail the script printed, not a re-run with a verbose reporter. If the
digest genuinely is not enough to place the failure, run the one raw command for
that gate **in this session** and inject only the relevant lines — never hand a
full transcript to an agent.

Read the uncovered lines before deciding between the last two rows. A guard clause
no scenario requires is dead code and gets deleted; a business branch the scenario
implies but no test asserts is a specification hole and goes back to the
test-writer.

Every relaunch is a **new `Agent` call**. Never `SendMessage` a previous agent:
a fresh context re-reads the current state of the files instead of reasoning from a
stale mental model of what it wrote earlier.

Three attempts maximum per scenario. Beyond that, the problem is upstream — the
scenario is ambiguous, or the tests over-specify — and it is the user's call.

## Phase 3i — regenerate the map, then commit

```bash
yarn craft:map
git add -A
git commit -m "feat(<domain>): <scenario title>"
```

`craft:map` rewrites `.craft/api-map.d.ts` from the code that just went green: the
public signatures of `src/domain`, no method bodies. It is the only thing the next
iteration's agents receive about the code already written, so it has to be
regenerated **here** — before the next `test-writer` starts, and only once the
domain compiles, which the gates just proved.

It is `tsc` output, so it cannot drift from the code. No agent ever writes it, and
`.craft/` is gitignored: `git add -A` will not pick it up.

If `craft:map` fails while the gates passed, the cause is `tsconfig.map.json`, not
the domain — report it and keep going; a missing map degrades the next iteration,
it does not break it.

One scenario, one commit. The history then reads as the list of business behaviours
delivered, and any commit can be reverted without breaking another scenario.
