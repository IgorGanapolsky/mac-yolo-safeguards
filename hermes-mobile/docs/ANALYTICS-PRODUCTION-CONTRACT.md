# Hermes Mobile analytics and crash observability contract

**Last verified:** 2026-07-20
**Scope:** production mobile product analytics and crash delivery. Store proceeds,
reviews, subscription state, and provider-side dashboard configuration are
separate truth surfaces.

## Non-negotiable identity

Every PostHog product event, PostHog crash event, and Sentry event must identify
the exact Hermes artifact that emitted it. `src/services/telemetryIdentity.ts`
is the single source of truth for these immutable fields:

| Field | Meaning |
|---|---|
| `telemetry_schema_version` | Versioned event contract (`1.0.0`) |
| `app` | Literal `hermes-mobile` product namespace |
| `app_identifier` | Android application ID or iOS bundle ID |
| `eas_project_id` | Expo Application Services project identity |
| `platform` | Android or iOS runtime |
| `app_version` / `build_number` | Store-visible artifact identity |
| `release` | Sentry-compatible `hermes-mobile@<version>` release |
| `environment` | Development or production |
| `runtime_version` | Expo Updates compatibility boundary |
| `update_id` / `update_channel` / `update_origin` | Embedded binary versus exact OTA runtime |
| `telemetry_session_id` / `telemetry_event_id` | Per-launch and per-event correlation IDs |

An exception in a generic provider project is not Hermes evidence unless these
fields resolve to Hermes Mobile. Provider project names are routing metadata;
the event resource identity is the attribution contract.

## Delivery and loss accounting

Literal zero-loss telemetry is impossible on an intermittently connected
phone. The enforceable contract is that every expected signal is in exactly one
observable state: delivered, retained for replay, deliberately excluded, or
measurably lost.

Product analytics persists:

- `attempted`
- `delivered`
- `failed`
- `missing_destination`
- last attempt, success, and failure timestamps

Crash delivery persists:

- `captured`
- `delivered`
- `delivery_failed`
- `dropped_overflow`
- `excluded_nonproduction`
- `retained_without_destination`
- last attempt, success, and failure timestamps

Production crashes are retained when the PostHog destination is missing or
unreachable. The queue is bounded to 25 records; overflow is counted. Dogfood
events are explicitly counted as excluded before deletion.

Use this measurable coverage definition:

```text
product_delivery_coverage = delivered / max(1, attempted)
crash_accounting_coverage =
  (delivered + queued + excluded_nonproduction + dropped_overflow)
  / max(1, captured)
```

`dropped_overflow` is accounted loss, not success. An SLO or launch claim must
report it separately and must fail when it is non-zero.

## PostHog product funnel

| Item | Contract |
|---|---|
| Capture environment | Production EAS profile/channel only |
| Host | `EXPO_PUBLIC_POSTHOG_HOST`, default `https://us.i.posthog.com` |
| Destination | `EXPO_PUBLIC_POSTHOG_API_KEY` from EAS production environment |
| Exclusions | Development, preview/e2e, internal dogfood, developer leash unlock, and user opt-out |
| Canary | Every production launch emits `app_open` with `telemetry_canary=true` |
| Delivery | Non-2xx is failure; no fire-and-forget success assumption |
| Privacy | No chat or attachment content in product analytics |

Money-path funnel:

1. `app_open`
2. pairing/search/connect events
3. `leash_paywall_view`
4. `leash_purchase_start`
5. `leash_purchase_result`
6. `leash_restore_result`

Provider proof requires the canary and immutable identity in the intended
PostHog project. Local unit tests prove payload construction, not provider
configuration or ingestion.

## Sentry crash reporting

| Item | Contract |
|---|---|
| Destination | `EXPO_PUBLIC_SENTRY_DSN` from the production environment |
| Org/project | `SENTRY_ORG=max-smith-kdp-llc`, `SENTRY_PROJECT=hermes-mobile` |
| Release | Same `release`, `dist`, environment, and Hermes identity as product analytics |
| Context | `hermes_release` context plus indexed identity tags |
| Sampling | Errors/crashes captured; performance traces currently sampled at 20% |
| Source maps | Auto-upload is currently disabled by release safety; readable production stacks remain an explicit launch gap |

No-DSN operation remains non-fatal, but a production launch may not claim full
crash observability until a provider canary proves the configured project,
release, dist, and environment.

## Provider and business truth surfaces

Do not infer any of the following from app telemetry:

- Apple proceeds: App Store Connect Finance Reports
- Google proceeds: Play Console Sales and Earnings reports
- Store publication/review state: provider release APIs or consoles
- Ratings and reviews: App Store Connect and Google Play review APIs
- Subscription/entitlement state: StoreKit/Play Billing plus server validation

Every dashboard tile must state source, freshness, last successful ingestion,
and whether the number is final, estimated, or unavailable. Real-time revenue
is an estimate until reconciled with provider financial reports.

## Verification gates

```bash
npm test -- --runInBand
npm run test:ci
npm run typecheck
npm run test:release-safety
```

Before claiming production observability, additionally prove:

1. a production `app_open` canary is present in the correct PostHog project;
2. a synthetic Sentry error resolves to the exact release and dist;
3. crash replay after a simulated network failure delivers once;
4. delivery metrics show no unexplained delta;
5. provider revenue/review collectors report freshness and reconciliation.
