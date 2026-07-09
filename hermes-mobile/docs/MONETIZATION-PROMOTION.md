# Hermes Mobile Monetization + Promotion Playbook (2026-07-09)

Goal: maximize paid conversions with honest positioning: better control than Replit Agent mobile for operator workflows, and a cheaper starting subscription.

## Revenue truth snapshot (do not over-claim)

- Play listing: public (Teen) according to `docs/REAL-USER-READINESS.md`.
- Play IAP: `thumbgate_leash_monthly` active at **$19.99/mo** per readiness evidence.
- iOS/App Store: still in review / not searchable (not publicly launched yet).
- Continuous local proof latest file: `docs/proofs/continuous/latest.json` shows `unit=pass`, `e2e=skipped` when no USB Android device is connected.
- Existing web Stripe links (outside app-store IAP path) are documented in `business_os/revenue/stripe-offer-map-2026-07-07.tsv`.

## Positioning narrative (headline + proof points)

Primary headline:

> **Put your AI coding workflow on a leash from your phone - on your own machine, at a lower entry price than Replit Core.**

Proof points to repeat:

1. **Your machine first:** Hermes controls your own gateway profiles, not a cloud IDE runtime.
2. **Lower entry paid tier:** Hermes Pro at $19.99/mo vs Replit Core $25/mo monthly listed.
3. **No Replit-style credit burn:** Hermes does not meter every planning/build turn via a credit checkpoint economy.
4. **Tailscale-friendly:** cellular/off-Wi-Fi pathways are productized in current UX and docs.
5. **Leash value:** approve/deny and feedback controls are monetized via `thumbgate_leash_monthly`.

## Pricing narrative and packaging

## Current package (live)

- Free: core chat and connection path (as implemented today).
- Pro (`thumbgate_leash_monthly`): $19.99/mo via Play/App Store billing integrations in code.

## Recommended near-term package improvement

- Add a free allowance for Leash actions (example: limited approvals per week) to improve paywall conversion.
- Keep $19.99 Pro anchor; avoid racing to lowest-price commodity positioning.

## Replit comparison talking points (honest)

- Replit mobile is strong for cloud app-building workflows.
- Replit Agent billing is usage-based and effort-priced; all Agent interactions can be billable.
- Hermes value is different: personal gateway control + supervised execution UX from phone.

Use "different job, lower paid entry, own-runtime control" framing rather than "Replit replacement" framing.

## Channel execution plan (next 14 days)

## 1) Store conversion surfaces (highest leverage)

- Update Play long description and screenshot captions to lead with:
  - "Control your own AI coding gateway from phone"
  - "Approve risky actions before they run"
  - "$19.99/mo Pro for Leash controls"
- Keep iOS copy staged in parallel, but do not claim "available now" until ASC publish status changes.

## 2) Social launch channels

- Reddit:
  - `r/cursor`, `r/ClaudeAI`, and one broader builder subreddit.
  - Problem-first post: runaway agents, token burn, and mobile intervention.
  - Link to store listing + short demo clip.
- Hacker News:
  - Use operational pain narrative + technical proof.
  - CTA: "install Hermes Mobile, start free, upgrade to Leash Pro."
- X/Twitter:
  - 4-post thread: pain -> demo -> architecture ("your own gateway") -> CTA.
  - Pin thread during launch week.

## 3) Product Hunt draft (prepare now, launch after iOS visibility)

- Tagline draft: "Hermes Mobile: control AI coding runs on your own machine from your phone."
- Keep launch scheduled only after:
  - iOS listing is publicly searchable
  - at least one clean end-to-end purchase verification pass is documented

## Upgrade CTA placements and copy

Recommended copy snippets (use as-is in docs/creative unless product copy owners request edits):

- In Pro card:
  - "Hermes Chat is free. Upgrade to Leash Pro ($19.99/mo) to approve risky actions and capture operator feedback."
- After successful free usage milestone:
  - "You are actively supervising runs. Unlock Leash Pro to keep approvals and memory controls always on."
- In disconnected/recovery contexts:
  - "When your run resumes, Leash Pro helps you gate risky actions before they execute."

## Instrumentation and KPI scorecard

Track these weekly from existing analytics hooks:

- `leash_paywall_view`
- `upgrade_tap_thumbgate_learn_more`
- `leash_purchase_result`
- Play listing conversion rate
- Day-7 retained supervisors (users who return to supervise runs)

Decision gates:

- If paywall view -> purchase < 2%: ship a free Leash allowance experiment.
- If launch channel traffic is high but purchase is low: tighten value copy near first approval attempt.
- If purchase is strong on Android but weak overall: prioritize iOS review unblock and launch parity.

## Top 3 actions to prioritize now

1. **Exploit the current window:** push the Replit-comparison story in store copy + launch posts this week while Android + Play IAP are already live.
2. **Increase conversion headroom:** ship a bounded free Leash allowance so users experience value before hard paywall.
3. **Unblock iOS monetization parity:** drive ASC metadata/subscription/review tasks to public listing so promotion does not waste half the market.

## Blockers and dependencies

- iOS listing still blocked by App Store review state.
- Composer/ship-guard known CI lane instability (tracked in `plan.md` active tasks) can affect confidence in promotion timing.
- External community posting and account-level steps still require founder identity channels.

## Source links (for marketing/legal review)

- Replit pricing: <https://replit.com/pricing>
- Replit mobile docs: <https://docs.replit.com/references/platforms/mobile-app>
- Replit AI billing docs: <https://docs.replit.com/billing/ai-billing>
- Replit mobile product page: <https://replit.com/products/mobile>

