# Play CSL + iOS CPP definitions — GSD artifact (2026-07-15)

**Machine-readable:** `csl-definitions-20260715.json`, `cpp-definitions-20260715.json`  
**Console only:** Play Android Publisher API has **no** CSL methods; ASC CPP create is Console/UI (or limited API).  
**Brand rule:** Prefer category language. Strip Cursor/Claude/Copilot from **titles/subtitles** when pasting (variant B short desc may still mention — sanitize).

## Play Custom Store Listings (3)

| ID | Theme | Short desc source | Target keywords |
|----|-------|-------------------|-----------------|
| `csl-ai-agent-control` | Safety | `short_description_A_safety.txt` | AI agent control, approve tools phone |
| `csl-devtool-operator` | Operator | `short_description_B_operator.txt` | mobile devtool, remote Mac agent |
| `csl-wallet-credits` | Wallet / hybrid C | `short_description_C_wallet_guard.txt` | own Mac, Leash Pro, cloud credits |

**How to create:** Play Console → Grow → Store presence → Custom store listings → New → paste title/short/full from variants → keyword/country targeting → publish.

## iOS Custom Product Pages (3)

| ID | Name | Subtitle source | Notes |
|----|------|-----------------|-------|
| `cpp-ai-agent-control` | AI agent control | `subtitle_A_safety.txt` | Reuse 6.7" stellar screenshots |
| `cpp-mobile-devtool` | Mobile devtool | `subtitle_B_operator.txt` | Organic keyword CPP |
| `cpp-own-mac-credits` | Own Mac vs credits | `subtitle_C_wallet_guard.txt` | Price anchor in promo text |

**How to create:** ASC → Hermes Mobile → Custom Product Pages → create → media from existing 1.0/1.1 sets → enable search.

## Evidence of prep

- Variants live under `fastlane/metadata/*/en-US/variants/`
- Distinct screenshots: `python3 scripts/_assert_store_frame_distinct.py` → all pairs &lt;90% similar (2026-07-15)
