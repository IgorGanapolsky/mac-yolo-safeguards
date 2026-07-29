# ThumbGate funnel stage health

**Command:** `node tools/funnel-stage-health.js`  
**Offline CI:** `node tools/funnel-stage-health.js --offline --json`  
**Unit tests:** `node tests/test-funnel-stage-health.js`

For **every** stage the tool (and this doc) answers:

1. **Why does it exist?**
2. **What can go wrong?**
3. **How do you measure whether it's working?**

Live probes attach evidence. **Critical** stage `fail` → exit 1.

---

## Stage map (cash path order)

| Stage | Severity | Why (one line) | Primary measure |
|-------|----------|----------------|-----------------|
| `product_landing` | critical | Free control + Continuity must convert without a sales call | Dual CTA + FAQ + billing plan |
| `billing_rails` | critical | No live Stripe → no cash | `/api/billing/plan` active; buy links 200 |
| `aeo_discovery` | important | AI search cites structured answers | FAQPage + `llms.txt` ThumbGate heading |
| `campaign_beat` | critical | Distribution is the bottleneck | LIVE posts ≤2d; publish-gate + verify |
| `channel_reliability` | important | Channels fail differently | Per-channel LIVE matrix |
| `outbound_domain` | critical | Domain From owns reputation | sendAs + zero 535 DSN |
| `design_partners` | critical | First Continuity $ path | ≤3 trials; hot replies; non-owner paid |
| `cold_pipeline` | secondary | Legacy $499 path | reply rate; ready queue empty OK |
| `attribution` | important | Know which beat works | UTM + content-free funnel events |
| `cash_recognition` | critical | No theater | non-owner receipt only; else $0 |
| `watch_only_channels` | secondary | Skool/Reddit freezes | no accidental promo LIVE |

---

## Related tools

| Need | Tool |
|------|------|
| Pre-Post gate | `tools/social-publish-gate.js` |
| Post LIVE proof | `tools/verify-public-post.js` |
| AEO weekly | `tools/thumbgate-aeo-monitor.js` |
| Stripe offers | `tools/payment-readiness.js` |
| Pipeline DS | `tools/pipeline-data-science.js` |
| Campaign scoreboard | `tools/social-campaign-ds.js` |
| Deploy lock | `scripts/deploy-cloudflare-with-lock.sh` |

---

## Operating rules (standing)

- **Cash** = non-owner Stripe only. Missing receipt → **$0**, not unknown.
- **Hero product** = https://thumbgate.app/ (not store-first).
- **Reddit** draft-only; **Hashnode** FROZEN; **no Zernio**.
- **Domain From** only for outreach (`igor@igorganapolsky.com`).
- **Never** hard-code Continuity $ in campaigns — re-read `/api/billing/plan`.
- **Superseded** content-log status must **block** re-post (gate).

---

## Deploy note (AEO)

Production deploy is **local wrangler + lock**, not GitHub Actions. After merging landing/llms changes:

```bash
export CLOUDFLARE_D1_DATABASE_ID=<uuid>
export CLOUDFLARE_CUSTOM_DOMAIN=thumbgate.app
# Prefer locked deploy; if D1 export R2 fetch fails, skip export but still
# validate + build + migrations + deploy under the same lock discipline.
bash scripts/deploy-cloudflare-with-lock.sh
```

Then re-run `node tools/funnel-stage-health.js` and expect `aeo_discovery` + `product_landing` **ok**.
