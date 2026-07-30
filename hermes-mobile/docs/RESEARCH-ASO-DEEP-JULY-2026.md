# Hermes Mobile ASO & App Store Ranking Playbook (July 2026)

## Executive Summary

- **Category is brand-name hostile, not algorithm-hostile**: Apple Search and Google Play Search index keywords that competitors (Hermes AI Personal Agent, Hermes Relay, Hermes Agent) have already monetized. Ranking for the bare word "Hermes" is a near-write-off; ranking for "Hermes Mobile" or "Mac AI agent controller" is a winnable, low-cost fight. -> **Lead title with the differentiator ("Mac AI agent"), not the brand.**
- **Mid-2026 ranking signals are personalization-first**: WWDC 2026 introduced Personalized Collections and App Notes driven by on-device intelligence; Google continues to lean on Android vitals and retention. Both stores now weight relevance and customer satisfaction signals alongside keywords. -> **Optimize for intent match and conversion, not just keyword density.**
- **U.S. Apple Search Ads are affordable for paid utility**: Productivity category averages CPT $1.55 / CPI $3.13 in the US; Utilities $2.90 CPI ([24]). Hermes Mobile at $4.99 paid download has a one-day payback budget at modest spend. -> **Allocate $20-50/day US Search Ads for brand-defense and high-intent terms; never more than CPI exceeds price.**
- **Google UAC economics still favor install campaigns**: average Google Ads CPI sits at $1.50-$4.50 across categories; tCPA bidding with budgets at 10x target CPA outperforms tCPI for utility apps ([19]). -> **Run a single Android UAC action-optimized campaign, not parallel install + engagement.**
- **Zero-review penalty is real but recoverable in 30 days**: App Store average CVR is 25% overall but 8.56% on AppTweak's category-adjusted metric for US Productivity ([68]). Custom Product Pages lift CR by 2.5 percentage points on average ([6]). -> **Use CPPs immediately; aim for at least one organic review via SKStoreReviewController by day 30.**
- **Cursor iOS app is the proof-of-concept**: Anysphere's "Cursor - AI coding agent for big ideas" reached #5 Developer Tools with only 166 ratings and a 4.5 score ([81]). The category tolerates thin-review utility tools when the screenshot story is sharp. -> **Hermes Mobile can copy the screenshot pattern, not the brand.**
- **Trademark walls are enforced**: Apple Guideline 2.3.7 forbids packing metadata with trademarked terms; Guideline 4.1(a-c) prohibits brand impersonation; Google's Impersonation policy can terminate developer accounts ([53]; [78]). -> **Never bid on competitor brand names; never use "Hermes Agent" as a keyword target outside owned creative.**

## 1. Ranking Algorithms: Apple App Store + Google Play (mid-2026)

**Apple App Store Search (iOS 18+/iPadOS 18+)** ranking inputs in mid-2026:

- **Metadata index**: Title, subtitle, and developer keywords are indexed; description text is not. Apple explicitly limits to ~100 chars title (visible ~30), ~30 chars subtitle, and a 100-char keyword field (comma-separated, no spaces after commas, no need to repeat title/subtitle words).
- **Signals**: Tap-through rate from search, install conversion, retention (Day-1/Day-7), ratings velocity, in-app events, and now Personalized Collections relevance (per WWDC 2026).
- **Custom Product Pages (CPP)**: Up to 70 per app; assignable to keywords so the CPP appears in search for that keyword combination ([6]). Apple reports a 2.5-percentage-point average CR uplift (156% relative vs the 1.6% default-page CR).
- **Asset Library (WWDC 2026)**: A centralized creative-asset repository in App Store Connect lets developers preview pages across surfaces ([37]). Visual discovery is now a primary growth lever.
- **Personalized Collections + App Notes**: On-device intelligence picks apps for users; App Notes give context on why a recommendation was made. This shifts ranking weight from raw keywords toward user satisfaction signals.

**Google Play ranking inputs** ([60]; [15]):

- **Metadata index**: Title, short description (80 chars), and full description are all crawled. Google indexes terms across the description but weights the title most heavily.
- **Quality signals**: Android vitals (crash rate, ANR rate, excessive wake locks, battery usage) directly affect visibility. Core vitals influence search rank even for never-launched apps.
- **Engagement signals**: Install velocity (downloads per day per keyword), retention (Day-1, Day-7, Day-30), and rating count/velocity. Slow installs on a new app suppress rank for the first 30-60 days.
- **Custom Store Listings**: Up to 50 per app; can target by country, install state (new vs. returning), search keyword, or pre-registration ([15]).
- **Topic clusters**: Google Play groups apps into thematic clusters (e.g., "AI coding assistant") and ranks cluster fit, not just exact-term matches.

## 2. Competitive SERP Landscape (July 2026)

The category is crowded with five different "Hermes"-named products plus Cursor, Manus, and Claude Code Remote. Key SERP competitors for the priority keywords:

| App | Developer | Platform | Price | Installs / Ratings | Notes |
|---|---|---|---|---|---|
| Hermes AI Agent Leash (Hermes Mobile) | Igor Ganapolsky | iOS + Android | $4.99 (iOS) / Leash Pro $19.99 (Android) | Near-zero ratings | Differentiated: Mac/Win/Linux gateway leash, not phone chatbot |
| Hermes AI: Personal Agent | Ilya Vishneuski | iOS | Free + IAP $19.99 / $199.99 | Not enough ratings | Chatbot-style, "Get your Hermes setup in 1 min" |
| Hermes Agent Android | Hen Works | Android | Free | 10K+ installs, 4.6 | Local on-device AI agent (Nous Research lineage) |
| Hermes-Relay | Axiom-Labs | Android | Free | 500+ installs, 4.2 | "Native Android client for the Hermes agent platform" |
| Cursor | Anysphere | iOS | Free + IAP | #5 Developer Tools, 4.5, 166 ratings | Cloud + desktop agent control from phone |
| Manus AI Agent | Meta/Butterfly | iOS + Android | Free + IAP | Active dev, last update 3 days ago | General-purpose agent |
| HermesPilot / Atomic Hermes / Clawket / Open Agent / OllamaRemote | Various | iOS | Mostly Free + IAP | Thin rating profiles | Niche variants |

**Keyword-targeting matrix**:

| Target keyword | Competitor to beat | Best lever |
|---|---|---|
| Hermes Mobile | Hermes AI: Personal Agent (iOS), Hermes Agent (GP) | Title + subtitle for "Hermes Mobile" exact-match |
| Hermes Agent | Nous Hermes Agent (10K+, 4.6) - DO NOT impersonate | Long-tail only: "Hermes Agent Remote Control" |
| Hermes AI | Hermes AI: Personal Agent (brand-owned) | Differentiator term only |
| Hermes Remote | Hermes-Relay (500+, 4.2) | "Hermes Remote" + "Computer Gateway" |
| AI Agent Leash | None - invented | Strong: empty SERP, own brand |
| Remote AI Agent | Hermes Mobile, Cursor, Manus | CPP per term |
| Mac AI Agent Controller | None - invented | Strong: empty SERP, own brand |
| Claude Code Mobile | Grass, Cursor | Differentiator: Hermes-only vs general |
| Cursor Mobile Controller | Cursor iOS app | Avoid; Cursor owns it |

**Mechanism**: Each competitor's brand-defensible keyword ("Hermes Agent", "Cursor") is owned by name; competitor-listed keywords ("AI Agent Leash", "Mac AI Agent Controller") have no real SERP winner yet. Hermes Mobile should target invented/long-tail terms where its category-defining phrase wins.

## 3. Paid Discovery Economics (July 2026)

**Apple Search Ads US benchmarks (AppTweak, 2026; AppTweak category data, US, June 2026)**:

| Metric | Productivity (US) | Utilities (US) | Global avg | Global utilities |
|---|---|---|---|---|
| CPT | $1.55 | n/a | $0.92 | - |
| CPI / CPA | $3.13 | $2.90 | $1.80 | - |
| TTR (utility) | 11.3% (overall 9.7%) | - | - | - |
| Source | AppTweak 2026 | AppTweak 2026 | Adapty Jun 2026 | - |

Hermes Mobile's $4.99 paid price requires CPA under $3.50 for direct profitability on paid acquisition. Utilities category CPA at $2.90 leaves thin margin; Productivity at $3.13 is break-even. Use tCPA bidding for install-campaign efficiency.

**Google UAC benchmarks (Adapty, Jan 2026)**:

| Metric | Range | Notes |
|---|---|---|
| Average Google Ads CPI | $1.50-$4.50 | Finance/Tech/Gaming $5.00-$10.00+ |
| Average CPA for in-app action | $5.00-$20.00 | Wide variance by category |
| Budget-to-bid ratio | 10x target CPA minimum, 20x optimal | Lower than this caps delivery |
| Initial bid (tCPA) | Set 20-30% above goal, taper down | Standard practice |
| Pre-launch conversion events | 30-50+ daily volume needed | Below this stalls learning |

**Realistic budget to crack top-10**:

- **Brand-defense terms** ("Hermes Mobile Agent", "Hermes AI Agent Leash"): $20-40/day US Apple Search Ads + $20/day Google UAC for 30 days should rank in top-10 organic within 60 days if CR holds at category average.
- **Long-tail invention terms** ("AI Agent Leash", "Mac AI Agent Controller"): $15/day US Apple Search Ads with exact-match keywords; expect top-10 within 90 days due to low competition.
- **Avoid** bidding on "Hermes Agent", "Hermes AI Personal Agent", or "Cursor" as keywords - both trademark risk and conversion risk.

## 4. Zero-Review Paid App Playbook (30-90 days)

**Conversion (screenshots, previews, pricing)**:

- First screenshot must show the gateway computer with the agent's live run state; second should show the approval prompt UI (the differentiator). Apple App Store convention: device bezel + 4-6 screenshots max, top 3 above the fold.
- App Preview video (15-30s) showing pairing -> chat -> approval flow outperforms static-only listings.
- Pricing: stay at $4.99 paid vs raising to $19.99 - the APKPure listing shows Hermes Mobile already positions "Leash Pro $19.99" as a tier; keep base app accessible at $4.99 to maximize funnel volume.

**Review acquisition (StoreKit 2 / SKStoreReviewController)**:

- Apple's SKStoreReviewController is the only Apple-sanctioned mechanism ([51]). In iOS 18+, SKStoreReviewController is deprecated in favor of `RequestReviewAction` SwiftUI view modifier.
- **Policy compliance (Guideline 3.1.1(x))**: Apps "must not force users to rate the app, review the app, download other apps, or other store-related actions in order to access functionality." -> No gating content behind reviews.
- Apple displays the prompt up to 3 times per year per user (Apple's own internal cap), so prompt timing matters: trigger after Day-2 successful use, not on first launch.
- Google's policy: in-app review prompts (Play Core) follow similar rules; no incentives for reviews.

**What moves rank in 30/90 days**:

1. **Days 1-7**: Submit 3 CPPs targeting "Mac AI agent", "Hermes Mobile", "AI coding agent remote"; submit 2 Custom Store Listings on Google Play targeting US/UK/DE.
2. **Days 8-30**: Hit AppTweak's Productivity category CVR benchmark (8.56% US App Store average) - install velocity will begin ranking for top-3 long-tail keywords. Trigger SKStoreReviewController after second successful approval session.
3. **Days 31-60**: Add 2 more CPPs targeting new keywords discovered via Apple Search Ads impressions report. Update screenshots quarterly.
4. **Days 61-90**: Layer in Apple Search Ads brand-defense campaign at $20/day; ramp Google UAC install campaign at $20/day US/CA/UK.

## 5. 30/60/90-Day Plan for Hermes Mobile

| Day | Action | Expected Impact | Confidence |
|---|---|---|---|
| 0-7 | Publish 3 Apple CPPs (Mac AI agent, Hermes Mobile, AI Agent Leash) and 2 Google Custom Store Listings (US/UK). Update title to lead with "Mac AI agent" not "Hermes". | -30 to -60% organic CR loss on cold traffic; +2.5pp CR for targeted keywords | High |
| 7-21 | Install Apple Search Ads exact-match campaign on "Mac AI agent", "AI Agent Leash", "Hermes Mobile" at $20/day US. tCPA bidding at $4 target. | 50-150 installs/day; first conversions in 7-14 days | Medium |
| 21-45 | Trigger SKStoreReviewController in-app after Day-2 successful pairing. Target 5-15 reviews per 1K installs (industry typical for utility). | First organic reviews visible; lifts conversion 1-3pp | Medium |
| 30-60 | Launch Google UAC install campaign at $20/day US, target CPA $5. Bid on Android-vitals-clean traffic only. | 30-100 installs/day Android; cumulative 1.5K-3K installs by Day 60 | Medium |
| 45-75 | Add 2 more CPPs targeting discovered high-CTR terms. Refresh screenshots with app preview video. Add 2 more Custom Store Listings for DE/JP. | Organic reach to long-tail grows; Top-10 ranking for 3+ terms | High |
| 60-90 | Layer branded Search Ads at $20/day for "Hermes Mobile" defense. Refresh Google UAC creative assets quarterly. Convert top-10 organic terms into CPP-targeted variants. | 5-10K cumulative installs; organic search share 25-40% | Medium |

**Differentiation guardrails** (must hold throughout):

- Use the term "Mac AI agent controller" / "Hermes gateway leash" in copy, never "Hermes Agent" alone - the latter is brand-owned by Nous Research (open-source Hermes model + agent harness).
- Never use Claude, Cursor, or other competitor logos in screenshots. Hermes Mobile's own listing correctly disclaims independence from Nous/Anthropic/OpenAI/Google/Cursor/Windsurf.
- Bid only on Hermes Mobile brand variants and invented terms. Apple Search Ads brand-defense for own name is allowed; bidding on competitor trademarks is grounds for ad-account suspension.

## 6. Anti-Patterns (what NOT to do)

| Anti-pattern | Risk | Source |
|---|---|---|
| Keyword stuffing in subtitle / keywords | Apple Guideline 2.3.7: metadata may not contain "trademarked terms, popular app names, pricing information, or other irrelevant phrases just to game the system" - demotion or rejection | [53] |
| Fake reviews / paid reviews | Apple: "manipulating reviews erodes customer trust and is not permitted"; expulsion from Developer Program possible | Apple Guideline 5.x |
| Forced review prompts (gating) | Apple Guideline 3.1.1(x): "apps must not force users to rate the app, review the app, download other apps... in order to access functionality" | Apple |
| Title thrash (rapid rename to chase trends) | Apple's algorithm penalizes frequent metadata churn; in WWDC 2026 Personalized Collections era this disrupts relevance model | Appbot WWDC26 analysis |
| Bidding on competitor brand keywords | Apple Search Ads and Google Ads both prohibit trademark infringement; Apple ad account suspension possible | Apple Search Ads policy |
| Brand impersonation in icon/name | Apple Guideline 4.1(a-c): copying popular apps or using "another developer's icon, brand, or product name" in your own | Apple |
| Google Play impersonation | "Violations may lead to app removal, app suspension, or the termination of the developer account" | [78] |
| Trying to rank for "Hermes Agent" alone | The "Hermes Agent" agent harness is associated with Nous Research (Hermes series of open-source models); using the term creates confusion and likely trademark risk | Nous Research |
| Hidden subscription mechanics | Apple now requires surfacing subscriptions before download (IAP disclosure $19.99/$199.99); hide behind "Pay once $4.99" risks rejection | Apple 3.1.2 |

## Synthesis

**Mechanism vs scope vs trade-offs**:

- **Apple and Google converge on personalization, but diverge on transparency**. Apple's Personalized Collections hide why an app was recommended (only "App Notes" explain); Google's algorithm still surfaces install-velocity metrics to developers via Play Console. Hermes Mobile can A/B test on Google Play more cheaply; Apple requires Custom Product Pages (now 70 max) and Asset Library usage to even probe personalization weights.
- **Brand-adjacent vs long-tail keywords are not symmetric**. "Hermes Mobile Agent" exact-match has one SERP competitor (Hermes AI Personal Agent); "AI Agent Leash" has zero. Bid economics are 5-10x cheaper on the invented term, but conversion volume is lower. The optimal mix is 70% long-tail invention + 30% brand-defense.
- **Apple CPP lift is real but only when CPPs are keyword-targeted**. Apple's own 2.5pp CR lift is measured against default pages; without keyword assignment, CPPs are URL-only and don't enter search ranking. The lift is conditional, not automatic.
- **Cursor iOS is the largest case-study benchmark**: reached #5 Developer Tools with 166 ratings over ~30 days, proving thin-review utility tools can break category charts when screenshots and description tell a sharp story. Hermes Mobile can mirror the same positioning ("AI coding agent for big ideas" -> "Mac AI agent leash for big workflows") without copying verbatim.

**Cross-cutting tensions**:

1. **Apple forces paid pricing disclosure** (IAP $19.99/$199.99 visible on Hermes AI: Personal Agent's listing) but Hermes Mobile's iOS listing says "Pay once $4.99" - this is correct for a paid download but would be deceptive if a hidden IAP appears; maintain transparency to avoid the 3.1.2 risk.
2. **Google Play requires ASO via description text** while Apple forbids stuffing keywords - the same content strategy that ranks on Google can get an Apple app rejected. Hermes Mobile must maintain two metadata variants: keyword-rich description for Google, keyword-clean title/subtitle for Apple.
3. **WWDC 2026 raises visual discovery weight** (Asset Library, Personalized Collections) but Hermes Mobile's iOS listing still ships with no app preview video uploaded - this is the single highest-ROI near-term gap to close.

**Decision-grade recommendation**:

The 30/60/90 plan should be executed with three parallel workstreams: (1) Apple CPPs + Asset Library visual refresh by Day 7, (2) Apple Search Ads brand-defense campaign at $20/day starting Day 7, (3) Google UAC install campaign at $20/day starting Day 30 after Android vitals baseline is established. Differentiation through "Mac AI agent" / "gateway leash" language must be consistent across all surfaces. Avoid all competitor brand bidding. Close the app-preview-video gap as the highest-leverage single action.

## References

1. *ASO Best Practices 2026 - ApsteQ*. https://apsteq.com/blog/aso-best-practices-2026
2. *Support customers with StoreKit 2 and App Store Server API*. https://developer.apple.com/videos/play/tech-talks/10887
3. *ASO for indie developers: Tactics you should master in 2026*. https://www.mobileaction.co/blog/aso-for-indie-developers
4. *StoreKit 2: Advanced In-App Purchases & Subscriptions - Ravi*. https://ravi6997.medium.com/in-app-purchase-strategies-advanced-storekit-2-adaptations-for-subscription-management-6f8538e929f6
5. *StoreKit 2 in 2026: Products, Purchases, and Transaction ...*. https://techconcepts.org/blog/storekit2-guide
6. *Custom Product Pages - App Store - Apple Developer*. https://developer.apple.com/app-store/custom-product-pages
7. *app store ranking algorithm*. https://search.app.goo.gl/?al=googleapp%3A%2F%2Flens%3Flens_data=KAw&amv=301204913&apn=com.google.android.googlequicksearchbox&ct=4815459-oo-lens-isb-bar-lens-cam&ct=4815459-oo-lens-isb-bar-lens-cam&efr=1&ibi=com.google.GoogleMobile&ifl=https%3A%2F%2Fapps.apple.com%2Fus%2Fapp%2Fgoogle%2Fid284815942%3Fppid=1ac8cc35-d99c-4a1d-b909-321c8968cc74&isi=284815942&ius=googleapp&lens_data=KAw&link=https%3A%2F%2Fgoo.gl%2Fiosgoogleapp%2Fdefault%3Furl=googleapp%3A%2F%2Flens%3Fmin-version=180&mt=8&mt=8&ofl=https%3A%2F%2Flens.google&pt=9008&pt=9008
8. *Configure multiple product page versions - Create custom ...*. https://developer.apple.com/help/app-store-connect/create-custom-product-pages/configure-multiple-product-page-versions
9. *WWDC25 | Apple Developer Documentation*. https://developer.apple.com/documentation/updates/wwdc2025
10. *How the App Store Ranking Algorithm Actually Works*. https://mwm.ai/guides/app-store-ranking-algorithm
11. *Google Play Store's Ranking Algorithm Explained - TMS Outsource*. https://tms-outsource.com/blog/posts/google-play-stores-ranking-algorithm
12. *The complete guide to custom store listings on Google Play - AppTweak*. https://www.apptweak.com/en/aso-blog/custom-store-listings
13. *Create custom store listings to target specific user segments - Google Help*. https://support.google.com/googleplay/android-developer/answer/9867158?hl=en
14. *What are Custom store listings in Google Play and how do they work?*. https://appradar.com/blog/what-are-custom-store-listings-in-google-play
15. *Custom store listings | Google Play Console*. https://play.google.com/console/about/customstorelistings
16. *Google Ads Benchmarks for 2026: CTR, CPC & More | Terra*. https://terrahq.com/en/blog/google-ads-benchmarks-2025
17. *Cost Per Install (CPI) Rates (2025) - Business of Apps*. https://www.businessofapps.com/ads/cpi/research/cost-per-install
18. *B2B SaaS Google Ads Stats & Benchmarks for 2024*. https://www.poweredbysearch.com/learn/b2b-saas-google-ads-stats-benchmarks
19. *Google App Campaigns Playbook 2026: Setup and ... Adapty https://adapty.io › Blog › Tutorial*. https://adapty.io/blog/google-app-campaigns-playbook-2025
20. *Google Ads Bid Strategies: Your Ultimate Guide*. https://jyll.ca/insidegoogleads/77
21. *Apple Ads benchmarks 2026: CPT, TTR, CPA, and more across 90 countries - Adapty*. https://adapty.io/blog/apple-ads-benchmarks-2026
22. *Apple Search Ads Benchmarks: CPT, CPI, TTR & ROAS by ...*. https://admiral.media/apple-search-ads-benchmarks
23. *Apple Search Ads Costs (2026) - Business of Apps*. https://www.businessofapps.com/marketplace/apple-search-ads/research/apple-search-ads-costs
24. *Apple Ads benchmarks 2026: CPT, CPI, CR & ROAS by category*. https://www.apptweak.com/en/aso-blog/apple-ads-benchmarks
25. *Apple Ads Cost: How to Evaluate CPT, CPA, CR, TTR - SplitMetrics*. https://splitmetrics.com/blog/apple-search-ads-cost
26. *Hermes-Relay - Apps on Google Play*. https://play.google.com/store/apps/details?hl=en-IN&id=com.axiomlabs.hermesrelay
27. *Hermes Agent | F-Droid - Repositório de apps Android livres e ...*. https://f-droid.org/pt/packages/com.nousresearch.hermesagent
28. *Hermes Agent | F-Droid - Free and Open Source Android App ...*. http://f-droid.org/packages/com.nousresearch.hermesagent
29. *Hermes-Relay - Apps on Google Play*. https://play.google.com/store/apps/details?hl=en-US&id=com.axiomlabs.hermesrelay
30. *Hermes Agent - Android - Apps on Google Play*. http://play.google.com/store/apps/details?hl=en-US&id=com.hermesagent.android
31. *Hermes Agent - Android - Apps on Google Play*. https://play.google.com/store/apps/details?hl=en-US&id=com.hermesagent.android
32. *Hermes Mobile: AI Agent Leash APK for Android Download*. https://apkpure.com/hermes-mobile-ai-agent-leash/com.iganapolsky.hermesmobile
33. *Hermes Mobile Agent - Apps on Google Play*. https://play.google.com/store/apps/details?hl=en-US&id=com.iganapolsky.agentleash
34. *Public: Hermes Mobile is live on Google Play (phone remote ...*. https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/242
35. *Hermes AI: Personal Agent - App Store*. https://apps.apple.com/gb/app/hermes-ai-personal-agent/id6759341434
36. *Hermes AI: Personal Agent - App Store - Apple*. https://apps.apple.com/us/app/hermes-ai-personal-agent/id6759341434
37. *WWDC 2026 App Store Discovery Changes - Appbot*. https://appbot.co/blog/apple-wwdc-2026-app-discovery-updates
38. *Apple's WWDC 2026 App Store changes let independent ... - TNW*. http://thenextweb.com/news/apple-app-store-wwdc-2026-developer-bundles-screen-time
39. *WWDC 2026 App Store updates include subscription bundles ...*. https://mobilesyrup.com/2026/06/09/app-store-wwdc-2026-updates-subscription-bundles-social-media-integration-disclosure
40. *WWDC26 App Store guide - Apple Developer*. https://developer.apple.com/wwdc26/guides/app-store
41. *Manus AI - Apps on Google Play*. https://play.google.com/store/apps/details?hl=en_US&id=tech.butterfly.app
42. *Manus - AI Agent & Automation - App Store - Apple*. https://apps.apple.com/kg/app/manus-ai-agent-automation/id6740909540
43. *Manus AI - Apps on Google Play*. https://play.google.com/store/apps/details?hl=en-US&id=tech.butterfly.app
44. *When can we expect to have native Cursor mobile app? - Feature Requests - Cursor - Community Forum*. http://forum.cursor.com/t/when-can-we-expect-to-have-native-cursor-mobile-app/163824
45. *Claude Code Remote Control*. https://simonwillison.net/2026/Feb/25/claude-code-remote-control
46. *Keyword Stuffing - Fundamentals and Best Practices 2025 SEO-Day https://www.seo-day.de › seo-penaltys › penalty-ursachen*. https://www.seo-day.de/wiki/seo-penaltys/penalty-ursachen/keyword-stuffing?lang=en
47. *The FTC's ban on writing, buying, or selling fake reviews is officially in effect.*. https://www.reddit.com/r/boardgames/comments/1gbfbe4/you_can_now_get_fined_51744_for_writing_a_fake
48. *Keyword Stuffing and Why It Should Be Avoided - SE Ranking*. https://seranking.com/blog/keyword-stuffing
49. *Spam Policies for Google Web Search | Documentation*. https://developers.google.com/search/docs/essentials/spam-policies
50. *Keyword Stuffing As A Google Ranking Factor*. https://www.searchenginejournal.com/ranking-factors/keyword-stuffing
51. *SKStoreReviewController | Apple Developer Documentation*. https://developer.apple.com/documentation/storekit/skstorereviewcontroller
52. *Apple App Store Review Guidelines: Developer Reference 2026*. https://www.apptester.co/blog/app-store-guidelines
53. *App Review Guidelines Apple Developer https://developer.apple.com › app-store › guidelines*. https://developer.apple.com/app-store/review/guidelines
54. *App Store Review Popup: The Developer's Guide to Ratings ...*. https://asomaniac.com/blog/app-store-review-popup
55. *App Review - Distribute - Apple Developer*. http://developer.apple.com/distribute/app-review
56. *App Retention as a Ranking Factor in 2026 | AppDrift*. https://appdrift.co/blog/app-retention-ranking-factor-2026
57. *Google Play Store ranking factors: Ultimate ASO breakdown*. https://www.mobileaction.co/blog/google-play-store-ranking-factors
58. *Google Play ASO: Complete Android Ranking Guide 2026*. https://appmarketingplus.com/google-play-aso-the-complete-android-app-ranking-guide-for-2026
59. *The Google Play Store Ranking Algorithm Explained: How to ...*. https://semnexus.com/the-google-play-store-ranking-algorithm-explained-how-to-boost-your-app-in-2025
60. *Android vitals | App quality | Android Developers*. https://developer.android.com/topic/performance/vitals
61. *Apple Search Ads Benchmarks 2026: TTR, CR, CPT, and CPI by ...*. https://sparrowapps.io/articles/apple-ads-benchmarks
62. *Apple Search Ads Guide: How to Win With Your App in 2026 - SplitMetrics*. https://splitmetrics.com/blog/apple-search-ads
63. *http://linkedin.com/company/nousresearch*. http://linkedin.com/company/nousresearch
64. *App Store Conversion Rate Benchmarks (2026) - Kirro*. http://kirro.io/app-store-conversion-rate
65. *Conversion Rate Benchmark for App Store and Google Play ⭐*. https://appfollow.io/benchmark
66. *Mobile App Conversion Rate Benchmarks & Tips for 2026*. http://uxcam.com/blog/mobile-app-conversion-rate
67. *2025 Complete App Store Screenshot Optimization Guide: 10 ...*. https://appcub.io/blog/app-store-screenshot-best-practices
68. [Average App Conversion Rate per Category [2025] - AppTweak](https://www.apptweak.com/en/aso-blog/average-app-conversion-rate-per-category)
69. *Claude Code Remote Control Competitors & Alternatives (2026 ...*. https://www.producthunt.com/products/claude-code-remote-access/alternatives
70. *Cursor for iOS: Run AI Coding Agents From Your Phone*. https://byteiota.com/cursor-ios-app-ai-coding-agents-mobile
71. *The iOS App That Drives Coding Agents from Your Phone*. https://pasqualepillitteri.it/en/news/7191/cursor-ios-app-coding-agents
72. *Cursor now has an iOS mobile app*. https://www.reddit.com/r/cursor/comments/1uiyj20/cursor_now_has_an_ios_mobile_app
73. *Grass: Gives your coding agent a dedicated VM that's ...*. https://www.producthunt.com/products/grass-claude-code-from-your-phone
74. *Impersonation policy rejection despite signed authorization ...*. https://support.google.com/googleplay/android-developer/thread/448982784/impersonation-policy-rejection-despite-signed-authorization-from-trademark-owner?hl=en
75. *Guidelines for Using Apple Trademarks and Copyrights*. https://www.apple.com/legal/intellectual-property/guidelinesfor3rdparties.html
76. *Developer Policy Center - Google Play*. https://play.google/developer-content-policy#!?modal_active=none
77. *Intellectual Property - Legal*. https://www.apple.com/legal/intellectual-property
78. *Impersonation FAQs - Play Console Help*. https://support.google.com/googleplay/android-developer/answer/16341334?hl=en
79. *‎Hermes AI Agent Leash App - App Store*. https://apps.apple.com/us/app/id6786778037
80. *‎Hermes AI Agent Leash App - App Store*. https://apps.apple.com/us/app/hermes-mobile-ai-agent-leash/id6786778037
81. *‎Cursor App - App Store*. https://apps.apple.com/us/app/cursor/id6767085653
