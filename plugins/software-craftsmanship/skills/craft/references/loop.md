# Loop mechanics — exact commands

Every command below runs from the project root. The loop assumes a git repository
and a working tree that is clean at the start of each iteration.

## One iteration = one feature file

The loop iterates **per feature file**. One `test-writer` writes the step
definitions and the unit tests of every scenario in the file; one `implementer`
makes them all green; both gates then run on that file before it is committed.

| Gate | Command | When | What it proves |
|---|---|---|---|
| Fast | `yarn craft:verify:fast --feature <path> <unit test paths>` | at 3d, at 3g, and inside both agents | the file's scenarios are red, then green, and the project typechecks |
| Full | `yarn craft:verify` | at 3h, once the fast gate is green | the whole unit suite is green, domain coverage is 100%, every scenario of every file is green |

The two gates keep their split even though both now run once per file. The fast
gate is what the agents run — the implementer runs it after every edit, and the
full gate's coverage instrumentation over the whole domain plus every scenario
already delivered costs minutes per attempt. The full gate runs once, at the end of
the iteration, and it is what catches the scenario in an earlier feature file this
one broke and the domain branch no test demands.

The agent granularity is the feature file, not the scenario. A feature file is one
business capability, so the design that emerges from it is coherent across its
scenarios instead of being bent one scenario at a time, and one iteration costs two
agent launches instead of two per scenario. The cost is real and worth stating: a
red gate names a diff spanning the whole file, so recovery is coarser. The gate
digest names the failing scenario and the failing test file, which is what makes it
workable — read it before relaunching.

## Two lines of enforcement: a hook, then git

Agent scope is stated in each agent's prompt, but a prompt is a request, not a
guarantee. Two mechanisms make it one.

**The hook refuses the write before it happens.** The plugin registers one
`PreToolUse` hook in `hooks/hooks.json` — `scripts/craft-guard.sh`. Every hook
input carries `agent_type` when it fires inside a subagent, so the script
dispatches on it: for the bdd-writer, the test-writer and the implementer it sees
the `file_path` of every `Write` and `Edit` and exits 2 outside the agent's
allow-list; for anyone else, including this session, it exits 0 at once. The
refusal lands in the agent's context, so it stops instead of burning a turn on a
write that would be reverted anyway. For the test-writer and the implementer the
same hook refuses any `git` command and any dependency install from the shell: the
index snapshot below is theirs to break otherwise. (Claude Code ignores `hooks`
declared in a plugin agent's frontmatter, which is why the guard lives at plugin
level and dispatches itself.)

**Git catches what the hook cannot see.** An agent holding `Bash` can still write
a file with a heredoc or `sed -i`, and no `Write` hook fires for that. So the
working tree before an agent runs is a known state, the diff after it runs is
exactly what that agent did, and reverting the out-of-scope part of that diff is
deterministic, needs no loop-state file, and adds no friction when working by hand
outside the loop. A violation that reaches this check is worth recording: it means
the agent went around the hook.

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
yarn craft:verify:fast --feature <the feature file> <the tests/ paths from 3c>
```

It must fail. The unit gate runs only the test files just written, the acceptance
gate runs only this file's scenarios, and neither carries coverage instrumentation,
so this takes seconds. The feature file is passed positionally to `cucumber-js`, so
no scenario of any other file runs.

Do not run the full `yarn craft:verify` here. Proving red does not need the feature
files already delivered re-run; the fast gate's first red is proof enough.

A file that is already green here means the step definitions assert nothing, or
assert something already true. Relaunch a fresh `test-writer` with that fact,
once. If it happens twice, stop and show the user the step definitions — the
scenarios themselves are probably not testable as written.

If only *some* scenarios of the file are red, that is the normal state and the gate
is red: cucumber fails the run as a whole. Do not narrow the gate to the red ones.

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
yarn craft:verify:fast --feature <the feature file> <the tests/ paths from 3c>
```

| Check | What it runs |
|---|---|
| The new unit tests are green | `vitest run --reporter=dot <those files>` |
| Every scenario of this file is green | `cucumber-js <the feature file>` |
| The project typechecks | `tsc --noEmit` |

`tsc` stays whole-project in both modes — it is cheap and it is the one check that
catches a signature this file broke elsewhere.

What the fast gate deliberately does **not** see: a previously passing unit test
this iteration broke, a scenario of another feature file it broke, and a domain
file short of 100%. All three are the full gate's job at 3h.

## Phase 3h — the full gate

Once the fast gate is green, and before committing:

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

Never replace this by the raw four commands to "see more". Their full output is
several thousand tokens, it lands in the agent context on every relaunch, and the
digest already names the failing gate.

A feature file is done when this gate is green. The loop moves to the next file
only then — carrying a regression into the next feature file is what makes it
untraceable.

## Phase 3i — mapping a failure to a role

Both gates name the failing check on their `FAIL` line; map that to a role:

| Symptom | Role to relaunch | What to inject |
|---|---|---|
| A scenario of this file red, unit green | `implementer` | the Cucumber tail, the titles of the failing scenarios |
| `unit tests` red on the new tests | `implementer` | the Vitest tail |
| `unit suite` red on a **previously passing** test *(full gate only)* | `implementer` | the tail, flagged as a regression |
| A scenario of **another** feature file red *(full gate only)* | `implementer` | the Cucumber tail, flagged as a regression |
| Coverage short, uncovered lines are dead code *(full gate only)* | `implementer` | the shortfall list, instruction to delete |
| Coverage short, uncovered lines are legitimate behaviour *(full gate only)* | `test-writer` | the shortfall list, the scenario that implies the branch |
| `typecheck` red, `src` only | `implementer` | the `tsc` tail |
| `typecheck` red, `tests` only | `test-writer` | the `tsc` tail |

Inject the tail the script printed, not a re-run with a verbose reporter. If the
digest genuinely is not enough to place the failure, run the one raw command for
that gate **in this session** and inject only the relevant lines — never hand a
full transcript to an agent.

A red gate over a whole feature file names a diff spanning all its scenarios, so
name the failing scenarios and test files explicitly in the relaunch prompt: that
is what tells the fresh agent where in the file to look. Never ask it to "fix the
feature" without that.

Read the uncovered lines before deciding between the two coverage rows. A guard
clause no scenario requires is dead code and gets deleted; a business branch a
scenario implies but no test asserts is a specification hole and goes back to the
test-writer.

Every relaunch is a **new `Agent` call**. Never `SendMessage` a previous agent:
a fresh context re-reads the current state of the files instead of reasoning from a
stale mental model of what it wrote earlier.

**Relaunching a `test-writer` after the implementer has run** — the typecheck-red-
on-tests row, or a coverage row at the full gate — needs one step first:

```bash
git add -A -- src
```

The index then holds both the test snapshot and the implementer's work. Without
it, the 3c check that follows the relaunch lists every `src/` file the implementer
touched as unstaged, reads it as a violation, and reverts the implementation. After
the relaunch, run 3c again, then re-run the fast gate.

Three attempts maximum per feature file. Beyond that, the problem is upstream — the
scenarios are ambiguous, or the tests over-specify — and it is the user's call.
Report which scenarios of the file are green and which are not, rather than
abandoning the file as a block.

## Phase 3j — regenerate the map, then commit

```bash
git status --porcelain -- src/domain   # empty? skip craft:map
yarn craft:map
git add -A
git commit -m "feat(<domain>): <feature title>"
```

`craft:map` rewrites `.craft/api-map.d.ts` from the code that just went green: the
public signatures of `src/domain`, no method bodies. It is the only thing the next
iteration's agents receive about the code already written, so it is regenerated
before every commit — a stale map is what makes the next test-writer reinvent a
value object that already exists, which costs far more than the `tsc` run.

Skip it only when this iteration changed nothing under `src/domain` — a feature
satisfied by existing domain code and a new adapter. The map would come out
identical. `git status --porcelain` is what to ask, not `git diff`: a recovery may
have staged `src/`, and staged changes are invisible to an unqualified `git diff`.

It is `tsc` output, so it cannot drift from the code. No agent ever writes it, and
`.craft/` is gitignored: `git add -A` will not pick it up.

If `craft:map` fails while the gates passed, the cause is `tsconfig.map.json`, not
the domain — report it and keep going; a missing map degrades the next iteration,
it does not break it. The script wipes its staging directory before every run, so a
failed run never leaks stale declarations into the next map.

One feature file, one commit, both gates green in it. The history then reads as the
list of business capabilities delivered, and any commit can be reverted without
breaking another feature. A file large enough that its commit is unreviewable is a
sign the `.feature` covers more than one capability — split the file at step 1, not
the commit here.
