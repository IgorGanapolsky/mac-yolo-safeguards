# Stripe Setup Plan - 2026-06-02

Private working file. Do not commit Stripe object IDs, payment links, or buyer/payment state.

- Stripe offer map: stripe-offer-map-2026-06-02.tsv
- Offers in map: 3
- Offers still missing valid price/link readiness: 3
- Read-only Stripe candidates: stripe-readonly-candidates-2026-06-02.tsv

## Link Creation Priority

| Rank | Offer | Open rows blocked by missing link | Gross unlocked by link | Net after reserve if all close | Link ready |
|---:|---|---:|---:|---:|---|
| 1 | Partner Pilot | 67 | $201000.00 | $126848.09 | no |
| 2 | AI Agent Hardening Sprint | 11 | $16500.00 | $10411.83 | no |

## Live Dashboard Objects To Create Or Verify

| Offer | Product name | One-time amount | Current status | Product ready | Price ready | Link ready |
|---|---|---:|---|---|---|---|
| Agent Reliability Diagnostic | Mac YOLO Safeguards Diagnostic | $499.00 | missing | no | no | no |
| AI Agent Hardening Sprint | Mac YOLO Safeguards Hardening Sprint | $1500.00 | missing | no | no | no |
| Partner Pilot | Mac YOLO Safeguards Partner Pilot | $3000.00 | missing | no | no | no |

## Dashboard Steps

1. Open Stripe Dashboard in live mode.
2. For each offer below, create or select the listed product.
3. Create or select a one-time USD price for the exact amount.
4. Create or select a Stripe Payment Link for that exact one-time price.
5. Open the checkout page and confirm business identity, support contact, terms/refund links, and exact amount.
6. Run the update command for that offer with the live `prod_...`, `price_...`, and `https://buy.stripe.com/...` values.
7. If all links are created at once, paste them into the batch-import TSV shown below and run the import command.
8. Run `node tools/revenue-command-center.js --date 2026-06-02 --limit 10` and confirm the ready gross moved from `$0.00`.

## Update Commands

### Agent Reliability Diagnostic

- Product name: Mac YOLO Safeguards Diagnostic
- One-time amount: $499.00 USD
- Current product ID: TODO_PRODUCT_ID
- Current price ID: TODO_PRICE_ID
- Current payment link: TODO_PAYMENT_LINK
- Current link ready: no

```sh
node tools/stripe-offer-map-update.js --map 'stripe-offer-map-2026-06-02.tsv' --offer 'Agent Reliability Diagnostic' --product-id prod_LIVE_ID_HERE --price-id price_LIVE_ID_HERE --payment-link-url https://buy.stripe.com/LIVE_LINK_HERE --note 'live Stripe objects verified 2026-06-03' --dry-run
node tools/stripe-offer-map-update.js --map 'stripe-offer-map-2026-06-02.tsv' --offer 'Agent Reliability Diagnostic' --product-id prod_LIVE_ID_HERE --price-id price_LIVE_ID_HERE --payment-link-url https://buy.stripe.com/LIVE_LINK_HERE --note 'live Stripe objects verified 2026-06-03'
```

### AI Agent Hardening Sprint

- Product name: Mac YOLO Safeguards Hardening Sprint
- One-time amount: $1500.00 USD
- Current product ID: TODO_PRODUCT_ID
- Current price ID: TODO_PRICE_ID
- Current payment link: TODO_PAYMENT_LINK
- Current link ready: no

```sh
node tools/stripe-offer-map-update.js --map 'stripe-offer-map-2026-06-02.tsv' --offer 'AI Agent Hardening Sprint' --product-id prod_LIVE_ID_HERE --price-id price_LIVE_ID_HERE --payment-link-url https://buy.stripe.com/LIVE_LINK_HERE --note 'live Stripe objects verified 2026-06-03' --dry-run
node tools/stripe-offer-map-update.js --map 'stripe-offer-map-2026-06-02.tsv' --offer 'AI Agent Hardening Sprint' --product-id prod_LIVE_ID_HERE --price-id price_LIVE_ID_HERE --payment-link-url https://buy.stripe.com/LIVE_LINK_HERE --note 'live Stripe objects verified 2026-06-03'
```

### Partner Pilot

- Product name: Mac YOLO Safeguards Partner Pilot
- One-time amount: $3000.00 USD
- Current product ID: TODO_PRODUCT_ID
- Current price ID: TODO_PRICE_ID
- Current payment link: TODO_PAYMENT_LINK
- Current link ready: no

```sh
node tools/stripe-offer-map-update.js --map 'stripe-offer-map-2026-06-02.tsv' --offer 'Partner Pilot' --product-id prod_LIVE_ID_HERE --price-id price_LIVE_ID_HERE --payment-link-url https://buy.stripe.com/LIVE_LINK_HERE --note 'live Stripe objects verified 2026-06-03' --dry-run
node tools/stripe-offer-map-update.js --map 'stripe-offer-map-2026-06-02.tsv' --offer 'Partner Pilot' --product-id prod_LIVE_ID_HERE --price-id price_LIVE_ID_HERE --payment-link-url https://buy.stripe.com/LIVE_LINK_HERE --note 'live Stripe objects verified 2026-06-03'
```

## Batch Import Template

Generate an ignored local file such as `stripe-live-updates-template.tsv`. Candidate product/price IDs can be prefilled, but real payment links must be added manually:

```sh
node tools/stripe-live-updates-template.js --map 'stripe-offer-map-2026-06-02.tsv' --out stripe-live-updates-template.tsv --candidates 'stripe-readonly-candidates-2026-06-02.tsv'
```

The file must have real live Stripe values before importing:

```tsv
offer	stripe_product_id	stripe_price_id	payment_link_url	note
Agent Reliability Diagnostic	prod_LIVE_ID_HERE	price_LIVE_ID_HERE	https://buy.stripe.com/LIVE_LINK_HERE	live Stripe objects verified 2026-06-02
AI Agent Hardening Sprint	prod_LIVE_ID_HERE	price_LIVE_ID_HERE	https://buy.stripe.com/LIVE_LINK_HERE	live Stripe objects verified 2026-06-02
Partner Pilot	prod_LIVE_ID_HERE	price_LIVE_ID_HERE	https://buy.stripe.com/LIVE_LINK_HERE	live Stripe objects verified 2026-06-02
```

Then run:

```sh
node tools/stripe-offer-map-import.js --map 'stripe-offer-map-2026-06-02.tsv' --updates stripe-live-updates-template.tsv --dry-run
node tools/stripe-offer-map-import.js --map 'stripe-offer-map-2026-06-02.tsv' --updates stripe-live-updates-template.tsv
```

## Verification

```sh
node tools/revenue-command-center.js --date 2026-06-02 --limit 10
```

Expected when all offers are live:

- `Stripe-price-ready open gross: $217500.00`
- `Payment-link-ready open gross: $217500.00`
- `Missing/invalid-price open gross: $0.00`

This plan is not revenue proof. Only cleared Stripe payments entered into a private ignored revenue ledger count.
