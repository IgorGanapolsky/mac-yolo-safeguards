---
name: cloudflare-monetization-gateway
description: >
  Cloudflare Monetization Gateway / x402 waitlist adapter. Emits HTTP 402
  PAYMENT-REQUIRED JSON. Never claims LIVE USDC settlement. Prefix receipts
  are not proof. Trigger: x402, Monetization Gateway, Pay Per Crawl, 402
  Payment Required. Slash: /cloudflare-monetization-gateway.
---

# Cloudflare Monetization Gateway (waitlist)

Source: https://blog.cloudflare.com/monetization-gateway/

Steal the **mechanic** (402 + payment-in-the-request). The product is **WAITLIST**. Pay Per Crawl is private beta. Cash today is Stripe $10 hosted Hermes.

```bash
node tools/cloudflare-monetization-gateway.js --health --json
node tools/cloudflare-monetization-gateway.js --url "https://thumbgate.app/docs" --user-agent "GPTBot/1.2" --json
node tests/test-cloudflare-monetization-gateway.js
```

HMAC simulate only with `X402_HMAC_SECRET` and `--simulate` / `X402_ALLOW_SIMULATE=1`. Settlement kind is `simulated`. `capturedRevenueUsd` stays 0.

| NEVER | ALWAYS |
|-------|--------|
| Accept `x402_…` as payment | HMAC over challenge id |
| Claim merchant-of-record / live USDC | `status: WAITLIST` `liveClaim: false` |
| Put x402/USDC in dashboard or landing | Keep it in this CLI + skill (hosted-source-of-truth) |
| Execute x402 spend from the economic router | Existing approval gate in `hermes-economic-router.js` |
| Buyer outreach / new SKU (ECI) | Waitlist URL only |

Waitlist: https://blog.cloudflare.com/monetization-gateway/  
Pay Per Crawl signup: https://www.cloudflare.com/paypercrawl-signup/
