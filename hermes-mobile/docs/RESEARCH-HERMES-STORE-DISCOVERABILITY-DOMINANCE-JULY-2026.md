# Hermes Mobile Store Discoverability: US Baseline and Dominance Plan

Date: 2026-07-21

Storefront: United States

Parallel Deep Research run: `trun_d3be5e813aa949708153a5fc22d3733a`
Run URL: <https://platform.parallel.ai/play/deep-research/trun_d3be5e813aa949708153a5fc22d3733a>

## Verdict

Hermes already ranks first for its exact product name on both stores in a reproducible signed-out US snapshot. It does **not** yet rank meaningfully for the broader category and problem queries that could bring new users. The Apple listing has zero ratings; the Google free listing has very low public traction; and the Google paid package returns HTTP 404 publicly. That is a distribution, activation, trust, and product-quality problem first, with metadata as one necessary input.

No ethical ASO program can guarantee rank 1 for every possible term. Apple says search incorporates metadata relevance plus user behavior such as downloads, ratings, and reviews. Google says discovery uses relevance, app quality, editorial judgment, ads, and user-specific factors. Both change continuously and can vary by device, account, locale, history, and experiment. The defensible objective is a finite portfolio of commercially relevant queries with measured rank, conversion, activation, retention, ratings, and revenue targets.

The high-ROI sequence is:

1. Make the first successful computer connection reliable and measure it.
2. Align one stable, platform-neutral metadata system across both stores.
3. Earn reviews only after a successful remote action.
4. Build keyword-specific Apple Custom Product Pages and Google Custom Store Listings.
5. Buy narrowly capped search traffic only after activation works, then scale only on retained or paid users.

## Method and evidence boundaries

- Apple ranks were captured through the Apple iTunes Search API with `country=us`, `entity=software`, and `limit=200`. Position is the 1-based occurrence of track ID `6786778037`.
- Google ranks were captured from signed-out Google Play web search with `hl=en_US` and `gl=US`. Position is the 1-based unique package occurrence in the result HTML. Most queries exposed at most 30 unique packages.
- `not seen` means the app was not observed inside the captured window. It does not mean the app is absent from every personalized result.
- Direct listing availability, indexed search visibility, Console review state, ads, and purchases are separate proof surfaces. This report does not treat one as proof of another.
- Raw Parallel output is retained in `parallel-research/` for provenance. The conclusions in this document were checked against current storefront responses and official Apple/Google documentation.

Machine-readable baseline: [`parallel-research/hermes-store-serp-snapshot-20260721.json`](../../parallel-research/hermes-store-serp-snapshot-20260721.json)

## Current public listing truth

| Listing | Direct public proof at capture | Live name | Price / traction signal | Consequence |
|---|---:|---|---|---|
| Apple, ID `6786778037` | HTTP 200 | `Hermes Mobile: AI Agent Leash` | $9.99; version 1.2; 0 ratings | Public and indexable, but no rating trust signal |
| Google free, `com.iganapolsky.hermesmobile` | HTTP 200 | `Hermes AI: Agent Leash` | Public listing; no material public rating/install signal in this capture | Public and indexable, but outranked on broad Hermes intent |
| Google paid, `com.iganapolsky.hermesmobile.paid` | HTTP 404 | Not public | No public listing proof | Cannot rank publicly until the listing is actually available |

Current public URLs:

- Apple: <https://apps.apple.com/us/app/hermes-mobile-ai-agent-leash/id6786778037>
- Google free: <https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile&hl=en_US&gl=US>
- Google paid: <https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&hl=en_US&gl=US>

Do not edit the paid Google listing merely to chase keywords while its release state is unsettled. Stage the metadata, prove the direct listing is public, then capture its independent baseline.

## Search baseline

### Brand and near-brand terms

| Query | Apple | Google free | Interpretation |
|---|---:|---:|---|
| `Hermes AI Agent Leash` | **1** | **1** | Exact-name moat already works |
| `agent leash` | **1** | **1** | Differentiated category phrase already works |
| `Hermes AI` | 96 | not seen in first 20 | Weak near-brand retrieval |
| `Hermes agent` | 59 | not seen in first 20 | Competitors own the short Hermes-agent phrase |
| `Hermes Mobile` | 48 | 7 | Name mismatch and weak traction dilute the product query |

### Category and problem terms

| Query | Apple | Google free |
|---|---:|---:|
| `remote AI agent` | 130 | not seen in first 30 |
| `desktop AI agent` | 134 | not seen in first 30 |
| `AI agent` | not seen in first 189 | not seen in first 30 |
| `AI assistant` | not seen in first 185 | not seen in first 30 |
| `computer AI agent` | not seen in first 190 | not seen in first 30 |
| `Mac AI agent` | not seen in first 198 | not seen in first 30 |
| `Windows AI agent` | not seen in first 194 | not seen in first 11 |
| `Linux AI agent` | not seen in first 196 | not seen in first 30 |
| `remote coding agent` | not seen in first 176 | not seen in first 30 |
| `remote coding assistant` | not seen in first 162 | not seen in first 9 |
| `approve AI tools` | not seen in first 195 | not seen in first 30 |
| `local AI agent` | not seen in first 195 | not seen in first 30 |
| `self hosted AI assistant` | not seen in first 187 | not seen in first 30 |
| `AI agent control` | not seen in first 195 | not seen in first 30 |
| `phone remote AI` | not seen in first 194 | not seen in first 30 |
| `control AI agent` | not seen in first 194 | not seen in first 30 |
| `AI coding assistant` | not seen in first 193 | not seen in first 30 |
| `desktop AI assistant` | not seen in first 187 | not seen in first 30 |

The exact brand result is not evidence of category dominance. The current opportunity is to turn the strong differentiated phrase `agent leash` into discovery for high-fit long-tail intent, not to attack `AI assistant` head-on before Hermes has ratings, retained users, and reliable onboarding.

## What the stores actually say matters

### Apple

Apple documents text relevance from the app name, subtitle, keyword field, and primary category, combined with customer behavior such as downloads, ratings, and reviews. The keyword field has a 100-character limit; Apple recommends commas without spaces, avoiding duplication already present in the name/subtitle/category, and excluding irrelevant, competitor, and trademark terms. Promotional text is not a search-ranking field.

Apple App Analytics exposes impressions, product-page views, conversion, downloads, and acquisition source. Custom Product Pages can carry different creative and keyword sets; Apple currently permits up to 70. Product Page Optimization tests creative variants, but Apple does not show results until at least five first-time downloads and may call a low-volume test inconclusive. Featuring nominations are free, but nomination is not a ranking guarantee.

Official sources:

- [App Store search](https://developer.apple.com/app-store/search/)
- [Configure custom product pages](https://developer.apple.com/help/app-store-connect/create-custom-product-pages/configure-multiple-product-page-versions)
- [Product Page Optimization analytics](https://developer.apple.com/help/app-store-connect-analytics/acquisition/product-page-optimization)
- [Nominate an app for featuring](https://developer.apple.com/help/app-store-connect/manage-featuring-nominations/nominate-your-app-for-featuring)
- [Request App Store reviews](https://developer.apple.com/documentation/storekit/requesting-app-store-reviews)

### Google

Google documents discovery factors including relevance, app quality, editorial value, ads, and user preferences. Search considers metadata plus user feedback and engagement. Chart popularity is not identical to query relevance. Ads are labeled and must not be reported as organic rank.

Android vitals can directly affect visibility. Google publishes bad-behavior thresholds of 1.09% overall user-perceived crash rate and 0.47% overall user-perceived ANR rate, with 8% per-phone-model thresholds for each. Google generally evaluates the last 28 days and may reduce visibility or warn users when quality is poor.

Google allows up to 50 Custom Store Listings and supports targeting by country, user segment, ad campaign, and search keyword. Store Listing Experiments should test one asset at a time, run at least a week, and be evaluated with acquisition plus retention. Google also prohibits ranking, price, promotional, and repetitive-keyword language in listing text; this makes the repository's current `$4.99 once` short-description draft a policy-risky choice, not an ASO advantage.

Official sources:

- [How apps are discovered and ranked](https://support.google.com/googleplay/android-developer/answer/9958766?hl=en)
- [Android vitals](https://developer.android.com/topic/performance/vitals/)
- [Create custom store listings](https://support.google.com/googleplay/android-developer/answer/9867158?hl=en)
- [Store Listing Experiments](https://play.google.com/intl/en_ALL/console/about/store-listing-experiments/)
- [Store listing field limits](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en-EN)
- [Store listing best practices](https://support.google.com/googleplay/android-developer/answer/13393723?hl=en-EN)
- [Google Play in-app reviews](https://developer.android.com/guide/playcore/in-app-review?hl=en)

## Correcting the raw research output

The raw deep-research artifact is evidence input, not canonical truth. Current verification corrected these claims:

| Raw claim | Verified correction |
|---|---|
| Apple live name is `Hermes AI Agent Leash`, version 1.3 | Public Apple API returned `Hermes Mobile: AI Agent Leash`, version 1.2 |
| Paid Google package is a searchable listing | Its direct public URL returned HTTP 404; it cannot have a public organic rank yet |
| Apple #1 data mixed organic and paid results | The captured Apple rank came from the public Search API; no paid-placement claim is made |
| Metadata or ads can rapidly force broad rank | Neither store guarantees this; user behavior, quality, and competition are non-controllable inputs |
| Ads improve organic rank | Ads buy labeled placement and can generate measurable users; no direct organic-rank boost is asserted |
| A named cost-per-tap benchmark determines spend | No third-party benchmark is used as a budget mandate; Hermes must use its own conversion and revenue data |
| Repeating `agent` in a custom page is a ranking tactic | Apple recommends unique, relevant keyword sets; Google warns against repetitive keyword use |

## Stable metadata architecture

Make one coordinated metadata change, then freeze it long enough to observe a full measurement window. Repeated title changes destroy comparability and do not manufacture reviews or retention.

### Apple candidate

- Name: `Hermes AI Agent Leash` — 21/30 characters
- Subtitle: `Control Your Computer Remotely` — 30/30 characters
- Keywords: `coding,approve,tools,mac,windows,linux,local,selfhosted,tailscale,usb,phone,desktop,developer,llm` — 97/100 characters

Reasoning:

- The product name preserves the exact query already at rank 1 while removing the live `Mobile:` inconsistency.
- The subtitle communicates the job rather than repeating `AI`, `Agent`, or `Leash`.
- The keyword field covers platforms, transport, privacy/local intent, developer intent, and the phone-to-computer relationship without repeating title/subtitle terms.
- Promotional text can be conversion copy, but it must not be counted as indexed rank inventory.

### Google free candidate

- Title: `Hermes AI: Agent Leash` — 22/30 characters
- Short description: `Control desktop AI agents from your phone across Mac, Windows, Linux, Tailscale.` — 80/80 characters

The current public short description — `Hermes AI for your computer — not phone AI` — differentiates the product but omits remote-control, platform, and Tailscale intent. The repository's later Mac-only title and price-bearing short-description draft should not ship: it contradicts Windows/Linux support and conflicts with Google's listing guidance.

### Google paid candidate, staged until public

- Title: `Hermes AI Agent Leash Pro` — 25/30 characters
- Short description: `Full desktop agent control from your phone across Mac, Windows, Linux.` — 70/80 characters

The paid package needs an independently differentiated proposition without price claims. Apply only after the existing release state is resolved and the package returns HTTP 200 publicly. Then capture a new rank baseline instead of assuming the free package transfers authority.

## Keyword portfolio and rank SLOs

The portfolio is finite because `every possible keyword` is unbounded and includes irrelevant or policy-prohibited terms.

| Tier | Terms | 30-day target | 90-day target |
|---|---|---|---|
| Exact brand | `Hermes AI Agent Leash`, `agent leash` | Keep top 1–3 on both stores | Keep top 1–3 on both stores |
| Near brand | `Hermes AI`, `Hermes agent`, `Hermes Mobile` | Top 25 where listing is public | Top 10 |
| High-fit job | `remote AI agent`, `desktop AI agent`, `AI agent control`, `control AI agent`, `approve AI tools`, `phone remote AI` | Appear in top 50 on at least three terms | Top 10 on five terms |
| Platform | `Mac AI agent`, `Windows AI agent`, `Linux AI agent` | Appear in top 50 on two terms | Top 20 on all three |
| Developer / local | `remote coding agent`, `remote coding assistant`, `local AI agent`, `self hosted AI assistant` | Appear in top 50 on two terms | Top 20 on four terms |
| Head terms | `AI agent`, `AI assistant`, `AI coding assistant` | Measure; do not optimize the whole product around them | Top 30 is a stretch goal, not a launch promise |

These SLOs are portfolio targets, not guarantees. Report the median rank across repeated signed-out captures plus App Analytics/Play Console search terms, not a single favorable phone screenshot.

## Instrumentation required before scale

One product funnel should join store discovery to value:

`impression → product page → install → first launch → computer added → connected → first successful remote action → day-1 retained → day-7 retained → rating prompt shown → rating/review → paid conversion`

Required dimensions:

- Store, package/app ID, country, locale, device class, app version, build.
- Acquisition source, campaign, keyword/custom-page ID when available.
- Connection path selected and successful: Tailscale, home Wi-Fi, USB, or account relay.
- Time to first computer connection and time to first successful remote action.
- Crash/ANR status before activation and during first action.
- Never collect chat content in product analytics.

The live 2026-07-21 USB incident shows why activation must precede paid acquisition: the app accepted a direct setup, then overwrote `connectionMode` to `relay`, leaving a physically connected user at `Waiting for approval pairing…`. Buying installs into that state would accelerate abandonment and bad reviews. A credential-free setup intent restored `Connected · USB`; the permanent regression fix is separately queued against the actively owned `App.tsx` file.

## Review strategy

- Trigger Apple StoreKit or Google Play review flow only after a clearly successful remote action, never at launch or during connection setup.
- Do not gate the official review prompt behind an internal positive/negative sentiment question.
- Never buy, trade, script, or incentivize ratings.
- Measure prompt eligibility, prompt requested, and subsequent rating-count movement only in aggregate; the OS/store may suppress prompts.

## 7 / 30 / 90-day execution plan

### Days 0–7: eligibility, activation, and one coherent story

1. Permanently fix and regression-test the direct-setup-to-relay transport overwrite.
2. Instrument the full discovery-to-first-success funnel and establish crash/ANR baselines.
3. Stage the exact metadata candidates above. Do not edit Google paid until its direct page is public.
4. Rebuild the first three screenshots around a simple sequence: connect computer, control agent, approve tools; show Mac, Windows, and Linux support without unreadable UI.
5. Implement official review prompts after the first or third successful remote action, with a conservative cooldown.
6. Draft one Apple Custom Product Page and one Google Custom Store Listing for the highest-fit cluster: `remote AI agent / desktop AI agent`.
7. Submit a factual Apple featuring nomination tied to a real version/update, not generic marketing copy.

Exit gate: no acquisition spend until a realistic fresh-user cohort can reliably connect and complete the first remote action, and Android vitals are below published bad-behavior thresholds.

### Days 8–30: earn enough signal to learn

1. Run a bounded launch across existing developer, self-hosted AI, Mac/Windows/Linux, and Tailscale communities with platform-specific links and UTMs.
2. Drive each platform-intent cohort to its matching Apple/Google custom page.
3. Capture rank twice weekly using the same signed-out US method; use Console/App Analytics for actual impressions, conversion, and source truth.
4. Run one creative experiment at a time only after there is enough traffic. Google: at least seven days and inspect acquisition plus day-1 retention. Apple: do not call a PPO winner below Apple's reporting/confidence requirements.
5. Start a $0–$500 validation budget only if first-action activation and early retention are healthy. Use exact and high-fit long-tail terms, not `AI assistant`.
6. Stop a term/page when it generates traffic but no first successful actions or paid conversions after a predeclared sample; do not optimize only to taps.

Exit gate: exact-brand rank retained, at least three high-fit terms visible, review count and rating displayed where store thresholds allow, and acquisition cohorts have measurable activation/retention.

### Days 31–90: compound winners

1. Expand winning pages into Mac, Windows, Linux, remote-coding, approval, and self-hosted clusters.
2. Localize only the best-converting English page and metadata set; do not translate an unproven funnel everywhere.
3. Scale acquisition from $500 to $2,000 only when cohort economics support it. A $9.99 one-time Apple purchase cannot support uncapped acquisition cost without downstream revenue.
4. Refresh creative from actual use cases and support questions; freeze losing messages and archive their evidence.
5. Reallocate effort by retained-user and paid-conversion yield, not vanity impressions.
6. Publish a weekly scorecard: rank portfolio, impressions, product-page conversion, first-action activation, D1/D7, ratings, crash/ANR, paid conversion, and cost per activated/paying user.

## ROI priority

| Priority | Work | Expected leverage | Why now |
|---:|---|---|---|
| 1 | Reliable first connection + activation telemetry | Very high | Prevents paid traffic and organic installs from becoming abandonment/bad reviews |
| 2 | Stable platform-neutral metadata | High | Eligibility and conversion foundation; removes current cross-store contradictions |
| 3 | Post-success review prompt | High | Ratings/reviews are store inputs and trust signals |
| 4 | One keyword-targeted CPP + CSL | Medium-high | Tests high-fit intent without rewriting the default page for everyone |
| 5 | Screenshot/creative experiments | Medium-high after traffic | Improves product-page conversion when sample size exists |
| 6 | Bounded search acquisition | Medium after activation | Generates measurable intent cohorts, but paid placement is not organic rank |
| 7 | Localization | Medium after English winner | Multiplies a proven story; expensive noise before baseline |
| 8 | Head-term attack (`AI assistant`) | Low near term | High competition and low product specificity |

## Weekly scorecard and decision rules

| Metric | Baseline | Green decision | Red decision |
|---|---|---|---|
| Exact-brand rank | 1 Apple / 1 Google free | Remains 1–3 | Metadata/title regression |
| Near-brand rank | Apple 48–96; Google free 7 or absent | Trend toward top 25 | No movement after a full indexed measurement window |
| High-fit terms visible | Apple 2 at 130/134; Google 0 | Three or more terms enter top 50 | Traffic rises without activation |
| Paid Google public availability | HTTP 404 | HTTP 200 and listing independently baselined | Still 404; no rank claims or spend |
| Apple ratings | 0 | Legitimate post-success count begins growing | Prompting before value or support complaints |
| First-action activation | Not yet joined to store source | Improves by cohort without quality regressions | Connection errors or transport overrides |
| Crash / ANR | Establish from Play Console | Below published thresholds | Stop scale and fix quality |
| Paid experiment | Not started | Cost per activated/paying user within declared economics | Spend optimized to taps or installs only |

## Policy and ethics guardrails

- No fake installs, review farms, review swaps, incentivized reviews, or automated ratings.
- No competitor trademarks, irrelevant trending keywords, ranking claims, price claims, or keyword repetition in metadata.
- No reporting paid placement as organic rank.
- No claiming public availability from a draft, submitted release, direct internal track, or local build.
- No title churn based on one personalized screenshot.
- No acquisition scale while first-run connection is broken or Android vitals are over threshold.

## Artifacts

- Canonical report: this file
- Reproducible SERP/listing snapshot: `parallel-research/hermes-store-serp-snapshot-20260721.json`
- Raw research: `parallel-research/hermes-store-discoverability-dominance-july-2026.md`
- Raw structured result: `parallel-research/hermes-store-discoverability-dominance-july-2026.json`
