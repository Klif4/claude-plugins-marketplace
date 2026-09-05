# Agent injection templates

Fill the placeholders and pass the result as the subagent prompt. Each launch is a
new call to the subagent-launching tool (`Agent`, named `Task` in some versions),
with the matching `subagent_type` — never a message to an agent that already ran.

| Role | `subagent_type` |
|---|---|
| Gherkin | `software-craftsmanship:bdd-writer` |
| Tests | `software-craftsmanship:test-writer` |
| Implementation | `software-craftsmanship:implementer` |

Drop the `software-craftsmanship:` prefix if the runtime does not namespace plugin
agents. The craft conventions are **not** restated in these templates: they live in
the agent definitions, and a second copy in the prompt would drift from the first.

## bdd-writer

```
Write the Gherkin scenarios for this business need.

BUSINESS NEED
<verbatim need, as the user stated it>

EXISTING FEATURE FILES
<list of paths — read them and reuse their exact wording>

TARGET FILE
features/<domain>.feature

Everything in English. Real values, no placeholders. Business intent only: no UI,
no database, no HTTP. Cover the nominal case, the exact boundaries of every
threshold, and the business refusals.

Return the numbered list of scenarios with their exact titles, in file order.
```

## test-writer

```
Write the executable tests for this single scenario. Tests only — never src/.

SCENARIO (verbatim)
<Feature block>
<Background block, if any>
<the scenario block, all steps, plus its Examples table if it is an outline>

FEATURE FILE
<path>

EXISTING CODE — read what you need
Ports:          <paths under src/domain/>
Value objects:  <paths under src/domain/>
Use cases:      <paths under src/application/>
Existing tests: <paths under tests/ and features/steps/>

ORDER
1. Step definitions in features/steps/, driving the use case through its primary
   port with in-memory adapters from features/steps/support/fakes/.
2. Then the Vitest unit tests in tests/ that those steps make necessary.

features/steps/ must not import anything from tests/. Each suite owns its fakes;
duplication between the two is intended.

It is expected that this does not compile — the types do not exist yet. Never use
any, as unknown as, @ts-ignore or @ts-expect-error to work around that.

Run yarn test and yarn test:acceptance and confirm the failure is real.

Return the exact paths written and the API the implementation will have to provide.
```

## implementer

```
Make this test suite green. Production code only — never touch a test.

SCENARIO TITLE
<exact title>

TEST FILES THAT SPECIFY IT
<paths from `git diff --cached --name-only -- tests features`>

Read those files: they are the specification and they are authoritative. You did
not receive their author's reasoning, and you do not need it.

CONSTRAINTS
- Write only under src/. Never modify, delete, skip or weaken a test.
- Hexagonal layering, dependency rule inward.
- Total immutability; every iterable through `immutable` (List/Map/Set/Record).
- No throw: `Result` / `ResultAsync` from neverthrow, named domain errors.
- No primitive obsession: value objects with a validating static factory.
- Tell, don't ask. No getter that exists only to let a caller decide.
- Declarative chaining, no imperative loop, no `let`.
- src/domain/** must reach 100% coverage. An uncovered branch is code nobody asked
  for: delete it. If it is legitimate behaviour with no test, report it — do not
  add a test.

VERIFY
yarn test && yarn test:acceptance && yarn coverage && yarn typecheck

Return the files written, the command output, and any test you believe is wrong —
without having modified it.
```

## Never inject

Into the **implementer**, never inject:
- the test-writer's report, its designed-API summary or its rationale;
- an explanation of what the tests "mean" or what they are "trying to" specify;
- the Gherkin scenario body — the title is enough to name the commit.

The implementer must read the tests. Handing it an interpretation of the tests lets
it code to that interpretation, and the gap between the interpretation and the
assertions is where bugs settle.

Into the **test-writer**, never inject:
- existing implementation source that already solves the scenario;
- a suggested API shape from this session.

The test-writer designs the API from the scenario. Showing it an implementation
first turns outside-in design into after-the-fact test writing.
