# Hermes Mobile Reliability Traceability

Hermes now has one machine-readable ledger for the nine July 2026 incidents
reported from the real Android app:

`evals/incidents/hermes-mobile-july-2026.json`

The ledger deliberately separates five proof surfaces that had repeatedly been
collapsed into one another:

1. local unit/integration coverage;
2. emulator or simulator E2E;
3. physical-device evidence;
4. store publication; and
5. store search visibility.

A green result on one surface cannot satisfy another. In particular, a queued
or skipped CI job is not a pass, a published Play listing is not proof of search
rank, and an open PR is not proof that the installed app contains the fix.

## Commands

```bash
# Structural audit. This is the existing root CI behavior.
node tools/hermes-reliability-traceability.js --mode audit

# Product release readiness. Fails while a runtime incident lacks all required proof.
node tools/hermes-reliability-traceability.js --mode release

# Claim readiness. Also fails for externally unverified store-search claims.
node tools/hermes-reliability-traceability.js --mode claim
```

The existing root `Node tool unit tests` job discovers
`tests/test-hermes-reliability-traceability.js`; no additional workflow or paid
runner is required. The test mutation-controls these false-green paths:

- removing a reported incident;
- treating `queued` or `skipped` as evidence;
- substituting store publication for store-search proof;
- citing a local proof file that does not exist;
- relabeling an unresolved PR as verified; and
- storing raw prompt, attachment, credential, host, or IP data in the ledger.

Audit mode is green when the ledger is honest and structurally complete.
Release and claim modes intentionally remain red until their corresponding
proof surfaces are current. This distinction lets ordinary CI validate the
control without laundering unresolved product gaps into a pass.

## Updating an incident

Change an incident to `verified` only after all `requiredEvidence` kinds have a
`pass` entry. Use a `repo:` source for merged local proof and an exact GitHub PR
URL plus 40-character head revision for branch proof. Physical-device evidence
must be independent of emulator/simulator E2E. Store-search evidence must be a
fresh signed-out search observation; the public package page is publication
evidence only.

The registry contains no user message bodies, attachment names/bytes, pairing
codes, API keys, hostnames, gateway URLs, or raw IP addresses. The validator
fails closed if those fields or secret-shaped strings are introduced.
