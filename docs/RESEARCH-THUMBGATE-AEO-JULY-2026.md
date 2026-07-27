# ThumbGate AEO and continuous-improvement decision — July 2026

## Source findings

[Search Engine Journal's July 21 article](https://www.searchenginejournal.com/ai-overviews-visibility-a-reliable-way-to-track-what-spot-checks-miss-webinar/582955/) is a short webinar promotion, not an empirical study. Its actionable recommendations are to use a defined prompt set, measure citations/share of voice/sentiment over time, and improve content, technical health, authority, and measurement. It also recommends headings, schema, and answer formatting that machines can extract.

[Differential AI's own site](https://differential-ai.com/labs/) organizes efficiency across training, evaluation, and inference. Its named training and inference methods are patent-pending, and its public pages make performance claims without exposing the underlying whitepapers or reproducible benchmark artifacts. ThumbGate therefore adopts the measurable loop—not proprietary or unverified performance claims.

## Implement now

1. Publish visible, direct answers to the three monitored buyer questions and mirror them in FAQPage JSON-LD.
2. Keep canonical, sitemap, robots, `llms.txt`, and ARD discovery machine-readable.
3. Run one weekly, three-prompt citation proxy and preserve a private baseline/history.
4. Detect citation loss and sentiment movement, but require a human-readable hypothesis plus deterministic tests before changing production.
5. Bound the monitor to $0.10/month locally; expected scheduled cost is $0.005/month.

## Continuous harness loop

`observe → baseline → candidate → offline/regression eval → canary → promote or revert → RAG lesson`

The system may continuously find opportunities, but it does not continuously retrain models, mutate production, or optimize on vanity metrics. Completed AcceptanceChecks, regressions, latency, cost, customer feedback, and captured revenue remain the promotion signals.

## Deferred

- Conductor or another enterprise AEO suite: incompatible with the strict $10/month ceiling.
- Google-result scraping presented as stable AI Overview telemetry: brittle and not honest evidence.
- Autonomous content generation/publishing from a visibility dip: too easy to amplify noisy observations.
- Model retraining inspired by unpublished patent-pending techniques: no reproducible evidence or Hermes-specific data gate.
