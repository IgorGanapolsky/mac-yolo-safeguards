# Drift report: Mac YOLO Safeguards public promises vs code (2026-11-13)

Method: Elephant-Goldfish drift check (skill `egm-drift-report`: report only differences, every finding needs doc line plus code line). Read-only checkout of origin/main at fc1e93f6 (`/Users/iganapolsky/workspace/mys-egm-drift`, removed afterwards). Run as one fresh-context reviewer, critique first. No Stripe or /go/ link was requested or opened.

Docs in scope: `README.md`, `apps/macyolosafeguards-site/public/index.html`, `llms.txt`. Terms, refunds and privacy pages are included where they contradict the $29 promise, because a buyer reads them at checkout.
Code checked: `apps/macyolosafeguards-site/src/worker.js` (W), `src/license.js` (L), `macos/MacYoloTranslucentHud.swift` (S), `tools/mac-yolo-agent-guard.js` (G).

Strongest counter-argument, stated first: index.html itself is mostly honest. The $29 row, the 14-day refund text, the one-time key (L:32, L:87, lifetime exp 2100) and the "never touches Cursor workers, tmux, apps" claim (G:67, G:484, G:140) are backed by code. The harm is almost all in the places a paying buyer meets AFTER the page: the app, the terms/refunds pages, llms.txt and the live /go/ slugs. Those still sell the retired plans.

## Ranked findings (harm to a paying buyer first)

### 1. The app itself still sells $59/yr and $19/mo, and its Buy button goes to the annual link
- Doc truth: index.html:53 `Pro Guard: $29 once`; index.html:58 "No subscription."
- Code: S:3539 `openGetPro` opens `proCheckoutURL + "?client_reference_id=app_paywall"`, and S:1725 `let proCheckoutURL = "https://macyolosafeguards.io/go/pro-annual"`. W:24 maps `pro-annual` to the retired $59/yr Stripe link, live. A buyer who clicks "Get Pro" in the app pays $59/yr, not $29 once.
- Same drift as visible text: S:451 `Pro $59/yr` (header pill), S:468 "Unlock Mac YOLO Pro Guard — $59/year (or $19/mo)", S:474 "Get Pro Guard — $59/yr ›", S:697 "($59/year or $19/month)", S:3532 "Get Pro Guard ($59/year)…", S:3547-3548 "$59 a year or $19 a month, cancel any time."
- The nudge notification opens `proPricingURL` (S:1726) which redirects to the page, which is correct; the in-app buttons are the leak.
- Harm: highest. Wrong price charged, recurring billing instead of one-time, and it is the funnel buyers actually use (Product Hunt, app_nudge).

### 2. Retired plans are still purchasable through live /go/ slugs
- Doc truth: "$19/mo and $59/yr are retired from the page" (task brief).
- Code: W:19-20, W:27-28 `pro-direct`, `pro`, `pro_monthly`, `monthly` all redirect to the retired $19/mo link `buy.stripe.com/9B6bJ2c3...`; W:24-26 `pro-annual`, `annual`, `yearly` to the $59/yr link. W:7 `PRO_SLUGS` also lists them.
- Doc that still points at them: llms.txt:29 links `https://macyolosafeguards.io/go/pro` (the $19/mo link) as the Pro Guard purchase (see finding 3).
- Harm: any old link, README fork, search snippet or LLM answer that cites /go/pro charges a subscription. Note the $29 key is the only product whose license logic was updated for "no renewal" (L:32, L:87); subscription buyers still get a 40-day key (L:13, L:33) that needs the refresh call.

### 3. llms.txt sells a product the site no longer sells
- llms.txt:29 "Mac YOLO Pro Guard, $19 a month (adds Auto-Guard ... bug reports get priority): https://macyolosafeguards.io/go/pro". Contradicts index.html:53 and index.html:30.
- llms.txt:27 "The app is free and complete." contradicts the Pro table (index.html:55-56) where Auto-Guard is the paid difference.
- llms.txt:30-31 name the services "Agent Reliability Diagnostic" and "AI Agent Hardening Sprint"; index.html:70-71 names them "Agent Failure Investigation" and "Agent Reliability Rollout" with different scopes. W:30-34 slugs still `diagnostic`, `sprint`. The checkout the buyer lands on is one product with two names across pages.
- This file is served to AI crawlers and as `text/markdown` for `/` (W:103-110), so it is what an assistant tells a buyer.

### 4. Terms and refunds pages contradict the $29 once / 14-day promise
- Doc truth: index.html:58 "Reply to your receipt within 14 days for a full refund."; README:45 "14-day refund".
- `public/refunds/index.html`: "ask for a refund within 30 days"; "For the Mac YOLO Pro Guard subscription, you can cancel any time. If you forgot to cancel, ask within 30 days of a charge". No mention of a one-time $29 purchase or 14 days.
- `public/terms/index.html`: "The Mac YOLO Pro Guard subscription renews monthly until you cancel". Nothing says one-time key.
- index.html:60 sends buyers to "the refund policy" for exactly this. Two different refund windows (14 vs 30 days) are published; the binding legal text describes a product the buyer did not buy.

### 5. "Leftovers are stopped before the Mac freezes" / "overnight sessions never freeze" are guarantees the code does not make
- Doc: index.html:56 "Leftovers are stopped before the Mac freezes"; index.html:26 "keeps your Mac running through overnight agent runs"; S:3547 "so overnight agent sessions never freeze your Mac".
- Code: G:738 "Storms and orphan copies wait for two criticals"; G:49 orphans need 600 s age; G:140-141 anything with a tty, any live agent session, any app is protected and never signalled; G:495-497 idle Claude sessions are only reported "archive them in Claude", never stopped. S:3643 ticks every 60 s; disk cleaning only when free disk < 10 GB and at most once an hour (S:3664-3665 `freeDiskGB() < 10 ... > 3600`). Sustained memory use by live sessions (the usual freeze cause) is explicitly not acted on.
- Harm: a buyer who pays $29 for "never freezes" and still freezes with 15 live Claude sessions (the page's own screenshot, index.html:35-36) has a reasonable refund and trust claim. Soften to what ships: stops orphaned MCP servers, duplicate storms and stranded agents under memory pressure.

### 6. "Does it send my data anywhere? No." is flatly stated but the app makes network calls
- Doc: index.html:64 "No. It runs on your Mac and needs no account."; privacy page "does not send that information anywhere, and it has no accounts or tracking."; README:357 "make no network calls" (scoped to the simulator wrapper).
- Code: S:2429-2447 uploads and downloads test data to `speed.cloudflare.com` (Test Speed and the periodic probe note at S:2309-2373 pings 1.1.1.1); S:3620-3623 sends the license key to `macyolosafeguards.io/license/refresh`; S:3539 opens checkout with `client_reference_id`. Also the Pro flow needs an email-bound signed key (S:1773). None of this is process data, so "your process data stays local" is probably true, but the unqualified "No" and "no accounts" is not what the code does. Also the site loads a Cloudflare beacon (index.html:99); privacy page does disclose that one.
- Needs Igor's call, but the disclosed sentence should name the speed test and license check.

### 7. "36 recorded process snapshots" counts test cases, not snapshots
- Doc: index.html:49 "tested against 36 recorded process snapshots, including real snapshots from a Mac running many agents."
- Code: `tests/fixtures/app-guard-golden/snapshots/` holds 4 files (real-01..real-04); `cases/` holds 36 JSON cases (header of `tests/test-app-guard-golden.js:7-14` says cases run over "redacted snapshots of real process tables, documented incidents"). So 36 is the number of cases, over 4 snapshots plus synthetic/documented-incident inputs. Verified by `ls | wc -l` (4 and 36). The "fails the test and doesn't ship" claim: not verified that CI blocks release on this test.

### 8. The app needs Node.js; the page says "No account needed" and nothing about it
- Doc: index.html:31 install paragraph and the Homebrew line; no dependency mentioned.
- Code: S:1306 `"This action needs Node.js. Install it with: brew install node"` is returned when Node is missing, S:1309 "This action isn't included in this version of the app." Stop Runaways, Free Agent RAM, disk cleaning and Auto-Guard all shell out to `tools/*.js` (S:3646 `runTool("mac-yolo-agent-guard.js", ...)`). A Pro buyer with no Node gets a Pro key that unlocks a feature that cannot run. Not checked: whether the Homebrew cask declares a node dependency (cask file not in this repo).

### 9. README overpromises tokens and fleet, and a Pro row is incomplete
- README:12 "so coding agents ... can't burn your tokens or freeze your Mac." No token budget enforcement ships. README:46 sells a "token-budget" template playbook and README:341 "burn thousands of tokens" framing. The shipped Pro Guard never caps tokens or spend.
- README:12 and README:33 "stops runaway loops and Mac freezes when real work still burns tokens or load": the guard only reacts to process storms and memory pressure (G:219-225), it does not measure tokens.
- README:45 Pro row: "automatic shutdown of leftover agent processes and MCP servers" omits automatic cache/disk cleaning that index.html:55 promises (S:3664 cleans caches). Minor, but the two Pro descriptions differ.
- README:9 badge "Apple Silicon + Intel" vs index.html:17,31 and llms.txt:3 "Apple Silicon only". Not verified which is true (no build arch flag found in `scripts/` or `macos/` other than `LSMinimumSystemVersion` in `macos/bundle/Info.plist:38`). One of them is wrong.
- README:45 "Fleet" is not promised for $29 and no fleet pricing appears in any doc (checked README, index.html, llms.txt): no drift there. No dollar-savings figure found in these three docs either; README:381 "$400-$1,500/mo of repeated-mistake spend" is cross-promo for ThumbGate, not this app.

### 10. "Bug reports: Front of the line" has no mechanism behind it
- Doc: index.html:57 Pro "Front of the line"; llms.txt:29 "bug reports get priority".
- Code: no entitlement check, label, or routing for support anywhere in W, L or S (grep of the three for support/priority finds nothing); the activate page (L:106) says only "reply to your receipt email". It is a promise of Igor's own time, not a code feature. Acceptable if intentional, but a $29 once buyer gets lifetime priority; say so or drop it.

## Checked and not drifted
- `/go/pro-once` maps to the $29 link (W:21); `once` and `lifetime` the same (W:22-23). Not opened.
- One-time key never expires and needs no renewal (L:11, L:32, L:87); checkout accepted only from the one-time payment link (L:10, L:69).
- Stop Runaways does not touch apps, terminals or Cursor's workers (G:67, G:484-490, G:140-141).
- Fleet pricing, token-budget enforcement and dollar-savings: absent from the three scoped docs, no drift.

## Not verified
- Live behaviour of any /go/ link or Stripe price (deliberately not requested).
- Whether the released v1.2.1 binary matches origin/main (swift source read, not the shipped app).
- Homebrew cask contents, CPU architecture of the build, CI gating on the golden test.

## Suggested fix order
1. Change S:1725 to `/go/pro-once`, and rewrite every $59/$19 string in S (lines 451, 468, 471, 474, 697, 3532, 3547-3548). Needs a new app build and release.
2. Re-point or retire W:19-20, 24-28 (send to pricing, as unknown slugs do at W:94) once the app update ships, so old copies keep working until then.
3. Rewrite llms.txt Pricing, and rewrite terms and refunds for $29 once with a 14-day window.
4. Soften index.html:56 and S:3547 "never freeze"; fix index.html:49 count; add the Node dependency; decide the privacy wording; resolve Intel vs Apple Silicon in README:9.
