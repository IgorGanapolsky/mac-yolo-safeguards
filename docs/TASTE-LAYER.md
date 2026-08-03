# Taste layer (non-slop AI outputs)

**Updated:** 2026-08-03  

Maps [Taste Labs / “AI has no taste”](https://www.youtube.com/watch?v=4x_gN7XMIcE) ideas onto this repo **without** a separate human reviewer SaaS.

## What we took

| Video idea | Our implementation |
|------------|-------------------|
| Define taste as rubrics, not vibes | `tools/taste-gate.js` domains + weighted dimensions |
| Eval + production | Golden set `evals/taste-golden-set.json` + gates on ship/promo paths |
| Decompose quality | specificity, honesty, brand_fit, anti_slop, cta |
| Ground-truth verifiers | good vs slop cases; CI runs `tests/test-taste-gate.js` |
| Volume is a risk | Prefer fewer reviewed posts; social double-post gate + taste |
| Personalization ≠ taste | Gate scores craft quality only (no user-pref model) |
| Route hard tasks | Promo/copy → taste + publish gates; objective ops → ship-claim evidence |

## Commands

```bash
# Score one draft
node tools/taste-gate.js --domain promo_social --text "…" --json

# Regress golden set (CI)
node tools/taste-gate.js --eval-golden
node tests/test-taste-gate.js

# Production path: social pre-post
node tools/social-publish-gate.js --platform linkedin --campaign … \
  --body-file draft.md --require-buy-links --require-taste

# Ship / LIVE language
node tools/ship-claim-gate.js --claim "…" --results-json /tmp/…/results.json
```

## Domains

| Domain | Use for |
|--------|---------|
| `promo_social` | LinkedIn, X, Reddit value posts, longform hooks |
| `ship_status` | Agent status reports (“LIVE”, “shipped”) |
| `outreach_email` | Founder / buyer outbound |
| `product_ui` | In-app strings (plain language, no false Connected) |

## TasteMakers here

Not a hired panel. **Ground truth is:**

1. CEO / product rules in `AGENTS.md` (honesty, ThumbGate.app-first, no fake traction)  
2. LIVE winners in `docs/social/hermes-mobile-content-log.tsv` (refresh goldens when style shifts)  
3. Incident-driven golden cases (each overclaim → new FAIL case)

## What this is not

- Not model fine-tuning  
- Not affiliate VSL pipelines  
- Not a substitute for `ship-claim-gate` evidence (counts/permalinks)  
- Not Linear/Obsidian coordination  

See also: `docs/AGENT-SWARM-HARNESS.md` (hard bar for done), `tools/ship-claim-gate.js`.
