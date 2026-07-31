# ThumbGate paid companion positioning — July 2026

## Decision

Hermes Mobile is the paid native remote-control app. ThumbGate.app is an
additive web control and paid Continuity service. In-app promotion must sell
that extension; it must not imply that ThumbGate repairs a failed mobile app.

Canonical mobile offer:

- Headline: `Upgrade Hermes with ThumbGate`
- Body: `Add a web dashboard and paid Continuity to Hermes Mobile. Manage chats and Leash controls from any browser, and keep eligible work moving when your Mac is offline.`
- CTA: `See ThumbGate plans`
- Destination: the ThumbGate pricing section with mobile attribution.

## Verified live product facts

Read back on 2026-07-26:

- `https://thumbgate.app/` describes Web Control, signed machine pairing,
  synced chats, Leash controls, and optional paid Continuity.
- `https://thumbgate.app/api/billing/plan` returned an active recurring USD
  price of 1000 cents per month.
- `https://thumbgate.app/api/health` reported the database, WorkOS
  authentication, Stripe checkout/webhook, and cloud runner ready.
- The landing page describes Continuity as eligible work moving to a fenced
  VPS runner when the Mac is offline. It does not describe ThumbGate as a fix
  for a mobile connection failure.

The mobile card intentionally avoids embedding a dollar amount. The pricing
endpoint is provider-backed and can change independently of an app release.

## Research record

Parallel deep-research run:
`trun_92146f9025784f2490a55d3304e13c02`.

The run supported additive Continuity positioning but contained stale findings:
it missed the paid Hermes Mobile listings and did not observe the live
provider-backed price. Provider and public endpoint readbacks therefore
override those portions of the generated report.

## Claims prohibited in mobile promotion

- ThumbGate fixes a broken or unreachable Hermes Mobile connection.
- ThumbGate replaces Hermes Mobile.
- A hard-coded subscription price.
- Cloud work continues without eligibility, entitlement, or policy limits.
- Compliance, customer, or reliability claims not shown by provider evidence.

## Regression contract

`thumbgateContinuityUpsellContract.test.ts` requires every placement to:

- name ThumbGate as an addition to Hermes Mobile;
- explicitly identify paid Continuity;
- link to the pricing section with campaign attribution;
- avoid the rejected failure/replacement framing.
