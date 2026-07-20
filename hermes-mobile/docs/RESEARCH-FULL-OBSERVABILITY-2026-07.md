# Hermes Mobile full observability and competitive patterns — July 2026

## Research provenance

- Full-observability deep research: `trun_54e9a858c3e24b75bcbf80b274b86fdd`
- Competitive-pattern deep research: `trun_d3be5e813aa949709214aff51c408765`
- Supplied evidence: `Gmail - What Cursor, Decagon, and Hedra have in common.pdf`
- Method: supplied-PDF inspection, primary product/docs sources, and a ranked
  evidence synthesis. Marketing claims are treated as vendor claims unless a
  primary technical source supports them.

## Competitive verdict

Together AI is not the main end-user competitor to Hermes Mobile. It sells the
inference infrastructure used by products such as Cursor, Decagon, and Hedra.
The useful comparison is the product behavior that this infrastructure enables:

| Company | Relationship to Hermes | Pattern worth adapting |
|---|---|---|
| Cursor | Adjacent agent/workflow competitor | Low time-to-first-feedback, streaming progress, resumable work |
| Decagon | Adjacent customer-service agent | End-to-end latency budget and observable handoffs |
| Hedra | Different product category | Dedicated capacity only when demand justifies the cost |
| Together AI | Potential infrastructure supplier | Provider routing, caching, throughput and cost telemetry |
| Kimi WebBridge/browser agents | Closer adjacent workflow competitor | Secure browser-to-local-agent continuity and explicit control boundaries |
| Apple continuity/intelligence | Platform-level substitute | Seamless device handoff and state continuity |

The correct action is to adapt public product patterns, not copy proprietary
code, private prompts, branding, or protected implementation details.

## Ranked high-ROI adaptations

### P0 — measurable reliability and attribution (implemented in this change)

1. Attach immutable app/package/EAS/release/runtime/OTA identity to every event.
2. Give every launch and event a correlation ID.
3. Treat non-2xx telemetry delivery as failure.
4. Persist delivery, missing-destination, overflow, exclusion, and replay depth.
5. Emit a deterministic production `app_open` canary.
6. Retain production crash evidence when no destination is configured.

This directly closes the observed failure mode where a generic PostHog project
showed exceptions without proving they came from Hermes Mobile.

### P1 — streaming and resumable operations (next claimed task, not bundled)

- Measure tap-to-accepted, time-to-first-status, time-to-first-output, and
  completion latency separately.
- Use monotonic sequence numbers and mutation IDs from `hermes-protocol` so an
  ambiguous acknowledgement can be retried without duplicating messages.
- Resume streams after foreground/background and transport changes.
- Show one compact phase/status surface; reserve interruptions for action or
  failure states.

### P1 — provider and cost control plane (next claimed task, not bundled)

- Normalize model/provider, input/output/cache tokens, request cost, retry,
  fallback reason, and provider request ID using OpenTelemetry GenAI semantic
  conventions where stable.
- Define latency, error, cost, and quality budgets for provider routing.
- Add request coalescing and semantic/prompt caching only with measured hit rate
  and correctness boundaries.

### P1 — revenue, reviews, and release reconciliation (provider work)

- Ingest Apple Finance Reports and Google Play Sales/Earnings as authoritative
  proceeds.
- Ingest store ratings/reviews and release state through provider APIs.
- Mark real-time purchase signals as estimates until reconciled.
- Require source, freshness, and last-success metadata on every dashboard tile.

### P2 — browser continuity

- Use the shared Hermes protocol for account-scoped phone/web state.
- Keep browser credentials server-side; use HttpOnly/SameSite sessions, CSRF
  and origin checks, scoped authorization, and expiring signed handoff tokens.
- Preserve the same thread and pending mutations across phone and web.

### Defer — dedicated inference

Dedicated endpoints can improve tail latency, but they create fixed cost and
operational overhead. Adopt only after measured concurrency, revenue, and SLO
breaches justify reserved capacity.

## Observability architecture

```text
Hermes Mobile / Web / Gateway
  -> versioned identity + correlation
  -> product events, errors, traces, model usage, business events
  -> durable edge queue and explicit loss counters
  -> PostHog / Sentry / OpenTelemetry collector
  -> source-specific dashboards with freshness
  -> Apple and Google financial/review reconciliation
```

No single analytics provider is financial truth. No provider row is attributable
to Hermes without the immutable identity contract. No missing signal is treated
as success merely because the app remained usable.

## Primary references

- [Together AI — Cursor customer story](https://www.together.ai/customers/cursor)
- [Together AI — real-time voice agents](https://www.together.ai/blog/build-real-time-voice-agents-on-together-ai)
- [Decagon — Dialogues voice launch](https://decagon.ai/blog/decagon-dialogues-2025-launch)
- [Together AI — Hedra customer story](https://www.together.ai/customers/hedra)
- [OpenTelemetry GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/gen-ai-spans.md)
- [Apple App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi)
- [Google Play Developer Reporting API](https://developers.google.com/play/developer/reporting)

## Decision

Ship the P0 identity/loss contract first. It is low-cost, directly testable, and
prevents false claims about errors or funnel health. Schedule streaming/resume,
provider-cost telemetry, and store reconciliation as separately owned work so
this reliability fix does not expand into unverified scaffolding.
