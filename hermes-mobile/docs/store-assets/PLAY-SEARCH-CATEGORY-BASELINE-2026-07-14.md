# Google Play category-search baseline — 2026-07-14

Package: `com.iganapolsky.hermesmobile`  
Market: neutral public Play HTML, `hl=en&gl=US`  
Command: `npm run --silent rank:play`

Parser tests: `npx jest --runInBand scripts/play-search-rank.test.js`

## Baseline

| Query | Rank snapshot |
|---|---:|
| `hermes mobile` | 7 |
| `hermes ai agent leash` | 1 |
| `ai agent leash` | 3 |
| `ai agent remote control` | Not in first 30 |
| `claude code remote` | Not in first 20 |
| `approve ai agent` | Not in first 30 |
| `ai coding agent` | Not in first 30 |
| `ai agent phone control` | Not in first 30 |

This is a dated, non-personalized snapshot, not an assertion about every user. Play results vary by market, device, account history, and time.

## Decision

The listing is indexed and ranks for its exact coined name, but not for buyer-category intent. Do not overwrite the production short description while experiment `7582167718598236328` is active; that would contaminate its control.

Stage this next search-keyword custom-listing or experiment arm instead:

- Title: `AI Agent Remote: Hermes` (23/30)
- Short description: `Remote-control AI coding agents. Approve risky commands from your phone.` (72/80)
- Full description and graphics: inherit the current truthful production listing through a Store Listing Group.
- Candidate keyword bundles: `ai agent remote control`, `approve ai agent`, `ai coding agent`, `ai agent phone control`.

The copy does not claim native control of Claude Code, Cursor, or Codex. Hermes supervises agents routed through the user's own Hermes gateway.

## Submission boundary

Google Play exposes search-keyword custom listings in Play Console, not the Android Publisher `edits.listings` API used by the current metadata automation. Creating or submitting the public listing remains a separate console action. No listing, experiment, binary, or build was submitted by this task.

## Measurement

Run the baseline daily at a consistent time and market:

```bash
npm run --silent rank:play > /tmp/hermes-play-rank.json
```

Measure category-query rank separately from conversion, retained installers, reviews, and revenue. A rank change without installs or retention is not a business outcome.
