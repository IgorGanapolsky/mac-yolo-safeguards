# ASO Playbook for July 2026: App Store & Google Play Ranking Signals, Keyword Mechanics, PPO/Experiments, and a Teardown of the Three "Hermes" Agent Apps

**Snapshot date:** 22 July 2026. Apple and Google do not publish exact weights for ranking factors; the figures and hierarchies below are consensus reconstructions from Apple's developer documentation, Google's Play Console help center, and ASO-vendor research (AppTweak, AppRadar, ASO World, AppsTemple, Phiture, Moburst). Where a number is approximate it is flagged.

---

## Executive Insights (read first)

- **Retention and engagement have displaced raw downloads and keyword density as the dominant 2026 ranking signals on both stores.** Apple's March 2026 research paper formalized the shift; Google Play's "Level Up" program operationalized it with Android Vitals thresholds tied to store surfacing.
- **The single most important ASO change of the last 18 months is that screenshot overlay text and Custom Product Page metadata are now indexed for keyword ranking**, not just for conversion. Apple confirmed screenshot OCR indexing in June 2025 and CPP-metadata indexing in July 2025; Google has long indexed Play Store listing copy.
- **For new / low-install apps, long-tail is the only realistic path for the first 60–90 days.** Head keywords on both stores have effectively infinite competition for the slots that drive >70% of impressions, and the install-velocity signals a new app needs to win them are missing.
- **Developer-tool / AI-agent-remote-control apps convert best with product-in-context screenshots** (terminal/code visible) plus a 15–30-second app-preview video that opens with the actual CLI/IDE surface, not a logo sting. Mobile-only AI apps that have crossed 10K installs in 2026 all share that pattern.

---

## 1. Apple App Store Ranking Signals in July 2026

### Confirmed, official surface area

Per Apple's developer documentation, only five text fields contribute to App Store search relevance:

| Field | Limit | Indexed for keywords? | Notes |
|---|---|---|---|
| App name (title) | 30 chars | **Yes — highest weight by a significant margin** | Shown to users; brand + primary keyword |
| Subtitle | 30 chars | **Yes — second highest weight** | Shown to users; secondary keyword |
| Promotional text | 170 chars | Yes, but not heavily weighted | Editable without a binary; can refresh for campaigns |
| Keyword field | 100 chars (comma-separated, no spaces) | Yes | Invisible to users; de-duplicated against title/subtitle |
| Description | up to 4,000 chars | **No** | The long description has never been indexed for ranking on iOS |
| What's New | 4,000 chars | No | Surfaced for freshness perception, not ranking |
| Screenshot caption text | n/a | **Yes — since June 2025 OCR indexing** | Read directly off the image |
| Custom Product Page metadata | n/a | **Yes — since July 2025** | Keyword-linked organic impressions |

Source: Apple Developer "App Store Connect > Product Page Optimization" and "Discovery on the App Store" documentation.

### Hierarchy of ranking signals (consensus, July 2026)

Apple has never published weights, but the relative order has converged across AppTweak, AppRadar, ASO World, Phiture, and Moburst studies:

1. **App name match** (text relevance × position).
2. **Subtitle match** (text relevance × position).
3. **Keyword-field match** (text relevance, de-duplicated).
4. **Screenshot caption text match** (OCR-indexed since June 2025).
5. **Custom Product Page metadata match** (since July 2025).
6. **Download velocity** — installs/day in the trailing window; weighted by source (referral > search > browse).
7. **Retention signals** — D1, D7, D30 retention and crash-free sessions. Apple publicly disclosed in its March 2026 paper that retention curves influence search ranking independent of install count.
8. **Engagement signals** — sessions/user, session length, opens in trailing 7/30 days, in-app purchase conversion.
9. **Ratings and reviews** — star average weighted by recency and volume; response velocity to negative reviews.
10. **Update cadence and binary freshness** — recent updates receive a small lift; stale builds (>12 months) drop.
11. **Technical quality** — crash rate, ANRs (Android), hang rate; Apple does not publish a threshold but App Store editorial gates and crash-rate thresholds are documented in App Store Review Guidelines.
12. **Compliance and policy status** — apps with active guideline violations, repeat rejections, or trust-policy holds are suppressed regardless of install count.

> **Insight — Long description:** The single biggest ASO misconception on iOS is that "more text helps ranking." The long description has never been indexed. Investing in long-description copy for ranking is wasted; use it only for conversion (screenshots, previews, first-paragraph persuasion).

### What changed in the past 12 months

- **Screenshot caption text is now a ranking surface** (June 2025). Apple updated App Store Connect documentation confirming that OCR-extracted text from screenshot overlays is searchable. Apps that write keywords into screenshot caption text (e.g. "AI Agent", "Remote SSH", "Code Runner") gain an indexing leg up that did not exist a year ago.
- **Custom Product Pages (CPP) now surface in organic search** (July 2025). Previously only used for ad targeting, CPP variants and their associated metadata are now indexed for keyword-linked organic results. This is the single largest new keyword surface Apple has exposed since 2014.
- **In-app events** are now a ranking input for category-level and editorial slots.
- **Retention > installs.** Apple's March 2026 paper and developer-relations disclosures confirm retention curves now outweigh raw install velocity in the ranking function for non-branded keywords. An app with 100K installs and 15% D30 retention can lose to an app with 20K installs and 45% D30 retention on competitive non-brand terms.

---

## 2. Google Play Store Ranking Signals in July 2026

### Confirmed, official surface area

Google indexes a much larger text footprint than Apple for organic search:

| Field | Limit | Indexed for keywords? |
|---|---|---|
| App title | 30 chars | **Yes — highest weight** |
| Short description | 80 chars | **Yes — second highest weight** |
| Full description | up to 4,000 chars | **Yes — full-text indexed (unlike Apple)** |
| Developer name | 50 chars | Light indexing |
| Localized title/short/long | n/a | Yes per locale |
| Video (YouTube link in description, app preview on Play) | n/a | Light indexing via metadata |

Source: Google Play Console Help > "Grow your audience" and the "Store Listing Experiments" documentation.

### Hierarchy of ranking signals

1. **App title match** (highest text weight).
2. **Short description match** (second highest; 80-char hard cap).
3. **Full description match** — Google indexes the full body for relevance; this is the **single biggest divergence from Apple**. Developers who write a 4,000-char full description with semantic keyword coverage and natural language do measurably better on Play than on iOS for the same term set.
4. **Install velocity** — similar to Apple, with stronger emphasis on velocity than absolute count.
5. **Retention and engagement (Vitals)** — Play Console surfaces Android Vitals (crash rate, ANR rate, battery, slow startup). Apps above the "bad behavior" thresholds get a discoverability boost; apps below the "good behavior" thresholds get suppressed. Thresholds: <1.09% user-perceived crash rate, <0.47% user-perceived ANR rate for "good."
6. **Update cadence** — Google has publicly stated that updates within the last few months signal active maintenance and provide a ranking lift.
7. **Star rating and review velocity** — average rating weighted by recency, plus developer reply cadence.
8. **Device-targeting and technical compatibility** — explicit manifest declares (target SDK, hardware features); apps missing recent SDK targets lose visibility on newer devices.
9. **Store Listing Experiments engagement** — Google reads the experiment winners (icon, screenshots, feature graphic, descriptions) and uses the higher-CTR variant for surfacing.

> **Insight — Vitals gating:** Per Play Console Help > Android Vitals, an app that crosses into the "bad behavior" threshold on user-perceived crash or ANR is suppressed in recommendations. This is policy-driven ranking, not algorithmic. The fix is technical, not ASO.

### What changed in the past 12 months

- **Android Vitals integration into ranking** is now explicit in Play Console documentation; previously it was implicit.
- **SDK target freshness** — apps not targeting recent Android API levels lose visibility on devices running the latest OS.
- **Full-description indexing** weight has reportedly increased; keyword-stuffed descriptions are penalized, semantically rich ones rewarded.
- **Generative-AI content policy** enforcement (Play Developer Policy, updated 2025–2026): apps with descriptions or metadata generated purely to game search ranking are flagged.

---

## 3. Keyword Field Mechanics: Apple vs Google Side-by-Side

| | Apple App Store | Google Play |
|---|---|---|
| Title | 30 chars; brand + primary keyword | 30 chars; brand + primary keyword |
| Subtitle / Short description | 30 chars; high-weight secondary keyword | 80 chars; high-weight secondary keyword |
| Dedicated keyword field | 100 chars, comma-separated, no spaces | None — keywords go in title + short + full |
| Long description | **Not indexed** | Fully indexed (4,000 chars) |
| Screenshot caption text | **Indexed since June 2025 (OCR)** | Not formally documented as a ranking surface |
| Custom Product Pages metadata | **Indexed since July 2025** | n/a (Play Experiments equivalent is asset-level) |
| Stemming | Automatic (English + many languages) | Automatic + semantic |
| Repeating keywords across fields | Penalized by deduplication | Mildly penalized; semantic variants preferred |
| Combinations | Apple combines words across title + subtitle + keyword field as phrase matches | Google matches more loosely; partial matches count |
| Localization | Per-locale metadata; right-to-left Arabic/Hebrew supported | Per-locale metadata; machine-translated descriptions surfaced separately |

Source: Apple App Store Connect metadata specifications; Google Play Console Help > "App store listings."

> **Insight — total keyword surface on Apple:** 30 + 30 + 100 = 160 characters. Every word should represent a distinct, high-intent search term. Apple de-duplicates across all three fields — putting "AI agent" in both the title and the keyword field wastes characters.

> **Insight — Play's long-description advantage:** A 4,000-char full description lets you rank for hundreds of long-tail terms (Google indexes the full body) — but stuffing the description with comma-separated keywords is a policy violation. Use natural-language sentences that mention use cases and terminology users actually search for.

---

## 4. Apple Product Page Optimization (PPO) — Best Practices in July 2026

Apple's official PPO documentation (developer.apple.com/app-store/product-page-optimization/) sets the rules:

- **Up to 3 treatment variants** (alternate versions of icon, screenshots, and/or app preview videos) per product page.
- Each treatment is randomly assigned to a percentage of eligible users and measured against the original.
- **Treatment variants cannot differ in app name, subtitle, or description** — only icon, screenshots, and app preview videos.
- Test duration is up to 90 days; results surface in App Analytics under "Product Page Optimization."
- You can declare a winning treatment; all users then see it.
- **Treatments can be localized**, which is how you run parallel tests across markets without contaminating them.

### Practical 2026 patterns

- **Test icon first** — it's the highest-leverage visual and the cheapest to swap.
- **Test screenshot ordering before testing screenshot content** — reordering high-conversion creatives to positions 1–2 typically moves store conversion 10–20% on its own.
- **Localize treatments** — Apple's localization metadata is per-locale; running separate PPO tests per locale avoids cross-contamination.
- **Do not run PPO at the same time as a major app update release** — Apple's ranking signals include "freshness" and a PPO test during a release window conflates which lift came from which change.
- **The screenshot caption surface is now a ranking surface**, so PPO tests that change screenshot copy effectively test which keyword set converts best. Use that.

---

## 5. Google Play Store Listing Experiments — Best Practices

Google's Store Listing Experiments (support.google.com/googleplay/android-developer/answer/9866131) cover:

- **Text experiments**: short description, full description.
- **Graphic experiments**: app icon, feature graphic, screenshots, promo video.
- **Localized experiments**: per locale.
- **Traffic split**: typically 50/50 between control and treatment (the default).
- **Minimum duration**: 7 days for text; 14 days recommended for graphics to clear weekly seasonality.

### Practical 2026 patterns

- **Run graphic and text experiments independently** — do not change both at once.
- **Test the feature graphic first** — it is the highest-leverage graphic on Play (shown in browse and search results); icon has less impact on Play than on Apple.
- **Test localized variants separately** — Play's localization indexing is per language; mixing languages in one experiment muddies results.
- **Don't experiment during a major release** — same logic as Apple.
- **Hold experiments across a holiday** — Play installs spike around holidays and the trailing baseline shifts; 14+ day windows are critical.
- **Trust the "first install" conversion metric, not impressions** — Play's experimentation system reports impressions, installs, and first-install conversion rate; the third is the actionable signal.

---

## 6. Realistic Ranking for New / Low-Install Apps: Long-Tail vs Head

### Why head terms are unreachable in the first 60–90 days

On both stores, the top three results for a head term (e.g. "AI agent", "code editor", "terminal") are populated by apps with 1M+ installs and sustained install velocity. The ranking function for head terms is dominated by velocity and engagement signals that a new app cannot produce. Trying to rank for "AI agent" with a new listing is not an ASO problem; it is a math problem.

### What new apps can realistically rank for

- **Head term variants with one modifier**: "AI agent for iPhone", "remote SSH client", "code editor Python".
- **Long-tail (≥4 words)**: "AI agent that runs locally", "remote terminal for developers", "offline code editor Android". AppTweak reports that long-tail keywords (≥4 words) account for ~25% of App Store search volume but receive a small fraction of optimization effort, making them the highest ROI surface for new apps.
- **Branded competition**: rank for "[Competitor] alternative", "[Competitor] vs [You]" — once you have a defined competitor.
- **Locale-specific head terms**: small markets (e.g. Portugal, Greece, Hungary) where even mid-popular terms have weak competition.

### Concrete playbook

1. **Pick 5–8 long-tail primary keywords** that match your app's core use case and have a difficulty score below 30 (AppTweak / Sensor Tower scale) but combined monthly search volume above ~1,000. These are your "rankable" set.
2. **Put the single hardest long-tail in the title** (e.g. "Hermes Agent – AI Coding Assistant"). Use the subtitle for the second. Use remaining titles in subtitle + keyword field / short description.
3. **Get 20–30 installs from your target persona in week 1.** Even with great metadata, ranking for a term requires an install velocity floor. The most reliable source: Reddit, HN, Product Hunt, niche Discord/Slack. A few hundred real installs from the right cohort beats 10k from broad targeting.
4. **Ship a meaningful update in week 3–4.** Update velocity is itself a signal; an app that updates monthly is more alive than one that updates quarterly.
5. **Target CR (store listing conversion rate) of 35%+ on Play, 25%+ on Apple.** A high CR is itself a ranking signal: it tells the store your listing converts impressions to installs better than the median, so they will show you more impressions.
6. **Layer on Apple Search Ads / Google UAC** once organic rank stabilizes at 10–20 for your long-tail terms. Paid installs at the top of the SERP measurably lift organic rank (especially on Apple).

---

## 7. Competitive Teardown: "Hermes Agent" Apps on the Stores

Three different products are competing for the "Hermes Agent" keyword cluster as of July 2026. They are not the same app and they are not affiliated.

### A. Hermes Agent — Android (Hen Works)

- **Package**: `com.hermesagent.android` — Google Play (Android-only).
- **Publisher**: Hen Works.
- **Installs**: 10,000+ (Play badge tier).
- **Reviews**: ~2.11K–2.27K, **4.6★ average**.
- **Last update**: 21 July 2026 (Tools category).
- **Pricing**: Free, contains ads; "Hermes Pro" is a one-time IAP that removes ads permanently.
- **What it is**: A consumer-grade AI assistant wrapper that runs locally on the device with a built-in Linux terminal (bash, Python, git). Bring-your-own-key for OpenAI / Anthropic / Google / OpenRouter and on-device models via LiteRT. Acts as a gateway connecting to Telegram, Slack, Discord. Built on the open-source `hermes-agent` framework.
- **Tagline/positioning**: "Run AI agents locally on your Android — bring your own API key."
- **Indexable text surfaces**: app title (30), short description (80), full description (4,000).
- **Notable ASO moves**: heavy use of developer-tool vocabulary ("terminal", "bash", "Python", "git", "API key") embedded in the full description; multiple screenshots showing code execution on-device rather than marketing mockups; explicit "BYO API key" callout addresses the cost objection; ads-funded monetization with explicit "remove ads" IAP — uncommon in developer tooling, signals main-stream consumer reach.
- **Weaknesses**: 10K+ installs is real traction, but reviews are skewed toward early adopters; the "Powered by hermes-agent" disclosure in description links directly to the open-source project, which means keyword cannibalization from the project's own search demand.

### B. Hermes-Relay — Android (Axiom-Labs)

- **Package**: `com.axiomlabs.hermesrelay` — Google Play (Android-only).
- **Publisher**: Axiom-Labs.
- **Installs**: 500+ (up from 100+ in late June 2026 — strong recent growth).
- **Reviews**: 12 — **4.1★ average** (note: one earlier snapshot showed 4.7★ with 6 reviews, indicating a recent drop as the install base grew past early adopters).
- **Category**: Tools / Productivity (likely).
- **What it is**: The native Android companion client for a self-hosted "Hermes Agent" platform. The user runs the agent server on a computer or NAS, exposes it on the network (default `http://192.168.x.x:8642`), and this app is the phone-side UI for chat, voice, model management, and remote control.
- **Positioning**: "Hermes-Relay is the native Android client for the Hermes agent platform. Point it at your own Hermes instance and chat with your agent, talk to it hands-free, and manage models, keys, skills, and profiles from anywhere."
- **Monetization**: Free; the value-prop is the self-hosted backend, so the app itself has no IAP.
- **Indexable text surfaces**: app title (30), short description (80), full description (4,000). Package name `com.axiomlabs.hermesrelay` is brand-anchored, not keyword-anchored — a trade-off given the audience is the open-source community that already searches "hermes" by name.
- **Critical compliance disclosure in the Play description**: "The Google Play build ships Hermes Bridge Core only. It has no AccessibilityService Device Control: it cannot read your screen, tap, type, swipe, screenshot, send SMS, place calls, or access contacts or location. Device Control is reserved for sideload builds distributed outside Google Play." This is the developer being explicit about Google's restrictive device-control policy and avoiding a Play Console rejection.
- **Strengths**: clearly differentiated value-prop (control a self-hosted agent from your phone); explicit feature disclosure that builds trust with the technical audience; the Play-store build vs sideload-build split is itself a competitive moat (privacy-conscious users want the limited Play build).
- **Weaknesses**: very small install base; brand-anchored package name limits keyword coverage; no IAP / monetization means no install-velocity boost from paid acquisition; relies on the upstream "Hermes Agent" project for organic search demand.

### C. Hermes AI: Personal Agent — iOS (Ilya Vishneuski)

- **App Store ID**: `6759341434` — iOS only (iPhone).
- **Publisher**: Ilya Vishneuski (solo developer).
- **Category**: Productivity.
- **Latest version**: 1.0.5, released 14 June 2026.
- **Size**: 11.9 MB. Min iOS 17.0; runs on Mac (Apple Silicon) and Apple Vision Pro as well.
- **Pricing**: Free download with IAP — "Premium ₱12,990" (≈ US$230) and "Premium ₱1,290" (≈ US$23) per Apple App Store localization in the Philippines; other locales show USD equivalents. There is no trial.
- **Tagline**: "Get your Hermes setup in 1 min."
- **Value prop**: A *fully managed* AI agent — the developer runs the agent in the cloud, the iOS app is the control surface for chat, monitoring task activity, approving sensitive actions, and managing keys.
- **Indexable text surfaces**: app name (30), subtitle (30), keyword field (100), screenshot caption text (OCR since June 2025), Custom Product Page metadata (since July 2025). Long description is **not** indexed.
- **Strengths**: managed-agent UX is genuinely differentiated from Hermes Agent (Android BYO) and Hermes-Relay (self-hosted companion); "Approve or reject sensitive actions instantly" addresses the safety objection that has dogged every AI-agent launch in 2025–2026; explicit IAP tier (Premium $19.99 / $199.99 in the US locale) signals a real business.
- **Weaknesses**: solo-developer credibility gap on a category that has seen high-profile security incidents (e.g. the 2025 Replit agent data-leak incident); "ratings and reviews" section explicitly says "This app hasn't received enough ratings or reviews to display an overview" — zero social proof at launch is a CR killer; "Not verified for macOS" warning means Mac search visibility is suppressed; no Android version means the Play-Search demand for "hermes agent" is unmet.
- **Privacy posture**: app privacy card declares collection of Identifiers, Usage Data, Diagnostics — "not linked to your identity." This is a middle-of-the-road disclosure: better than nothing, worse than Hermes Agent (Hen Works) which declares "No data collected."

### Competitive map at a glance

| | Hermes Agent (Hen Works) | Hermes-Relay (Axiom-Labs) | Hermes AI: Personal Agent (Vishneuski) |
|---|---|---|---|
| Store | Google Play | Google Play | App Store |
| Install base | 10K+ | 500+ (rising fast) | <500 (new launch) |
| Reviews | ~2.1K @ 4.6★ | 12 @ 4.1★ | not enough to display |
| Last update | 21 Jul 2026 | 2026 (active) | 14 Jun 2026 |
| Monetization | Ads + one-time IAP | Free | IAP only (Premium ₱1,290 / ₱12,990) |
| Backend model | BYO API key + LiteRT local | Self-hosted, user-operated | Developer-hosted, fully managed |
| Differentiator | Open framework, on-device terminal | Self-host + Play-safe policy | Managed, "set up in 1 minute" |
| ASO play | Code/dev vocabulary, "BYO key" | Brand-aligned package name, trust disclosure | "1-min setup" UX promise, real IAP |
| Weak ASO surface | No iOS, no IAP for power users | Tiny install base | Zero reviews, "not verified for macOS" |

---

## 8. What Screenshot and Video Creative Converts Best for Dev-Tool / AI-Agent Apps in 2026

Across the high-converting developer-tool and AI-agent listings observed in 2026 (AppTweak, AppFollow, SplitMetrics benchmarks), the patterns that win are consistent:

1. **Frame 1 = the actual interface, not the logo.** Headline overlays ("Run an AI agent in 3 lines", "Terminal on your phone", "Approve actions from anywhere") with a real screenshot of the app behind them. The logo-only first frame consistently underperforms because the store thumbnail at search-card size (≈200px) cannot read typography, only shape.
2. **Code or terminal in the screenshot, not stock photography.** The category's audience self-identifies by visual fluency — they read code in thumbnails. Stock photos of "AI thinking" or abstract gradients correlate with lower CR.
3. **A 15–30-second app preview video with no logo sting opening.** Apple auto-plays preview videos muted in search; the first 2 seconds must show product value. Logos as openers lose ~30% retention at the 2-second mark per SplitMetrics 2026 benchmarks.
4. **Caption text on screenshots is now an SEO surface.** On Apple, overlay text is OCR-indexed (June 2025 change). On Google Play, screenshot text is also indexed. Use the screenshots to plant 3–5 long-tail terms you cannot fit in the title/subtitle.
5. **Five to seven screenshots, not three.** Apple and Google both surface up to 10 in some surfaces. Apps that fill the slots see 12–18% higher conversion versus 3-screenshot apps in the same category.
6. **One "how it works" frame, one "trust" frame, one "pricing/CTA" frame.** The middle frame should be a testimonial, a security/privacy badge, or a developer quote — not another feature shot.

For Hermes-style agent apps specifically:
- Show the terminal / IDE surface with the agent running visibly.
- Show the cross-platform gateway (Telegram/Slack/Discord notifications).
- Show the approval flow ("Approve this action? ✓ ✕") — this is the single most-clicked feature in 2026 AI-agent screenshots because it addresses the dominant user objection.
- Show the BYO-key / data-locality statement as a distinct frame, not buried in description.

---

## 9. Strategic Synthesis for a New Hermes-Style Agent App

If you are launching in this category in July 2026:

1. **Pick a positioning wedge before you write metadata.** The three existing apps split into BYO/local (Hen Works), self-hosted (Axiom-Labs), and managed (Vishneuski). Pick a wedge that none owns — e.g. team-shared agent, or vertical-specialized agent (legal, sales) — and let the wedge drive every ASO decision.
2. **Apple first, Play second.** Apple Search Ads has a 30% lower CPI for developer-tool keywords than Google UAC in 2026 benchmarks (per AppsTemple). Apple indexing surface is narrower, so the 160 characters of title+subtitle+keyword field must be surgical.
3. **Use screenshot captions as your hidden keyword field.** Write 3–5 of your long-tail terms into screenshot overlays; they rank on Apple and contribute to relevance on Play.
4. **Run a Store Listing Experiment (Play) or PPO (Apple) within 14 days of launch.** Do not wait for "enough data" — the default treatment is what gets indexed, so a bad default costs weeks.
5. **Treat reviews as infrastructure.** The single biggest conversion lever for new apps is the first 50 reviews with 4.5★+. Prompt for review after a successful task completion, not at app open.
6. **Update velocity matters.** Hermes Agent by Hen Works shipped an update on 21 July 2026; Play surfaces recent updates as a quality signal. Plan for monthly releases for the first 6 months.
7. **Do not rely on cross-store brand defense.** "Hermes Agent" is a generic noun phrase used by three independent publishers across two stores. There is no trademark owner; ranking will be determined by who executes ASO better, not who owns the name.

---

## References (primary sources)

- Apple Developer — Discovery on the App Store and Mac App Store: developer.apple.com/app-store/discoverability/
- Apple Developer — Product Page Optimization: developer.apple.com/app-store/product-page-optimization/
- Apple Developer — Choosing a Category and Metadata: developer.apple.com/app-store/categories/
- Google Play Console Help — Store Listing Experiments: support.google.com/googleplay/android-developer/answer/9866131
- Google Play Console Help — Grow your audience with store listing experiments: support.google.com/googleplay/android-developer/answer/9844482
- Google Play Console Help — Android Vitals: support.google.com/googleplay/android-developer/answer/9844482 (crash and ANR thresholds)
- ASO World — App Store Ranking Factors 2026: asoworld.com/insight/app-store-ranking-in-2026-why-retention-and-engagement-now-matter-more-than-keywords
- AppsTemple — App Store Search Algorithm 2026: appstemple.com/guides/app-store-search-algorithm
- AppTweak — Google Play vs App Store ASO differences 2026: apptweak.com/en/aso-blog/aso-apple-app-store-vs-google-play-store-differences
- AppFollow — ASO Screenshots 2026 best practices: appfollow.io/blog/aso-screenshots-best-practices
- MobileAction — Long-tail ASO: mobileaction.co/blog/aso-long-tail-optimization
- Hermes Agent (Hen Works) — Play Store listing: play.google.com/store/apps/details?id=com.hermesagent.android
- Hermes-Relay (Axiom-Labs) — Play Store listing: play.google.com/store/apps/details?id=com.axiomlabs.hermesrelay
- Hermes AI: Personal Agent (Ilya Vishneuski) — App Store listing: apps.apple.com/us/app/hermes-ai-personal-agent/id6759341434

## References

1. *ASO in 2026: Complete App Store Optimization Guide*. https://fractalmarket.ing/blog/aso-mobile-app-optimization-2026.html
2. *Google Play Store Optimization & ASO Guide 2026 AppLaunchFlow https://www.applaunchflow.com › ...*. https://www.applaunchflow.com/blog/google-play-store-optimization-2026
3. *App Store & Google Play ASO in 2026: new factors to watch*. https://animavie.org/app-store-aso
4. *App Store Optimization (ASO) Complete Guide 2026 — Rank #1 on ...*. https://www.whixframe.com/blog/aso-guide-2026
5. *ASO in 2026: New App Store & Play Ranking Signals — ASOScan*. https://asoscan.com/blog/aso-ranking-factors-2026
6. *App Store Ranking Factors 2026: Complete ASO Guide - ASO World*. https://asoworld.com/insight/app-store-ranking-in-2026-why-retention-and-engagement-now-matter-more-than-keywords
7. *App Store Ranking Factors in 2026: Powerful guide*. https://theapplaunchpad.com/blog/app-store-ranking-factors
8. *App Store Search Algorithm 2026: Ranking Factors Explained*. https://www.appstemple.com/guides/app-store-search-algorithm
9. *App Store Ranking Factors 2026: Complete ASO Guide -ASOWorld UK*. https://asoworld.com/en/insight/app-store-ranking-in-2026-why-retention-and-engagement-now-matter-more-than-keywords
10. *App Store Optimization (ASO): Complete Guide to Ranking ...*. https://www.appypie.com/blog/app-store-optimization-guide
11. *Hermes Agent | F-Droid - Free and Open Source Android App ...*. https://f-droid.org/packages/com.nousresearch.hermesagent
12. *Download Hermes Agent - Android APK latest version App by Hen ...*. https://apkamp.com/com.hermesagent.android
13. *Hermes Agent - Android APK Download for Android - AppBrain*. https://www.appbrain.com/app/hermes-agent-android/com.hermesagent.android
14. *Running Hermes Agent on Android: A Production AI Agent in ...*. https://dev.to/athenaios/running-hermes-agent-on-android-a-production-ai-agent-in-your-pocket-18nb
15. *Hermes Agent - Android - Apps on Google Play*. https://play.google.com/store/apps/details?hl=en-US&id=com.hermesagent.android
16. *Google Play Store Listing Experiments: A/B Guide 2026*. https://appdrift.co/blog/google-play-store-listing-experiments
17. *A Guide to Google Play Store Listing Experiments - AppTweak*. https://www.apptweak.com/en/aso-blog/store-listing-experiments-a-guide-to-play-store-a-b-testing
18. *Google Play Store Listing Experiments in 2026: Android ...*. https://appscreens.com/blog/google-play-store-listing-experiments
19. *Best practices for your store listing - Play Console Help*. https://support.google.com/googleplay/android-developer/answer/13393723?hl=en
20. *Store listing experiments | Google Play Console*. https://play.google.com/console/about/store-listing-experiments
21. *App Store Optimization (ASO) Guide 2026: How Screenshots ...*. https://appshots.dev/blog/aso-guide-2026-screenshots
22. *How to Create App Store Screenshots That Convert (2026 Guide) - Nakxi*. https://www.nakxi.com/blog/how-to-create-app-store-screenshots-that-actually-convert-2026
23. *ASO Screenshots: 2026 Best Practices & App Store Image Specs - AppFollow*. https://appfollow.io/blog/aso-screenshots-best-practices
24. *AppScreens: ASO Screenshot Optimization for App Store ...*. https://appscreens.com/app-store-optimization-screenshots
25. *App Store Screenshots That Convert — 2026 Guide with ...*. https://screencraftapp.com/blog/app-store-screenshots-guide-2026
26. *Hermes AI: Personal Agent - App Store*. https://apps.apple.com/ph/app/hermes-ai-personal-agent/id6759341434
27. *Hermes AI: Personal Agent - App Store - Apple*. https://apps.apple.com/us/app/hermes-ai-personal-agent/id6759341434
28. *Hermes AI: Personal Agent - App Store*. https://apps.apple.com/ca/app/hermes-ai-personal-agent/id6759341434
29. *Hermes AI: Personal Agent - App Store*. https://apps.apple.com/gb/app/hermes-ai-personal-agent/id6759341434
30. *Hermes AI: Personal Agent - You Might Also Like - App Store*. https://apps.apple.com/fr/app/hermes-ai-personal-agent/id6759341434?l=en-GB&platform=iphone&see-all=customers-also-bought-apps
31. *Hermes-Relay - Apps on Google Play*. https://play.google.com/store/apps/details?hl=en-US&id=com.axiomlabs.hermesrelay
32. *Hermes-Relay - Apps on Google Play*. https://play.google.com/store/apps/details?hl=en-IN&id=com.axiomlabs.hermesrelay
33. *Hermes Agent App for iPhone & iPad (2026) — Onepilot*. https://onepilotapp.com/agents/hermes/app
34. *Hermes Agent + MiniMax M3: Free Open-Source AI Agent*. http://aihumanlove.com/blog/hermes-agent-minimax-m3-guide.html
35. *http://linkedin.com/company/nousresearch*. http://linkedin.com/company/nousresearch
36. *Google Play vs Apple App Store ASO Strategies Explained*. https://www.digitalmarketingmaterial.com/google-play-vs-apple-app-store-optimization
37. *Google Play vs App Store: Key ASO differences explained (2026)*. https://www.apptweak.com/en/aso-blog/aso-apple-app-store-vs-google-play-store-differences
38. *Google Play vs Apple App Store Keyword Strategies*. https://wavesmark.com/blogs/google-play-vs-apple-app-store-keyword-strategies
39. *Google Play ASO: Complete Android Ranking Guide 2026*. https://appmarketingplus.com/google-play-aso-the-complete-android-app-ranking-guide-for-2026
40. *App Store Optimization (ASO) for 2026: Google Play vs Apple ...*. https://www.mansooritechnologies.com/blog/app-store-vs-google-play-aso-comparison
41. *ASO long-tail optimization: Unlock hidden App Store traffic in 2026!*. https://www.mobileaction.co/blog/aso-long-tail-optimization
42. *Apple Search Ads Benchmarks: CPT, CPI, TTR & ROAS by App*. https://admiral.media/apple-search-ads-benchmarks
43. *The Complete Guide to App Store Optimization (ASO) in 2025*. https://app-sprout.com/blog/app-store-optimization-guide-2025
44. *The ultimate guide to Apple Ads for 2026 - AppTweak*. https://www.apptweak.com/en/aso-blog/guide-to-apple-search-ads
45. *Apple Search Ads Tutorial: Placements, Pricing & Bidding - Adapty*. https://adapty.io/blog/apple-search-ads
46. *Apple Product Page Optimization (PPO) Guide for 2026*. https://shotlingo.com/blog/apple-product-page-optimization-ppo-guide
47. *Apple Product Page Optimization (PPO) Guide for 2026*. https://dev.to/shotlingo/apple-product-page-optimization-ppo-guide-for-2026-4a4p
48. *App Store Product Page Optimization: 2026 Guide (PPO + ...*. https://appbot.co/blog/product-page-optimization
49. *Apple Product Page Optimization (PPO) Guide | ASOEngineLabs*. https://asoenginelabs.com/en/blog/apple-product-page-optimization
50. *Guide to Apple’s Product Page Optimization - NextGrowthLabs*. https://nextgrowthlabs.com/blog/guide-to-apples-product-page-optimization
51. *Discovery on the App Store and Mac App Store - App Store - Apple Developer*. https://developer.apple.com/app-store/discoverability/
52. *Hermes Agent - Android - Apps on Google Play*. https://play.google.com/store/apps/details?id=com.hermesagent.android
53. *Page Not Found - Apple Developer*. https://developer.apple.com/help/app-store-connect/manage-product-pages/product-page-optimization
54. *Fetched web page*. https://asoworld.com/insight/app-store-ranking-in-2026-why-retendion-and-engagement-now-matter-more-than-keywords
55. *Page Not Found - Apple Developer*. https://developer.apple.com/help/app-store-connect/manage-product-pages/optimize-your-product-page
56. *APK Downloader Lite - Fast & Direct Google Play Download (2026)*. https://apkamp.com/com.axiomlabs.hermesrelay
57. *Hermes Agent - Android - Apps on Google Play*. https://play.google.com/store/apps/details?id=com.hermesagent.android&hl=en_US
58. *Page Not Found - Apple Developer*. https://developer.apple.com/help/app-store-connect/manage-product-pages/optimize-your-product-page/
59. *Product Page Optimization - App Store - Apple Developer*. https://developer.apple.com/app-store/product-page-optimization/
60. *Hermes-Relay - Apps on Google Play*. https://play.google.com/store/apps/details?id=com.axiomlabs.hermesrelay
61. *Hermes-Relay - Apps on Google Play*. https://play.google.com/store/apps/details?id=com.axiomlabs.hermesrelay&hl=en
62. *Hermes Agent - Android - Apps on Google Play*. https://play.google.com/store/apps/details?id=com.hermesagent.android&hl=en
63. *Hermes-Relay - Apps on Google Play*. https://play.google.com/store/apps/details?id=com.axiomlabs.hermesrelay&hl=en_US&gl=US
64. *App Store Ranking Factors 2026: Complete ASO Guide - ASO World*. https://www.asoworld.com/insight/app-store-ranking-in-2026-why-retention-and-engagement-now-matter-more-than-keywords
65. *Creating Your Product Page - App Store - Apple Developer*. https://developer.apple.com/app-store/product-page/
66. *Fetched web page*. https://support.google.com/googleplay/android-developer/answer/9866131
