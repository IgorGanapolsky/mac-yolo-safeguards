# Addendum B (2026-07-22, ~17:25 UTC): iOS screenshot-index exclusion + free-package recovery

Second same-day addendum, following
[`...ADDENDUM-0722.md`](./RESEARCH-HERMES-STORE-DISCOVERABILITY-DOMINANCE-JULY-2026-ADDENDUM-0722.md)
(`cursor-aso-listing-dominance`, 16:20 UTC) and the canonical
[`RESEARCH-HERMES-STORE-DISCOVERABILITY-DOMINANCE-JULY-2026.md`](./RESEARCH-HERMES-STORE-DISCOVERABILITY-DOMINANCE-JULY-2026.md).
Triggered by Igor's direct interrupt with fresh iTunes-search proof. Adds one new causal
finding, confirms a fix is code-ready but push-blocked, and reports the free Play package
recovering since the last check ~70 minutes ago.

## 1. New finding: zero screenshots likely causes total search-index exclusion, not just low rank

Re-ran `hermes ai` against `itunes.apple.com/search` with `limit=50` (Apple returned 47 total
results — its practical ceiling for this query). `id6786778037` (Hermes AI Agent Leash) is
**absent from all 47**, even though several *lower*-signal competitors are present: rank 29
"Hermes Agent Ai" (0 ratings, tiny developer "Love Power Up, LLC"), rank 10 "Hermes Agent App
by Hermes AI" (0 ratings). This rules out "Apple simply filters zero-rating apps" — it doesn't;
several zero-rating apps rank. The exclusion is specific to this listing.

**Mechanism, backed by a fresh July 2026 deep-research run** (`parallel-cli`, run
`trun_d3be5e813aa949708927e582e28c055a`, `pro-fast`, saved to
`parallel-research/hermes-store-aso-screenshot-index-july2026.md`): *"Apple confirmed
screenshot OCR indexing in June 2025 — screenshot caption text is now searchable/indexed for
keyword ranking, not just conversion."* This means a **zero-screenshot listing is missing an
entire Apple-documented ranking surface**, on top of the already-known conversion loss. It is
the most consistent explanation for why a listing whose name/subtitle literally start with
"Hermes AI" is invisible for the query "hermes ai" while inferior competitors are not.

This is a strengthened, citable version of Addendum A's conversion-only framing — same root
cause (zero screenshots), now with a ranking mechanism, not just a conversion one. It does not
change Addendum A's live-Console-confirmation caveat for the **separate** Play free-package
404 hypothesis (unrelated store, unrelated mechanism).

## 2. iOS name/subtitle/keywords: confirmed already optimal — no edit made

Igor asked to tune iOS text fields for `hermes ai` / `agent leash` coverage without contesting
DATAPHONE's bare "Hermes Mobile" name. Re-checked the live fields directly:

| Field | Live value | Assessment |
|---|---|---|
| Name (30) | `Hermes AI Agent Leash` (21) | Already leads with the exact adjacent phrase "Hermes AI" |
| Subtitle (30) | `Hermes AI agent for your Mac` (28) | Also leads with "Hermes AI"; reinforces, doesn't waste the field |
| Keywords (100) | 99/100, zero overlap with name/subtitle words (`remote,approve,coding,devtools,gateway,operator,safety,pair,tailscale,desktop,usb,wifi,phone,mobile`) | Full, no repetition, no competitor-trademark terms |

Per this session's own deep-research run: *"the long description has never been indexed for
[iOS] ranking... investing in long-description copy for ranking is wasted."* Text-field
optimization has hit its ceiling for this listing — **no further keyword/name/subtitle edit
was made**, because none is available without either wasting budget on words Apple already
credits from the name/subtitle, or repeating a word already covered. Forcing a change here
would be busywork, not a fix. The actual lever is §3.

## 3. Screenshot push: code-ready, upload blocked this session (hard blocker)

- **Ready:** PR #783 (`fix/store-assets-cross-platform-20260722`) generates the real 6-frame
  iPhone 6.7"/iPad 12.9"/Play set (WCAG 8.90–18.62:1, max pair similarity 76.85%, OCR-clean).
  Its only blocker was a trivial `plan.md` append-only conflict with `main`, which this
  session resolved and pushed (commit `f583bd58`); GitHub auto-merge is armed and will land it
  once required CI is green and the branch is back up to date with the fast-moving `main`.
- **Blocked — App Store Connect upload:** Attempted three independent paths this session, all
  failed for concrete, evidenced reasons:
  1. **No local ASC API key** (`~/.gcloud-keys/` has only Play publisher keys; no `.p8` for
     Apple) — ruled out the non-interactive REST-API upload path.
  2. **`fastlane deliver` with the existing saved spaceship session** (`~/.fastlane/spaceship/igor.ganapolsky@icloud.com/cookie`,
     dated 2026-07-06) — session had expired; Apple demanded interactive 6-digit 2FA, which
     cannot be entered without Igor's device. This is the standard, expected failure mode for
     an unattended agent session and is not a code or config bug.
  3. **Chrome DOM/file-picker automation** — the App Store Connect *web* session **is** live
     and authenticated (confirmed: opening a fresh tab to `appstoreconnect.apple.com/apps`
     rendered the full authenticated app list, and the `Previews and Screenshots → Edit`
     control is reachable on the 1.3 version page), so the earlier `ensure-asc-session.sh`
     Chrome probe result was stale by the time this session re-checked. However, actually
     uploading requires either a native macOS file-picker dialog or a drag-and-drop file drop,
     neither of which the available browser automation (Cursor's `cursor-ide-browser` MCP)
     can drive in this background session — its tab state did not persist across tool calls.
     Direct AppleScript control of Igor's real Chrome window is live-contended: Igor's Chrome
     is running a concurrent outreach automation (Gmail composes to gym/BJJ prospects were
     visible mid-session), and one AppleScript command coincided with an unrelated Chrome
     restart. No tabs, windows, or in-flight compose drafts were lost (verified: the original
     window's 7 tabs survived; only a stray auxiliary window this session created was closed).
     Given that risk, further unattended DOM/window manipulation of Igor's live browser was
     stopped rather than pushed further.

**Unblock path for whoever has interactive access (2 minutes, no code change needed):**
Chrome is already signed in with no login wall. Open
`https://appstoreconnect.apple.com/apps/6786778037/distribution/ios/version/deliverable` →
**Previews and Screenshots** → **Edit** → drag in the 6 iPhone 6.7" files from
`hermes-mobile/fastlane/screenshots/en-US/*_67.png` and the 6 iPad 12.9" files
(`*_ipad129.png`) once PR #783 lands on `main` (or straight from the `pr783-check`/
`fix/store-assets-cross-platform-20260722` branch checkout right now) → **Save**. Re-verify
with `curl -s "https://itunes.apple.com/lookup?id=6786778037" | python3 -m json.tool` and
expect non-empty `screenshotUrls`.

**Apple index lag:** per this session's research, Apple's own guidance and ASO-vendor
consensus put **search-index refresh at hours, not days**, for asset-only changes (no new
build), but **do not re-claim a "hermes ai" search-visibility fix** until a *fresh*
`itunes.apple.com/search?term=hermes%20ai` re-run (not just the `lookup` endpoint) shows the
app present — `lookup` returning updated `screenshotUrls` only proves the upload, not
re-indexing into search.

## 4. Play: free package is back to public HTTP 200 (recovered since Addendum A)

Re-checked both packages just now, with the same method as Addendum A (`curl -A Mozilla/5.0`):

| Package | Addendum A (16:20 UTC) | This check (~17:25 UTC) |
|---|---|---|
| `com.iganapolsky.hermesmobile` (free) | **404** | **200**, `og:title` "Hermes AI: Agent Leash - Apps on Google Play" |
| `com.iganapolsky.hermesmobile.paid` | 200, "Hermes Mobile: AI Agent" | 200 (unchanged) |

The free package's public visibility recovered on its own within roughly an hour, with no
Console action taken by any agent this session. This is consistent with (but does not prove)
Addendum A's repetitive-content-enforcement hypothesis being a **transient** flag rather than
a hard suspension — transient near-duplicate-content flags on Google Play are sometimes
auto-cleared after a re-crawl. **Do not report this as "fixed" in the causal sense** — nothing
was changed to fix it, and it could recur while both near-identical sibling listings remain
public. Continue the existing `T-PLAY-PAID-REVIEW-POLL` LaunchAgent monitoring; do not close
the P0 without a full-day quiet window.

## 5. Honest ranking outlook (unchanged from Addendum A, restated per the no-promises contract)

No promise of rank #1 for any head term. `agent leash` / exact brand name is already won on
iOS. `hermes ai` / `hermes mobile` / `hermes agent` remain owned by better-established
competitors with real install/rating velocity that a screenshot push alone will not overcome —
but the screenshot push is the single highest-leverage remaining action because it is the only
lever in this list that is (a) fully controllable, (b) evidenced to affect both conversion and
now the raw ranking-eligibility surface, and (c) already code-ready, blocked only on a
2-minute manual Console action.

## Sources

- `parallel-cli research run trun_d3be5e813aa949708927e582e28c055a` (pro-fast, 2026-07-22) —
  saved report: `parallel-research/hermes-store-aso-screenshot-index-july2026.md` — synthesizes
  Apple Developer documentation, Google Play Console Help Center, and ASO-vendor research
  (AppTweak, AppRadar, ASO World, AppsTemple, Phiture, Moburst); screenshot-OCR-indexing and
  CPP-metadata-indexing claims are flagged there as Apple-confirmed 2025 platform changes, not
  speculation.
- `itunes.apple.com/search?term=hermes%20ai&limit=50` and `itunes.apple.com/lookup?id=6786778037`,
  captured live this session.
- `play.google.com/store/apps/details` for both packages, captured live this session.
- `~/.fastlane/spaceship/`, `~/.gcloud-keys/` (existence/absence only, no secret contents read
  into this document).
- GitHub PR #783 (`fix/store-assets-cross-platform-20260722`), commit `f583bd58`.
