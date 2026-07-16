# Greptile OSS discount + CLI review (money + coverage)

**Source of this play:** Greptile email “Your Greptile OSS Maintainer discount”
(2026-07-15) — *Free for OSS / 100% off*, redeem window through **2027-07-15**.

## What is already true (evidence)

| Item | Status |
|------|--------|
| OSS Maintainer discount | **Redeemed** on org **Hermes Mobile** (`app.greptile.com/hermes-mobile`) — success UI was “Discount applied… now applied to Hermes Mobile”; revisit UI “already been redeemed.” |
| Free plan Code Review credits | Were **50/50 Limit reached** (period 15 Jul–15 Aug 2026) before Pro |
| **Pro plan (2026-07-16)** | **Active** after Upgrade Now — banner: “Subscription activated… Review limits have been removed.” Current invoice **Total $0** (OSS Maintainer 100% off applied) |
| CLI reviews | Unblocked on Pro (free plan had blocked CLI with “PR reviews only”) |
| Payment method on file | Visa ending **2394** (default) — charged $0 this cycle |
| T-Rex | Offered post-upgrade; leave **off** unless explicitly enabled (extra sandbox cost/noise) |

**Never** commit Greptile redeem tokens, full card numbers, or billing portal session cookies. Redeem links belong in Gmail only; agents close any Chrome tab whose URL contains `token=`.

## How to take advantage (Pro active at $0 + CLI)

### 1. CLI reviews (high ROI while free PR credits are exhausted)

With Pro active (OSS 100% off), both web PR reviews and the terminal CLI are unblocked. Free plan had exhausted PR credits and blocked CLI entirely.

```bash
# Doctor (signed-in? binary present?)
node tools/greptile-cli-review.js --doctor

# Review current branch vs main (agent-friendly text + 0600 receipt)
node tools/greptile-cli-review.js --base main

# JSON summary only
node tools/greptile-cli-review.js --base main --json
```

Receipts: `~/.hermes/receipts/greptile-cli/latest.json` (mode 0600, token-redacted).

Direct CLI (same backend):

```bash
greptile whoami
greptile review --branch main --agent --instructions "focus on secrets and safety"
```

### 2. Conserve remaining / future free PR credits

Root `.greptile/config.json`:

- `triggerOnUpdates: false` — review on open / `@greptileai review`, not every push  
- Scoped `ignorePatterns` (Hermes Mobile + agent harness; still ignores locks, screenshots, proofs)  
- Labels `greptile-skip` / `docs-only` skip noise  
- Do **not** enable dashboard **T-Rex** on free plan  

### 3. Unlimited PR + CLI reviews at $0 (done 2026-07-16)

OSS discount was already on the org. After human directive to take advantage of the
OSS Maintainer email/PDF, **Upgrade Now** activated Pro:

- UI: “Subscription activated. Your Pro plan is now active. Review limits have been removed.”
- Billing current invoice **Total $0** / Code Review seats **$0**
- Do **not** re-click upgrade; do **not** enable T-Rex without a separate ask
- Cancel path remains on Billing if ever needed

## Config in this repo

| Path | Role |
|------|------|
| `.greptile/config.json` | Strictness, ignore patterns, mobile + harness rules |
| `.greptile/rules.md` | Product bar |
| `.greptile/files.json` | Context files for Greptile |
| `hermes-mobile/.greptile/` | App cascade |
| `hermes-mobile/docs/GREPTILE-CODE-REVIEW.md` | Agent obligations on PR comments |
| `tools/greptile-cli-review.js` | CLI harness + receipts |

## Related money note

`grok-yolo` is **not** free — it pins cloud `grok-4.5`. Local Grok Build routes (`grok -m ollama-hermes-64k`) and Greptile **CLI** reviews are the cheap lanes. See [HERMES-GROK45-HARNESS.md](./HERMES-GROK45-HARNESS.md) and [HERMES-ZERO-SPEND.md](./HERMES-ZERO-SPEND.md).
