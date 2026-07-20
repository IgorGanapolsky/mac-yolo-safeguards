# Hermes Control subscription business

## Product contract

Hermes Control is the web and cloud continuity layer for the existing Hermes Mobile
product. Hermes Mobile remains the phone control surface. The web product adds:

- Google and Apple sign-in through WorkOS AuthKit;
- Stripe subscription enforcement;
- signed one-time pairing with no copied gateway key;
- real Hermes session inventory from the same local gateway used by Hermes Mobile;
- browser continuation of an existing session;
- opt-in cloud continuity using a bounded recent-message snapshot;
- fenced task leases, audit events, and idempotent task creation.

## Data boundary

The connector keeps the Hermes gateway credential and P-256 private key on the Mac.
It sends session IDs, titles, model/source labels, message counts, previews, and bounded
recent text needed for cloud continuity. It never sends local filesystem paths, gateway
credentials, device private keys, browser sessions, or whole-vault content.

When the Mac is online, an existing session continues through the Hermes session API,
preserving its native context and tool access. When offline failover is enabled, the
Fly runner uses the latest bounded snapshot plus web/cloud turns. Mac-only tools are
not represented as available in the cloud.

## Production proof gate

Do not call the business launched until all of these have source evidence:

1. WorkOS Google and Apple sign-in complete on the public URL.
2. Stripe creates a real subscription Checkout session and a signed webhook changes the workspace plan.
3. A real paired Mac publishes at least one existing Hermes Mobile session.
4. The public dashboard renders that session and continues it locally.
5. With the Mac connector stopped and `auto` selected, the real Fly runner completes a contextual task and `/health` shows a non-zero `lastTaskAt`.
6. The connector returns and later work includes the cloud handoff without duplicate execution.
7. Sites/D1 survives reload and deployment; required CI and live smoke checks pass.

## Commercial boundary

The launch price shown publicly is $29/month with a 14-day trial. Provider inference is
metered internally; unlimited cloud tokens are not promised. The subscription sells
remote continuity and control, not a generic transcript mirror or a claim that a cloud
runner can reproduce Mac-only tools.
