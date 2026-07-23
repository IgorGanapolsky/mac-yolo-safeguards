# Poolside Model Factory → Hermes Harness

Checked: 2026-07-23
Decision: adopt experiment-discipline patterns; do not add a Poolside provider,
model, CLI, route, or budget.

## Executive Decision

Poolside is useful to Hermes as an operating-system reference, not as an
immediate inference dependency. The highest-return ideas are:

1. refuse experiment adoption without a holdout result;
2. require an explicit sample review rather than trusting an aggregate score;
3. bind every adoptable outcome to immutable code, configuration, and evidence
   hashes; and
4. preserve the exact failing source and root network cause when bounded
   research ingestion fails.

Hermes already had evaluator, reward-hack, variance, token-efficiency, retained
context, and private-ledger gates. Duplicating Poolside's agent, sandbox, or
model route would add operational surface without closing the measured gaps.

## Research Receipt

| Claim | Evidence | Checked |
| --- | --- | --- |
| Poolside presents controlled execution through approval prompts, tool permissions, and sandboxes, including self-managed environments. | [Official Poolside overview](https://docs.poolside.ai/get-started/overview) | 2026-07-23 |
| Poolside's Model Factory emphasizes reliable baselines, automated tests, and tracing outcomes back to prior decisions. | [Introducing the Model Factory](https://poolside.ai/blog/introducing-the-model-factory) | 2026-07-23 |
| Poolside describes exact image/config versions and a reproducible experiment logbook as core post-training infrastructure. | [Post-training in the Model Factory](https://poolside.ai/blog/post-training-in-the-model-factory) | 2026-07-23 |
| A sudden benchmark gain can be reward hacking rather than capability improvement; Poolside reports future-history mining, locating reference solutions, and web scraping as observed shortcuts. | [Through the looking glass of benchmark hacking](https://poolside.ai/blog/through-the-looking-glass) | 2026-07-23 |
| Poolside's stated mitigations include anti-cheating steering, reward-hack judges, continuous sample review, network/sandbox logging, and trajectory inspection. | [Through the looking glass of benchmark hacking](https://poolside.ai/blog/through-the-looking-glass) | 2026-07-23 |
| Poolside's local sandbox supports workspace access and network egress controls. | [Official sandbox documentation](https://docs.poolside.ai/sandboxes) | 2026-07-23 |
| Poolside tool calls require approval unless an allow rule matches; unsafe auto-allow is reserved for trusted sandboxes. | [Official tool-permission documentation](https://docs.poolside.ai/tool-permissions) | 2026-07-23 |
| The supplied YouTube Music URL resolves to the Latent Space interview “Poolside’s Model Factory, Laguna S, Open Models, and the Race to AGI — Eiso Kant, Poolside AI,” published 2026-07-22. | [YouTube video](https://www.youtube.com/watch?v=9_0hs2sxHHo) and public oEmbed metadata | 2026-07-23 |

The interview is corroborative context, not the technical source of record. Its
useful themes—large experiment volume, immutable data, versioned code,
reproducibility, verification, backtracking, and the distinction between model
quality and harness quality—are implemented only where Poolside's own
documentation and the existing Hermes code support them.

## Gap Analysis

| Control | Before | Decision |
| --- | --- | --- |
| Runnable evaluator | Present | Keep |
| Reward-hack status | Present | Keep |
| Variance status | Present | Keep |
| Before/after metric | Present | Keep |
| Token-efficiency scoring | Present | Keep |
| Private outcome ledger | Present | Keep |
| Holdout status required for adoption | Missing | Add |
| Continuous/manual sample-review status required for adoption | Missing | Add |
| Code revision + experiment configuration + evidence artifact digests | Missing | Add |
| Source-aware network failure diagnostics | Generic `fetch failed` | Add without retrying |
| Poolside model/provider integration | No measured need | Defer |
| Automated training or self-modification | Outside bounded harness | Reject |

## Implemented Contract

`tools/recursive-experiment-loop.js record` now requires all of the following
before returning `adopt`:

- evaluator status `pass`;
- reward-hack status `pass`;
- variance status `pass`;
- holdout status `pass`;
- sample-review status `pass`;
- metric improvement beyond `--min-delta`; and
- a complete provenance manifest containing the current git revision, a stable
  experiment-configuration digest, a clean-worktree assertion, and at least one
  hashed evidence artifact.

Missing proof returns `retry`. An explicit failed gate or non-improving metric
returns `reject`. The v2 record includes a stable manifest digest; modifying an
evidence artifact changes that digest.

`tools/hermes-academic-research-ingest.js` still performs at most the existing
two metadata requests, with the existing host allowlist, timeout, and response
size ceiling. It now reports the failing hostname, error class/message, and
available root cause code/message. It does not retry, download a model, execute
remote code, change a route, or make a paid request.

## Deliberately Not Adopted

- No Poolside model or OpenRouter route.
- No Poolside CLI or duplicate agent runtime.
- No new sandbox dependency; Hermes already has worktree, permission, and
  execution-fence controls.
- No autonomous experiment-to-production promotion.
- No automated training job.
- No extra polling or research requests.
- No change to the zero-dollar metadata-only academic ingestion policy.

These remain eligible only after a measured workload, a bounded comparison
against the existing route, and an explicit cost envelope demonstrate a gain.

## Verification Contract

```bash
node --check tools/recursive-experiment-loop.js
node --check tools/hermes-academic-research-ingest.js
node tests/test-recursive-experiment-loop.js
node tests/test-hermes-academic-research-ingest.js
git diff --check
```

The focused tests must prove:

- complete proof can adopt;
- missing provenance retries;
- failed evidence gates reject;
- two evidence contents produce different artifact and manifest hashes; and
- a simulated network failure names `huggingface.co`, `ECONNRESET`, and performs
  exactly one fetch attempt.

## Cost and Risk

Incremental provider cost: **$0**.
New default route: **none**.
New model download or execution: **none**.
Production mutation from research output: **none**.
