# AI Debt Register

Agent-generated production code and automations, tracked so they cannot become
unowned, untested, permanent debt. From the "AI tech debt" discipline: every
generated service gets an owner, a purpose, a model/session provenance, tests, a
risk note, and a review-by date. Prototypes are time-boxed - promote them to
supported systems with ownership, or delete them.

Enforced by `tests/test-ai-debt-register.js`: every row must have all fields,
the referenced artifact must exist in the repo, and review_by must be a valid
date. Rows past their review_by are reported (run the test) as debt due for
review - prune the integration, refresh it, or extend the date with a reason.

## Register

| id | artifact | owner | purpose | provenance | tests | risk | review_by |
|----|----------|-------|---------|------------|-------|------|-----------|
| ADR-001 | tools/outreach-critic.js | claude-code | Deterministic actor-critic gate on outreach drafts (no dishonest claims/missing opt-out reach the send queue) | Netflix oci-agent steal, PR #1925 | tests/test-outreach-critic.js | low - pure function, no network, no writes | 2026-11-18 |

## How to add a row

When you ship agent-generated production code (a new tool/, scripts/, service,
or automation), append a row with all eight fields once it is MERGED to main
(the test asserts the artifact exists, so register only landed code). If it is a
throwaway prototype, do not add it here - delete the prototype instead.
