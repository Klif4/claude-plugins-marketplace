# Writing Gherkin that reveals intent

## Shape

```gherkin
Feature: Order checkout
  In order to protect margin on small orders
  As a shop owner
  I want a minimum order amount enforced at checkout

  Background:
    Given the minimum order amount is EUR 25.00

  Rule: Orders below the minimum amount are refused

    Scenario: An order just below the minimum is refused
      Given Camille Fournier has a basket worth EUR 24.99
      When she checks out
      Then checkout is refused because the order is below the minimum amount
      And no payment is taken

    Scenario: An order exactly at the minimum is accepted
      Given Camille Fournier has a basket worth EUR 25.00
      When she checks out
      Then the order is placed
```

One `When` per scenario. Two `When` steps means two scenarios.

## Real values

The values are what make the rule readable. Pick them so the reader understands
*why* the outcome is what it is.

| Instead of | Write |
|---|---|
| `Given a user` | `Given Camille Fournier is a registered customer` |
| `Given a basket with items` | `Given her basket holds 3 items worth EUR 149.90` |
| `Given a valid date` | `Given the delivery is due on 12 March 2026` |
| `Given an order` | `Given order CMD-2026-0412 was shipped on 3 March 2026` |

`foo`, `bar`, `test`, `user1`, `123` and `some value` never appear.

For a threshold, always write three scenarios: just below, exactly on, just above.
`EUR 24.99` / `EUR 25.00` / `EUR 25.01` states the rule more precisely than any
prose.

## Declarative, not imperative

Imperative scenarios describe the operation. They break when the UI changes and
they say nothing about the rule.

```gherkin
# Leaks technology — refuse
Scenario: Checkout
  Given I am on the /checkout page
  When I click the "Pay" button
  Then the API returns 422
  And the orders table has no new row
```

```gherkin
# Business intent — keep
Scenario: An order below the minimum is refused
  Given Camille Fournier has a basket worth EUR 24.99
  When she checks out
  Then checkout is refused because the order is below the minimum amount
```

Banned vocabulary: `I click`, `I fill in`, `the page shows`, `the button`,
`in the database`, `the API returns`, table names, class names, HTTP statuses,
JSON payloads, `null`, `undefined`.

**Validity test**: the scenario must stay true if the front end, the database and
the transport are all replaced. If it does not, it belongs to a different kind of
test.

## Scenario Outline

Use it as soon as one rule varies across values, and only while the table stays
readable without the surrounding prose.

```gherkin
Scenario Outline: Shipping cost depends on the order amount
  Given Camille Fournier has a basket worth <basket>
  When she checks out
  Then the shipping cost is <shipping>

  Examples:
    | basket     | shipping  |
    | EUR 24.99  | EUR 4.90  |
    | EUR 25.00  | EUR 4.90  |
    | EUR 59.99  | EUR 4.90  |
    | EUR 60.00  | EUR 0.00  |
```

Each row is a real case, and the boundary rows are present. A table of three rows
that all exercise the same branch is worth less than one plain scenario.

## Reusable steps

Prefer a parameterised phrase over a one-off sentence: `Given {customer} has a
basket worth {amount}` is reusable across the whole feature; `Given Camille has a
cheap basket` is not.

One notion, one phrase. Before adding a step, grep the existing features for the
concept and reuse the wording exactly — two phrasings for the same idea double the
step definitions and split the ubiquitous language.

## What belongs in a scenario, and what does not

| Belongs | Does not |
|---|---|
| A business rule with an observable outcome | A technical precondition (a migration ran, a cache is warm) |
| A refusal the business defines | An infrastructure failure (the database is down) |
| A threshold, a deadline, an eligibility | A field-by-field validation of an input form |
| A state transition that matters to the business | A rendering or formatting detail |

Input validation belongs in unit tests on the value objects. Infrastructure
failures belong in adapter tests. A `.feature` file that grows a scenario per
validation rule has stopped being business documentation.
