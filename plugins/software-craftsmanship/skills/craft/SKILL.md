---
name: craft
description: This skill should be used when the user asks to "craft this feature", "use the craft loop", "build this feature with BDD", "drive this scenario outside-in", "outside-in TDD", "one scenario at a time", "implement this feature TDD", "write the Gherkin then the tests then the code", or names the bdd-writer / test-writer / implementer agents. It orchestrates one Gherkin scenario at a time through three context-isolated agents and gates every iteration on acceptance, unit tests and 100% domain coverage.
argument-hint: "[business need, or path to a .feature file]"
allowed-tools: Read, Grep, Glob, Bash, TodoWrite, AskUserQuestion, Task, Agent
---

# Craft loop — BDD to implementation, one scenario at a time

Orchestrate a feature through three agents that **never share context**. Take one
failing Gherkin scenario, hand it to a fresh `test-writer`, hand the resulting test
files to a fresh `implementer`, and gate the iteration on three checks before
moving to the next scenario.

Input: the business need the user described, or the path they gave — `$ARGUMENTS`
when this skill is invoked as a slash command.

The frontmatter withholds `Write` and `Edit` from this session on purpose: the rule
below is enforced, not requested.

## Absolute rules

**Never write test or production code in this session.** This session orchestrates.
It reads, runs commands, checks boundaries and reverts. Every line of Gherkin, test
and source code is written by a subagent.

**One subagent call per role, per iteration.** Launch each agent with the
subagent-launching tool (`Agent`, named `Task` in some versions), passing
`subagent_type`. A new call is a fresh context; continuing an existing agent — with
`SendMessage` or any other means — is what must never happen across roles. The
`test-writer` and the `implementer` never share context: the **only** channel
between them is the test files on disk.

| Role | `subagent_type` |
|---|---|
| Gherkin | `software-craftsmanship:bdd-writer` |
| Tests | `software-craftsmanship:test-writer` |
| Implementation | `software-craftsmanship:implementer` |

Drop the `software-craftsmanship:` prefix if the runtime does not namespace plugin
agents.

**Never forward an agent's report to another agent.** The test-writer's reasoning,
its designed-API summary and its rationale stay in this session. The implementer
receives file paths and nothing else — the tests are the specification, and an
implementer that has read the test author's intent will code to the intent instead
of to the tests.

## Preconditions

1. Confirm the toolchain: `vitest`, `@cucumber/cucumber`, `immutable`, `neverthrow`,
   `@js-joda/core` and `vitest-mock-extended` in `package.json`, plus the `test`,
   `test:acceptance`, `coverage` and `typecheck` scripts. If anything is missing, run the
   `craft-setup` skill first.
2. Require a git repository — the boundary control depends on it. Offer `git init`
   if absent.
3. Require a clean working tree (`git status --porcelain` empty). If dirty, ask the
   user to commit or stash before starting.

## Step 1 — Scenarios

If the input names an existing `.feature` file, use it as is.

Otherwise, launch a **fresh** `bdd-writer` agent with the business need and the
paths of existing `features/**/*.feature` files. It returns a numbered scenario list.

Show the user the produced file and the scenario list, and **wait for validation**
before entering the loop. Wrong scenarios cost far more downstream than the minute
spent reading them.

Commit the feature file on its own.

## Step 2 — Build the backlog

```bash
yarn test:acceptance 2>&1 | tail -40
grep -rnE '^[[:space:]]*(Scenario|Scenario Outline):' features --include='*.feature'
```

The backlog is the ordered list of scenarios that are **failing or undefined**.
Process them in file order: earlier scenarios usually establish the vocabulary and
the ports that later ones reuse.

Track the backlog with `TodoWrite`, one item per scenario.

## Step 3 — The loop

Repeat for each scenario in the backlog. Follow `references/loop.md` for the exact
commands of each phase, and `references/agent-prompts.md` for the injection
templates.

**3a. Extract the scenario.** Read the `.feature` file and copy the scenario block
verbatim — title, all steps, and its `Examples` table if it is a `Scenario Outline`.
Include the file's `Feature` and `Background` blocks for context.

**3b. Fresh `test-writer`.** Inject: the scenario block, the feature file path, and
the paths of existing ports and value objects (paths only — the agent reads what it
needs). Do not restate the craft conventions: they already live in the agent
definition, and repeating them in the prompt only creates a second, drifting copy.
The agent writes step definitions first, then the unit tests.

**3c. Boundary check.** Only `tests/` and `features/steps/` may have changed —
everything else, including `.feature` files and every config, must be untouched.
Revert any violation, record it, and continue. Snapshot the test files into the git
index: that snapshot is what protects them during the next phase.

**3d. Confirm red.** Run the scenario and the unit suite; both must fail. A scenario
already green before implementation means the tests specify nothing: re-run a fresh
`test-writer` with that fact, once.

**3e. Fresh `implementer`.** Inject: the **paths** of the test files changed at 3b,
and the scenario title. Inject nothing from the test-writer's report.

**3f. Boundary check.** Only `src/` may have changed since the snapshot. A test
modified means the implementer bent the specification to fit the code; a config
modified means it lowered a gate. Revert any violation and record it.

**3g. The three gates.** All three must pass:

| # | Gate | Command |
|---|------|---------|
| 1 | The scenario is green | `yarn test:acceptance --name "<exact title>"` |
| 2 | The whole unit suite is green | `yarn test` |
| 3 | Domain coverage is 100% | `yarn coverage` |

Gate 2 covers the whole suite, not just the new tests: a scenario is not done if it
broke a previous one. Gate 3 is enforced by the thresholds in `vitest.config.ts`, so
its exit code is the verdict.

**3h. Recovery.** On failure, relaunch a **fresh** agent of the role concerned with
the failure output — never continue the previous one, and never fix the code
yourself. Three attempts maximum per scenario, then stop and report to the user.
`references/loop.md` maps each failure to its role.

**3i. Commit.** One commit per scenario, once the three gates are green:
`feat(<domain>): <scenario title>`. Mark the todo done, move to the next scenario.

## Step 4 — Closing

Run the full suite one last time (`yarn test`, `yarn test:acceptance`,
`yarn coverage`, `yarn typecheck`) and report:

- scenarios delivered, one commit each;
- scenarios left in the backlog and why;
- **every boundary violation recorded** — an agent that repeatedly writes outside
  its scope is a signal that its prompt or the task split needs revisiting;
- every open question raised by the agents (business questions from the
  `bdd-writer`, tests flagged as wrong by the `implementer`, uncovered branches).

Never silently drop an agent's open question: those are the decisions that belong
to the user.

## Additional resources

### Reference files

- **`references/loop.md`** — exact commands for each phase: boundary control,
  index snapshot, revert, the three gates, and failure-to-role mapping.
- **`references/agent-prompts.md`** — verbatim injection templates for the three
  agents, and what must never be injected.

### Related skills

- **`craft-setup`** — bootstraps the toolchain and the hexagonal layout.
- **`craft-conventions`** — the rulebook shared by the three agents.
- **`craft-review`** — craft review pass over existing code.
