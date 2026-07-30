# Hermes growth observability

Last verified: 2026-07-30

Hermes growth is a chain of independent proof surfaces. A healthy link at one
stage does not prove the next stage:

```
published post receipt
  -> attributed landing/store redirect
  -> provider store-page view
  -> download
  -> first open/pair/chat
  -> paid proceeds
```

## First-party campaign loop

All reusable campaign CTAs use `https://thumbgate.app/go/android` or
`https://thumbgate.app/go/ios` with sanitized `utm_source`, `utm_medium`,
`utm_campaign`, and `cta_id` tokens.

The `/go/*` handlers write `play_store_click` or `app_store_click` directly to
Cloudflare D1 before redirecting. This covers direct social/email store links
even when no landing-page JavaScript runs. Each write increments:

- `funnel_counters`: content-free aggregate by day and event.
- `funnel_attribution_counters`: campaign dimensions by day and event.

Android also forwards the same tokens in Google Play's `referrer` parameter.
When a visitor lands on the control plane with campaign parameters and then
uses a bare store badge, the redirect recovers those dimensions only from a
same-origin `Referer`; cross-origin values are ignored. Store-click events are
recorded by the redirect route and excluded from the browser beacon to prevent
double counting. Recognized link-preview crawlers and explicit prefetch
requests are recorded separately as `play_store_preview` or
`app_store_preview`, so they do not inflate human click counters.
The campaign scoreboard also keeps direct-store and landing-page journeys in
separate comparison cohorts. It never substitutes a synthetic 100% click rate
for a direct-store link or crowns a winner across unlike funnels.
The current release does not yet read the Install Referrer inside the mobile
binary, so this change proves the source of a store click but not the campaign
that caused a completed install. That mobile consumer belongs with the claimed
mobile analytics/package work and must be integrated without colliding with it.

## Provider reporting

App Store Connect analytics requests are provider resources, separate from
first-party counters. Provision/read them idempotently:

```bash
node tools/app-store-analytics-reports.js --ensure --json
```

The command reports the opaque request ID and generated report definitions. A
new ongoing request may take until the provider's next report cycle to populate;
an empty inventory is not zero downloads.

Google Play listing experiments and Apple Product Page Optimization are
configured in their provider consoles. No supported API used by this repository
can create or verify an active experiment for the paid apps. Until a
provider-visible experiment ID and active-state receipt are captured under
`hermes-mobile/docs/proofs/store-experiments/`, the experiment surface is
`unverified`, not passing. The combined audit passes only when it has
independent active proof for both the paid Google Play package and the App
Store app; one provider's receipt cannot mask the other provider's gap.

## Audit

Local artifact and receipt audit:

```bash
node tools/hermes-growth-audit.js --json
```

Public store plus production D1 readback after a Cloudflare build:

```bash
node tools/hermes-growth-audit.js --live --json
```

Add `--strict` in CI/operations when every proof surface must pass. Strict mode
fails on dead reusable links, stale offer language, unavailable provider
readback, incomplete or platform-inconsistent campaign links, unattributed
direct-store links, or missing active paid-app experiment proof.

The audit deliberately excludes
`hermes-mobile/docs/social/ready-to-post/PUBLISHED.md`: it is a historical
receipt and may contain URLs that were correct when a post was published. It
does recursively inspect the reusable README, every other `ready-to-post`
Markdown file, and every reusable `week-*` campaign draft directory.

## Simulator and remote-network proof

The iPad simulator does not need the Tailscale iOS app to test screen flow,
pairing contracts, navigation, or failure recovery. It uses the Mac host's
network stack and deterministic fake-gateway/integration harnesses.

That is not proof that a brand-new physical iPad can reach a Mac over Tailscale.
Physical-device remote reachability remains a separate release gate: release
binary, real device, no `adb reverse` or developer backdoor, realistic remote
network, then a provider-visible pair and first chat.
