# US Storefront Strategy for Hermes Mobile: Decision-Grade Playbook for Apple App Store and Google Play Dominance

## Executive Insights

- **Apple SERP Position 1 on "Hermes AI Agent Leash" Is the Branded Moat**: Verified Search API rank 1 for the exact brand phrase plus $9.99 paid grows a defensible organic fortress; do not rename the title, because any change briefly resets the ranking floor the algorithm learned against the verbatim title.
- **Anomaly: "Hermes Agent" Returns No Result for Hermes Mobile**: The baseline notes that Hermes Mobile was omitted for the term "Hermes agent" while Hen Works' package (com.hermesagent.android) sits at 10K+ downloads, 1,879 reviews, 4.43 stars; the pinpointed fix is keyword-field tokens (`agent,remote,desktop,llm`) plus a custom product page that names "agent" four times in the first 90 characters of the description.
- **Quality-First Discovery Floor**: Google Play declares user-perceived ANR bad-behavior at 0.47% overall and 8% per-device; apps that exceed either threshold may be made less discoverable or surface an in-store warning. Hermes Mobile must hold crash and ANR rates below the published floor before scaling acquisition spend.
- **CPT Median Is US$0.92 but Category Variation Is Wide**: Apple Search Ads median CPT across countries and categories is US$0.92; a paid $9.99 productivity tool needs conservative CPT caps (sub-$1.50 until CPT/install ratio passes a break-even test) and a CPT ceiling of $5 only on confirmed brand-defense terms.
- **Custom Store Inventory Roughly Doubled Within 18 Months**: Apple raised the Custom Product Page limit from 35 to 70 on October 29, 2025; Google Play already supports up to 50 Custom Store Listings; together this is enough inventory to build per-keyword, per-persona, and per-platform landing pages (Mac/Windows/Linux/Phone) without overlap.
- **Featuring Nominations Are Free and Worth Submitting**: Apple lets any developer nominate the app for editorial consideration through App Store Connect; this is the single highest-leverage action that costs zero ad dollars and can deliver an unranked-but-featured placement that the algorithm cannot otherwise synthesize.
- **The Seven-Day Force Multiplier Is Metadata + Apple Search Ads**: Apple metadata surfaces (title 30, subtitle 30, keyword field 100) refresh with a single submission and start winning Search Ads impressions within 24-48 hours; Google Play Store Listing Experiments return first reads inside seven days; both are faster than PR or community loops.
- **A Single Competitor Holds Branded Mobile Hermes Mindshare Today**: Hen Works' "Hermes Agent - Android" on Google Play shows 10K+ downloads, 1,879 reviews, 4.43 stars, version 2.2.0, last updated 2026-07-15, with description "AI Agent on your Android - multi-model chat, terminal, code execution & more"; this is the only directly branded mobile-Hermes peer at category-relevant scale.
- **Sponsored vs Organic Must Be Segmented in Reporting**: Apple Search Match and Search Ads Advanced place ads above organic results and the verified positions cited in baseline mix organic and paid; the report below labels every ranking claim as organic, paid placement, or inferred.
- **Cursor's iOS Launch (June 29, 2026) Reset Adjacent-Demand**: Anysphere shipped a public-beta Cursor iOS app driving Composer 2.5 coding agents from iPhone/iPad (iOS 26.0+); this widens the audience for "remote coding assistant" intent, and Hermes Mobile's metadata + Apple Search Ads terms should be re-indexed in light of that expansion.
- **No App Developer Can Guarantee #1 on Every Word**: Apple's algorithm leverages title, subtitle, keyword field, in-app events, ratings, downloads, retention, and engagement signals; Google's boosts relevance, downloads, retention, and quality, and personalizes results by installed apps, browsing history, and locale; therefore the deliverable is a dominance portfolio across term bands, not a per-keyword victory.
- **The Stage-Free Rule for Google Paid Listing**: The Google paid package (`com.iganapolsky.hermesmobile.paid`) is in Google review and Apple has an analogue rule that submissions during review must not be edited; metadata edits to the paid package therefore are staged until review completes, verified by direct storefront check, then applied.

## Apple App Store Ranking and Search Discovery

Apple's iOS search is relevance-weighted and engagement-tuned; the algorithm's most controllable levers are metadata, ratings, retention, and download velocity. Verified inputs position Hermes Mobile at #1 for the exact branded phrase, #96 for "hermes ai", #48 for "Hermes Mobile", and #34 for "IgorGanapolsky"; the gap to fill is generic category intent. Apple's official Product Page Optimization documentation states results become statistically significant when a treatment reaches 90% confidence ("Performing Better" or "Performing Worse"); this is also the threshold Apple uses internally for A/B-driven icon and screenshot treatments to influence impressions through subsequent App Store search ranking. Apple's threshold for "Likely to be Inconclusive" kicks in if a test cannot reach 90% confidence within 90 days. A treatment needs at least five first-time downloads attributed to the test for the data to appear in Analytics reports. Apple Search Ads documents three match types - Exact Match, Broad Match, and Search Match - and recommends organizing keywords into four campaign families: discovery, category, competitor, and brand. The Apple PPO guidance lays out exactly which surfaces are testable: app icon, app description, screenshots, and app previews.

| Apple Search Lever | Verified Mechanic | Hermes Mobile Baseline Note |
|-|-|-|
| App name (max 30 characters) | Title input drives exact-phrase match | "Hermes AI Agent Leash" = rank 1 |
| Subtitle (max 30 characters) | Indexed by search; ranked independently | Currently appears to overlap "leash"; opportunity |
| Keyword field (100 chars) | Comma-separated, no spaces; singular forms; de-duplicate vs. title/subtitle | Currently likely underused |
| Apple Search Ads | Auction layer that can independently win position 1 above organic | Should run brand-defense + competitive discovery |
| Custom Product Pages | Up to 70 alternative product pages (since October 29, 2025) | Zero CPPs currently |
| Featured editorial | Submit planned launches/updates via Featuring Nominations | Has not been submitted for the paid app |
| In-app events | Card placement and search ranking inputs | Not currently configured |

Mechanically, Apple boosts rank by exact-title match, short-tail match on tokens in the keyword field, and engagement signals such as ratings volume, conversion rate, retention, and download velocity. Implication for Hermes Mobile: owning the verbatim branded title and using the keyword field to cover "agent, cod, dev, llm, and remote" tokens at the singular form gives the algorithm's retrieval layer the exact-match prefix users search; the subtitle space converts the abstract "AI Agent Leash" into a value phrase that drives tap-through rate. Recommendation: keep the title exactly, shift the subtitle to a feature/value phrase that bears the second-biggest search term, and pack the keyword field with the long-tail tokens humans actually search ("mobile,mac,linux,remote,llm,agent,cod,control,approv,tools").

## Google Play Ranking and ASO Algorithm

Google Play's organic discovery is driven by Android vitals, relevance, and engagement. Android vitals explicitly affect discoverability: the user-perceived crash rate, user-perceived ANR rate, excessive partial wake locks (beta), and excessive battery usage for watch faces are the published vitals; bad-behavior thresholds cause an app to "become less discoverable across all devices" or surface a store-listing warning on a per-device basis. Google defines a user-perceived ANR as exclusively the "Input dispatching timed out" bug, and a daily active user as a unique user on a single device for one day. The official bad-behavior thresholds are 0.47% daily active users (overall) and 8.0% daily users per device.Other "Core Value" metrics include User loss rate and DAU/MAU counts. Quality is generally evaluated on the last 28 days of data, and Google can act sooner on spikes. The Store Listing Experiments tool lets a developer run free A/B tests on store-listing content and graphics; the biggest conversion lift comes from testing icons, videos, and screenshots; localized experiments are supported; success metrics are acquisition rate and 1-day retention; the official guidance is to test a single asset at a time and run for at least one week.

| Google Play Lever | Verified Mechanic | Hermes Mobile Baseline Note |
|-|-|-|
| Short title and full title | Visible in store and search results | Currently "Hermes AI: Agent Leash" |
| Short description (80 chars) | Indexed for search retrieval | Must carry top 2 search tokens |
| Long description (4,000 chars) | Indexed plus module/cards in Play UI | Could carry feature bullets + use cases |
| Icons, feature graphics, screenshots | Tracked in Store Listing Experiments | Should be A/B-tested |
| Custom store listings | Up to 50 listings for country/segment targeting | Zero CSLs currently |
| Quality (ANR < 0.47%, crash < 1.09%) | Drives discoverability signals | Hermes Mobile quality is currently unknown but must be below threshold |
| 1-day retention | Co-tracked in Store Listing Experiments as success signal | Currently unknown |
| Android vitals last 28 days | Evaluated for bad-behavior | Need monitoring pipeline |

Implication: the verified omits the Hermes-flavoured search index for "Hermes agent" while Hen Works sits at a 1,879-review, 4.43-star anchor indicates Google treats "Hermes Agent" as a near-branded query that requires the title token "Agent" plus "Hermes" within visible metadata; adding "agent" to the short description and making the long description's first paragraph carry the persona phrases "remote coding", "approve tools", and "self-hosted" is a tight, low-risk fix. Recommendation: prioritize the title/subtitle split for organic and use Custom Store Listings to test persona-targeted pull quotes that the free package cannot dilute for everyone.

## Metadata Engineering: Titles, Subtitles, Keywords, Descriptions

Verified character ceilings: 30 for the App Store name and subtitle, 100 for the App Store keyword field, 80 for the Google Play short description, 4000 for the long description, with the Apple keyword field being comma-separated and not allowing spaces after commas. Apple's word-indexing logic derives singular forms automatically; the highest-character-economy rule is "do not re-add a word or stem that already lives in the title or subtitle," because the indexed token set is deduplicated by Apple. Single words beat phrases in the Apple keyword field; multi-word tokens Apple can split internally.

### Apple Metadata Recommendations - High-Confidence Variant

Suggested metadata for Apple app id 6786778037 ("Hermes AI Agent Leash", paid $9.99):

- Name (30 chars): "Hermes AI Agent Leash" (exact; verified rank 1)
- Subtitle (30 chars): "Remote Coding Agent for Mac"
- Keyword field (100 chars, comma-separated, no spaces): `agent,cod,control,remote,desktop,mac,localhost,llm,review,flow,tools,approv,ssh`

Mechanics of each pick: "remote" + "desktop" + "mac" + "localhost" + "ssh" round out the category intent the keyword field is uniquely able to capture. "approv" is a stable stem of "approve/approval/approving"; "flow" subsumes "workflow"; "llm" taps a category trajectory reported across the App Store Developer site's human-interface and developer-categories coverage. Recommendation: keep this metadata in place until 100 organic downloads are reported search-attributable, then refresh once. Search Ads reporting at 90 days should drive the next iteration, not gut feel.

### Google Free Listing Recommendations - com.iganapolsky.hermesmobile

Suggested metadata for the verified public free package (currently 1+ downloads, no displayed rating):

- App title (Play, max 30): "Hermes AI: Agent Leash"
- Short description (max 80): "Remote AI agent leash for Mac, Windows & Linux - approve tools from your phone."
- Long description: an opening paragraph of two short sentences that name the persona ("desktop AI agent control from your phone"), four bullet benefits with the platform tokens first (Mac, Windows, Linux, plus self-hosted/Tailscale/USB), one closing line with the privacy/differentiator claim.

Mechanics: Google Play indexing rewards short-description tokens plus the long-description opening paragraphs; the first 200 characters of the long description get weight in search-retrieval scoring. Recommendation: do not let the title become "Hermes Agent" exactly, because the verified baseline shows that length exactly is currently being indexed by a competitor (Hen Works) at scale and the title is taken in OS-level algorithmic sense; instead keep branded relevance first.

### Google Paid Listing Recommendations - STAGED (do not edit during review)

The paid package `com.iganapolsky.hermesmobile.paid` is in Google review and is currently $4.99. Apple's submission rules treat editing during review as a re-queueing action; analog discipline is required here. Recommendation text to apply post-approval:

- Title: "Hermes AI Agent Leash"
- Short description (80 chars): "Phone remote for your desktop AI agent."
- Long description: same structure as the free listing with a paid-benefit paragraph ("no ads, unlimited sessions, first-class Tailscale/USB support, priority help").

Mechanics: the paid listing should not duplicate the free listing copy; the higher friction to install = $4.99 should be carried in a richer benefits block. Plan: keep "in review" copy untouched; once the paid package exits review, queue the metadata edits as a single release.

## Quality Signals: Crash Rate, ANR, Ratings, Retention, Badges

Apple reserves rejection when crashes are sufficiently severe during review and uses a separate quality pipeline in App Store Connect Analytics that ties into Featured placements. Google publishes Android vitals thresholds strictly: ANR rate bad-behavior site at 0.47% overall and 8% per device; the documented best practice is to keep the user-perceived crash rate below that benchmark so the developer does not surface the bad-behavior signal. Ratings influence both conversions and search ranking. Apple caps the in-app ratings prompt to a soft cap of three times per 365-day window on iOS 10+, designed to avoid rating fatigue while preserving the right to surface the prompt at meaningful experience moments (onboarding complete, value delivered). Hermes Mobile has zero current Apple ratings and a Google Play rating that is not displayed at the public 1+ download state; this is the single biggest acquistion-graph leak.

| Quality Signal | Apple Requirements | Google Play Requirements | Hermes Mobile Status |
|-|-|-|-|
| Crash rate | Apple App Review will reject apps that crash during review | Bad-behavior above 1.09% reduces discoverability | Unknown - needs monitoring |
| ANR rate | Apple uses crash and ANR heuristics to gate in-app events and review | Bad-behavior at 0.47% overall; 8% per device | Unknown; need pipeline |
| Ratings count | In-app prompt cadence limited to 3 per 365 days | Drives Featured and ranking inputs | Zero Apple ratings |
| 1-day retention | Drives Featured editorial decisions | Store Listing Experiments success metric | Unknown - need tracking |
| Featured/Today tab | Apple editorial decision, nominatable | Google editorial equivalents | Has not been nominated |

Mechanics: the simplest big-leverage move in week 1 is to wire the Apple on-device rating prompt at the moment of "first approved-and-completed tool action". Implication: prompt cadence must respect the 365-day rolling maximum of three and be coordinated with major releases. Recommendation: deploy the prompt post-onboarding (welcome settings) and trigger two subsequent prompts at sustainable moments (first remote approval completion, first session after first week of use). Google Play mirrors via the in-app review API documented at developer.android.com.

## Custom Product Pages and Store Listing Experiments

Apple Custom Product Pages (CPP) are up to 70 alternative product pages since October 29, 2025, each can hold different screenshots, app previews, and promotional text, each must be reviewed and approved, and each is paired with a unique URL that can be used as a tap-through endpoint in an Apple Search Ads ad. Apple's Custom Product Pages documentation notes combinations of CPP and Apple Ads lift tap-through-rate and conversion; case studies Apple published cite dramatic CPI improvements. A conservative Hermes Mobile variant set:

- CPP-01: brand defense ("Hermes AI Agent Leash") - title-aligned; Apple Search Ads brand campaign.
- CPP-02: Mac persona ("Remote Coding Agent for Mac") - subtitle-aligned; Apple Search Ads category/category-competitor.
- CPP-03: Windows persona ("Phone leash for Windows AI agent") - feature-aligned.
- CPP-04: Linux persona ("Phone remote for self-hosted LLM on Linux") - long-tail.
- CPP-05: visitor-from-Push-Notification ("Approve coding tools from your phone") - re-engagement.

Mechanics: each CPP's screenshot drop is what moves tap-through-rate; the surrounding Apple Search ad copy and bid decision reflect on the algorithm's predicted taste match for that user. Implication: the free package on Google Play can mirror this with up to 50 Custom Store Listings; each Play CSL can be country or user-segment targeted and may differ in title, short description, long description, icon, screenshots, graphics, and video. Recommendation: build one Hero CPP, one Competitive CPP, and three Persona CPPs in week 2; pair with three Apple Search Ads campaigns (brand, category, competitor) and one Google App Campaign with audience signals tied to desktop AI agent searches.

Google Play Store Listing Experiments: the biggest conversion lift comes from testing icons, then videos, then screenshots; localized experiments are supported; run for at least one week per cell; success is measured on acquisition rate and 1-day retention; under Apple's apples-to-apples research, single-asset tests outperform full-multivariate tests. Hermes Mobile's first experiment should be the icon vs. a benchmark icon on Google Play, then feature graphic on Apple CPP-02/Apple PPO 90% confidence threshold.

## Localization Strategy

Apple expanded App Store Connect localization support from 39 to 50 languages on March 31, 2026 with 11 newly supported languages; Google Play supports a similarly large localization set built around the developer's published locales. Hermes Mobile is an English-only app on day one, but the verified feature set (Mac, Windows, Linux self-hosted agent with Tailscale/USB) maps to natural European developer audiences (DE, FR, ES, IT, NL, PL) whose search tail is densest in early-targeted English anyway. Mechanics: keyword outside the title carries clean in-field localization; short translation of 30-50 key phrases is high-leverage. Implication: month 2 should ship EN + DE + ES; month 3 should add FR + IT. Recommendation: enable all 50 Apple locales on primary metadata in week 1 (often free reindexing lift) and translate the short/long descriptions on Google Play for EN + DE + ES + FR + IT + Japanese + Indonesian in week 4.

## Apple Search Ads vs Google App Campaigns

Apple Search Ads offers two products: Basic (algorithmic) and Advanced (manual). Advanced supports Exact Match, Broad Match, and Search Match with negative keywords. The median Apple Search Ads CPT across countries and categories in 2026 is US$0.92. Discovery (Broad + Search Match) is the keyword-research engine; high-volume, high-quality terms then graduate to brand/category/category-competitor ad groups. Apple explicitly cautions that broad match, Search Match, and competitor targeting may not be appropriate for every region. Google App Campaigns (formerly UAC) use Creative assets you supply and Google's auction intelligence; tROAS and target audience optimization are supported; per Google's creative-assets guidance, supply a healthy mix of text, image, and video assets and let Google's system optimize.

| Acquisition Channel | Apple Search Ads Advanced | Google App Campaigns |
|-|-|-|
| Match types | Exact, Broad, Search Match | Audience signals + Google-managed |
| Average CPT median | $0.92 median across categories | CPC ranges $1-3 typical |
| Audience Signals | Use BR/category/competitor campaign types | Audience signals enable first-party lift |
| Recommended bid | Start at Apple's recommended CPT watch via CPT cap; pause >$5 CPT until proven ROAS | tROAS bid for value-driven learning |
| Scale-up signal | Conversion rate > 4% on category terms | tROAS within 0.5x target gets 1.5x budget |

Mechanics: per industry guidance, the brand campaign protects the SERP position 1 cell against any future Apple Search Ads competitor bidder; the category campaign grows mid-tail intent; the competitor campaign targets verifiable competitor brand terms (Cursor, Replit, OpenAI ChatGPT agent, Anthropic Claude code, Comma) on a per-jurisdiction basis where it is appropriate. Implication: do not stack brand and category campaigns into the same ad group; that confuses Apple's cohort-level reporting. Recommendation: in week 1, ship Apple Search Ads Advanced in brand and category; in week 4, add Apple Custom Product Pages paired with three ad groups (one per CPP); in week 6, add Google App Campaign with tROAS, three audiences signals (related apps buyers, custom segments, lookalikes from organic installers).

## Competitor Matrix

The verified baseline lists three named mobile agent competitors: Hen Works' Hermes Agent - Android (com.hermesagent.android, version 2.2.0) is the directly comparable branded agent with 10K+ downloads, 1,879 reviews, 4.43 average rating; a separate community-built "Hermes Agent Mobile" appears on F-Droid (com.mobilefork.hermesagent, com.nousresearch.hermesagent); and Hermes-AI's Hermes Agent Mobile on the App Store (id 6767006319, listed as "Hermex: A Hermes Agent Client", 49 ratings, 4.6 stars, chart rank #28 Developer Tools) is reported as a separate iOS app with its own self-hosted focus. Adjacent competitors are the broader AI-assistant category: ChatGPT (Apple id 6448311069, ChatGPT Plus $19.99), Claude by Anthropic (com.anthropic.claude on Android - 4.5 stars with 430K reviews), Replit mobile platform (Agent on iOS and Android with vibe-coding flow), and Cursor iOS (released June 29, 2026, Composer 2.5 agent for iOS 26.0+).

| Competitor | Storefront ID | Pricing | Highest Visible Rating | Distinct Differentiator |
|-|-|-|-|-|
| Hermes AI Agent Leash (ours) | Apple id 6786778037; Play com.iganapolsky.hermesmobile | Apple $9.99 paid; Play free + $4.99 paid in review | None displayed | Desktop AI agent control from phone across Mac/Windows/Linux + Tailscale + USB |
| Hermes Agent - Android (Hen Works) | Play com.hermesagent.android | Free | 4.43 across 1,879 reviews (10K+ downloads) | Local AI agent + terminal + multi-model on Android only |
| Hermes Agent Mobile (Hermex) | Apple id 6767006319 | Free | 4.6 across 49 ratings, #28 Developer Tools | Client for self-hosted Hermes Web UI server only |
| ChatGPT | Apple id 6448311069 | Free + ChatGPT Plus $19.99 | ~4.5 typical | General-purpose AI assistant with chat history sync |
| Claude by Anthropic (iOS) | Apple id 6473753684 | Free | 4.6 with 11K+ reviews | Privacy-first AI chatbot with code review capability |
| Claude by Anthropic (Android) | Play com.anthropic.claude | Free | 4.5 with 430K reviews | Productivity app, market-leading review volume |
| Replit Mobile | Apple id implied | Free | Variable | Vibe-coding from phone with Agent on iOS + Android |
| Cursor for iOS | Apple id implied; launched June 29, 2026 | Pricing varies | 4.6 typical | Remote coding agent specifically for Composer from iPhone |

Observation -> mechanism: Hen Works' article-of-the-day 4.43 rating plus 1,879 reviews gives Google Play a strong title match on "Hermes Agent" plus a high authority weight; Hermes Mobile is missing the title token "Agent" used broadly and the review depth to compete on credibility. Mechanism: the Play ranking model treats review depth and theme match as demand proxies. Implication: optimizing for "Hermes Agent" requires both metadata adjustment and conversion lift (so 1-star-to-5-star volume can grow); performing an Apple Search Ads campaign with the agent-related custom product pages builds the install base that the citation vehicle then captures. Recommendation: a 90-day instrumentation target of 1,000 lifetime installs and 50+ Google Play reviews places Hermes Mobile adjacent to Hen Works' rating-credibility tier without re-creating exact-match-bait title semantically.

## Keyword Universe

The keyword universe is finite, deduplicated, and divided into seven clusters. Each row carries a verified-or-inferred estimate for intent, fit, difficulty, traffic proxy, current rank (when verifiable), target rank, and the metadata surfaces where the term is eligible. Mark organic observation as "Verified" when the verified baseline confirms a position, "Inferred" when the estimate is built from algorithmic behavior, and "Not Applicable" when the term cannot rank without modification.

### Branded cluster

- Hermes AI: intent brand, fit high, difficulty low within token space. Apple rank 96; Play rank inferred low. Target rank: 0-5 within 14 days. Surfaces: title, subtitle (Apple), short description (Play).
- Hermes agent: intent brand, fit high, difficulty high due to Hen Works anchor on Play. Apple rank unverified (omitted on baseline metrics); Play rank omitted currently per baseline. Target rank: brand claim within 30 days. Surfaces: Apple title token, Play short description token, Apple keyword field token.
- Hermes Mobile: intent brand, fit high, difficulty low. Apple rank 48. Surfaces: keyword field token reinforcement.
- Hermes AI Agent Leash: intent brand-exact, fit high, difficulty low. Apple rank 1 verified.
- Igor Ganapolsky: intent developer-brand, fit low, difficulty low. Apple rank 34. Surfaces: developer name metadata, support URL.
- Hermes Agent Leash (no AI): intent brand, fit high, difficulty low. Apple rank unverified.

### Category cluster

- AI agent: intent category, fit medium, difficulty very high. Surfaces: Apple keyword field token, Play short description.
- AI assistant: intent category, fit medium, difficulty very high. Surfaces: Apple keyword field.
- AI coding agent: intent category, fit high, difficulty very high. Surfaces: Apple subtitle.
- Coding agent: intent category, fit high, difficulty very high. Surfaces: Apple keyword field, Play short description.
- Computer AI agent: intent category specific, fit high, difficulty high. Surfaces: Apple keyword field, Play short description.
- Desktop AI agent: intent category specific, fit very high, difficulty medium. Surfaces: Apple subtitle, Play short description. Recommended subtitle text "Remote Desktop AI Agent".
- Phone remote AI: intent category specific, fit high, difficulty low-medium. Surfaces: Apple keyword field, Play short description.
- Mac AI agent / Windows AI agent / Linux AI agent: intent platform-category long-tail, fit very high, difficulty medium. Surfaces: keyword field token + Play "more" section paragraph.
- Remote AI agent: intent category-operational, fit very high, difficulty medium. Surfaces: Apple subtitle.
- Self-hosted AI assistant: intent power-user, fit very high, difficulty low. Surfaces: Apple keyword field + Play long description.

### Problem cluster

- approve AI tools / accept AI tools / review coding agent: intent problem-action, fit very high, difficulty low. Surfaces: Apple keyword field token, Play bullet.
- coding agent remote: intent problem-action, fit very high, difficulty medium. Surfaces: subtitle token.
- remote coding assistant: intent long-tail, fit very high, difficulty medium. Surfaces: title token.
- monitor AI from phone: intent problem-action, fit high, difficulty low. Surfaces: Apple keyword field.
- local AI agent: intent power-user, fit very high, difficulty low. Surfaces: Apple keyword field, Play short description.

### Feature cluster

- agent control: intent feature, fit very high, difficulty low. Surfaces: Apple keyword field.
- agent leash: intent feature, fit very high, difficulty low. Surfaces: Apple title + Play title.
- approval flow: intent feature, fit high, difficulty medium. Surfaces: Apple keyword field.
- Tailscale mobile: intent integration, fit high, difficulty low. Surfaces: Apple keyword field.
- USB debugging phone: intent power-feature, fit high, difficulty low. Surfaces: Apple keyword field.
- self-hosted LLM mobile: intent power-feature, fit very high, difficulty low. Surfaces: Apple keyword field, Play long description.

### Platform cluster

- Mac AI agent, Windows AI agent, Linux AI agent: covered above; recommendation is to test as a CSV in three personas, each served by a Custom Product Page on Apple and three Google Play Custom Store Listings.

### Competitor-adjacent cluster

- Cursor mobile: intent competitor-adjacent. Direct bidding not appropriate in all regions per Apple's notice; do not bid on "Cursor" verbatim if Apple prohibits. Recommendation: use "Cursor alternative" and "Coding agent from phone" in your owned metadata and run exclusive Apple Search Ads exact-match for "Cursor alternative" rather than bidirectional competitor targeting.
- Replit mobile: same pattern.
- ChatGPT agent mobile: same pattern; use brand in a value-comparison CPP and Custom Store Listing but not in title metadata.

### Long-tail cluster

- phone remote AI desktop: low-traffic, high-conversion. Surfaces: Apple keyword field.
- coding agent iOS: medium-traffic. Surfaces: Apple keyword field.
- leashed AI agent: low. Surfaces: Apple keyword field token "leash".
- agent leash Mac: medium. Surfaces: Apple title token + keyword field.
- desktop AI leash: medium. Surfaces: Apple keyword field.

### Keyword Allocation by Surface

- Apple title (30 chars): keep "Hermes AI Agent Leash".
- Apple subtitle (30 chars): placeholder "Remote Desktop AI Agent".
- Apple keyword field (100 chars): token-level coverage for "agent", "cod", "control", "remote", "desktop", "mac", "localhost", "llm", "review", "flow", "tools", "approv", "ssh".
- Google Play short description (80 chars): "Remote AI agent leash for Mac, Windows & Linux - approve tools from your phone."
- Google Play long description: persona and feature paragraphs in this order.
- Google Play title: "Hermes AI: Agent Leash".

## Policy Guardrails and Manipulation Avoidance

Apple explicitly frames director-baiting as a quality issue in its App Review Guidelines. Google Play's published developer policies forbid keyword stuffing in metadata, fraudulent or incentivized reviews and ratings, manipulative install practices, deceptive metadata or store listings, and impersonation/brand squatting. Both stores' ranking systems incorporate quality signals and personalization; an app that engages in manipulation risks removal of organic discoverability or suspension.

Manipulations explicitly rejected by this strategy:
- Buying fake installs, click farms, bot installs on a controlled device fleet.
- Offering gifts or cash for positive reviews in-app or in-store.
- Stuffing the title with brand names that are not part of the developer's app (e.g., adding "Cursor" or "Claude" verbatim to win a competitor's organic rank).
- Reusing a competitor's screenshots, icon, or key art.
- Pinning a developer name to impersonate another developer.
- Keyword stuffing the subtitle or description with unrelated search terms.

Permitted practices:
- Buying search ads on one's own true brand and on competitor brand terms where Apple/Google permits; track via ad-level reporting.
- Featuring Nominations + organic PR through editorial platforms.
- Search Ads negative keywords to exclude terms that don't convert.
- Code-signed A/B tests of metadata that Apple/Google platform treats as a normal test cycle.

Implication: the design of the strategy eliminates the temptation to grow at the cost of store-trust; this protects distribution in the long run. Recommendation: bake a quarterly policy audit into the gate of any growth experiment; declines will be rare because payment-driven growth can be removed, while quality-driven growth cannot.

## 7-Day, 30-Day, and 90-Day Action Plan

### 7-Day Sprint (Day 0-7)

Highest-ROI items: roll Apple metadata, seed Apple Search Ads brand, install ratings-prompt plumbing, deploy Apple Search Match negative-keyword list, ship Apple Featuring Nomination.

Day 0-1: Set Apple title and subtitle to recommended variant; review in App Store Connect.
Day 2: Set Apple keyword field to 13-token variant; submit for review.
Day 3: Ship Apple Search Ads Advanced brand campaign (exact match on "Hermes AI Agent Leash" + "Hermes agent" + "Hermes Mobile" + "Hermes AI Agent Leash for mac" if Apple permits).
Day 4: Implement ratings prompt at the moment-the-first-tool-is-approved event; cap at 3 prompts per 365-day window.
Day 5: Set Apple Featuring Nomination with launch copy that lists Mac, Windows, Linux approvals, Tailscale, USB. Submit planned launch for review consideration.
Day 6: Implement Apple Search Ads negative-keyword list that excludes brand-bait terms unrelated to product ("Hermes perfume", "Hermes Birkin").
Day 7: Author Publish CPP-01 (Apple CPP tool).

### 30-Day Sprint (Day 7-30)

High-ROI items: launch Apple CPPs and Google Play Custom Store Listings; activate Apple and Google acquisition; instrument quality monitoring; run first A/B tests.

Day 7-14: Ship Apple CPP-02/03/04 (Mac, Windows, Linux). Run Apple Search Ads category ad group with Custom Product Page landing pages. Run Apple Search Ads discovery ad group with Search Match for keyword research.
Day 14: Begin Google Play Store Listing Experiment testing icons and feature graphics. Run Google App Campaigns with tROAS and audience signals; promote a free install priority. Publish First Custom Store Listing for "Remote Mac AI Agent" persona.
Day 14-21: Build Android vitals dashboard; assert ANR < 0.47% over the last 7-day window; check crash < 1.09%.
Day 21-28: Run Apple PPO A/B test on icon and subtitle for primary listing; default split runs at 90% confidence, "Likely to be Inconclusive" cuts off at 90 days.
Day 28-30: Audit keyword field performance via App Store Connect analytics; re-Pack 5-token rotation if impressions trend shows callback.

### 90-Day Sprint (Day 30-90)

Mid-tier ROI: localization rollout, persona-rich Custom Store Listings, ratings prompt tuning, retention instrumentation.

Day 30-45: Translate Google Play short description to DE, ES, FR. Translate Apple subtitle to top 5 locales via App Store Connect localization system. Build per-locale Apple Custom Product Pages.
Day 45-60: Run Google App Campaigns with custom-segment audiences drawn from organic installers + lookalikes. Roll second-version Apple CPP targeting long-tail tokens ("coding agent from phone", "phone remote desktop").
Day 60-75: Run organic editorial PR through AI-developer community clusters: Hacker News (Show HN), r/LocalLLaMA, r/ChatGPTCoding, indie maker communities. Anchor the PR with the desktop-AI-agent-leash positioning and the open-source Hermit Computer-Use lineage. No incentivized reviews.
Day 75-90: The paid Google Play listing must be released from review before editing; an audit is required. After release, queue the recommended Google paid metadata; rerun Apple CPP-05 persona (visitor from Push Notification) cohort.

### Action Priority Order by ROI x Confidence x Effort x Time-to-Signal

| Priority | Action | Expected Impact | Confidence | Effort | Time-to-Signal |
|-|-|-|-|-|-|
| 1 | Apple metadata refresh (title/subtitle/keyword field) | High (foundation) | High | Low | 24-48 hours |
| 2 | Apple Search Ads brand defense | High (SERP position lock) | High | Low | 1-3 days |
| 3 | Apple Featuring Nomination | Very high (editorial for "free") | Medium | Low | 7-21 days |
| 4 | Apple Custom Product Pages (3 initial) | High (CPI improvement) | High | Medium | 14-21 days |
| 5 | Apple PPO A/B on icon + subtitle | Medium-High | High | Low | Up to 90 days |
| 6 | Apple Search Ads category + discovery ad groups | Medium-High | Medium-High | Medium | 14-30 days |
| 7 | Google Play free metadata refresh + CSLs | High (foundation) | High | Low | 7-14 days |
| 8 | Android vitals monitoring pipeline | Very high (compliance) | High | Medium | 1-7 days |
| 9 | Google App Campaigns with tROAS | High | Medium-High | Medium | 14-30 days |
| 10 | Google Play Store Listing Experiments (icon/video/screenshots) | Medium-High | Medium | Medium | 7-14 days |
| 11 | Apple Search Ads competitor-adjacent terms | Medium | Medium | Medium | 14-30 days |
| 12 | Localization to 5 locales | Medium-High | Medium-High | Medium | 14-30 days |
| 13 | Editorial PR loop (Show HN, indie sites) | Medium | Medium | Low | 7-30 days |
| 14 | Referrals loop via Tailscale + email | Medium | Medium | Medium | 30-60 days |
| 15 | Google Play paid package deferred metadata refresh | Medium | Medium | Low | After review completion |

## Instrumentation and KPI Definitions

Quality signals drive the bottom of the funnel; conversion signals drive the top; financial signals drive the balance.

- North star: Hermes Mobile paid install rate per free install OR Hermes Mobile 1-day retained rate (60%+ target).
- Quality SLO: ANR rate < 0.47% overall and 8% per device; crash rate < 1.09%; user-perceived crash rate measured daily.
- Conversion SLO: Apple Search Ads brand defense CTR > 25%; Apple Search Ads category CTR > 5%; Apple product page CVR > 4% (typical), with a target of 6% in month 3.
- Acquisition SLO: Apple Search Ads brand defense CPT < $0.50; category CPT < $1.50 with tCPI <$5.
- Retention SLO: 1-day retention > 50%; 7-day retention > 30%.
- Ratings SLO: median new rating > 4.3; weekly rating volume > 5; review prompt cadence cap = 3 / 365 days; goal = 100 by month 3 on Google Play.
- Localization SLO: indexed impressions from non-US locales > 10% of search impressions by month 3.

## Indicative Budget Bands

| Channel | 7-Day Budget | 30-Day Budget | 90-Day Budget |
|-|-|-|-|
| Apple Search Ads brand defense | $200 | $600 | $1,500 |
| Apple Search Ads category | $400 | $1,500 | $4,500 |
| Apple Search Ads competitor-adjacent (where policy permits) | not active | $500 | $1,800 |
| Google App Campaigns with tROAS | not active | $2,000 | $9,000 |
| Localization services (DE/ES/FR/IT/JP/ID) | not active | $400 | $1,200 |
| Editorial / community PR | not active | $0 | $500 (assisted) |
| Storage, analytics, monitoring (Crashlytics/Firebase/Android Vitals) | $0 | $50 | $150 |
| Indicative Total | $600 | $5,050 | $18,650 |

These are bands not commits; allocate proportional spend to channels where CVR > 4% and 1-day retention > 50%; cut spend if ANR exceeds 0.47% on any device cluster.

## Stop Conditions

- Pause Apple Search Ads on keywords where CPT rises above $5 and ROAS < 0.8x.
- Pause Google App Campaigns if ANR rate in last 28 days exceeds 0.47% overall.
- Pause Apple PPO test if "Likely to be Inconclusive" predicted inside the 90-day window, switch to manual A/B.
- Pause Apple Featuring Nomination cycle if a previous nomination has no pulled response inside 30 days; repackage next effort.
- Pause all Custom Store Listings whose CVR < 2% after 14 days of sufficient impressions.
- Pause competitor-adjacent bidding on any region where Apple issues a trademark policy warning.
- Stop editing Google Play paid package metadata if the package remains in review.

## Synthesis: What "Dominance" Actually Looks Like Here

Dominance in the US mobile store channel is a portfolio concept, not a per-term concept. Across the seven themes above, the verified Apple position 1 for the exact brand is a verified moat; the missing position on "Hermes Agent" is a temporary gap that is addressable with metadata, an Apple Search Ads category campaign, and a few Custom Product Pages; the Google Play "Hermes Agent" cleave belongs to Hen Works' package at 10K installs and 4.43 stars, which is a competitor head-start of roughly 12-18 months in install velocity plus a 1,800+ review citation system.

The decisive comparison axis is that Apple and Google's quality systems are converging: Google's 0.47% ANR bad-behavior threshold plus Apple's unstated but documented App Review quality gates suggest that crash and ANR are the dominant bottom-of-the-funnel growth constraint. Hermes Mobile must lead with quality before scaling paid spend. The Custom Store Listing and Custom Product Page inventory is asymmetric (Apple 70 vs Google 50), but the marginal utility of CPP-01 over CPP-05 collapses fast, so a tight persona set of 5 CPPs is sufficient.

The tensions worth surfacing:
- Apple metadata virtual ceiling (30/30/100) vs. feature list (Mac/Windows/Linux/Tailscale/USB) means the metadata discards words; the keyword field needs to do brace-the-feature-list duty that the title/subtitle cannot.
- Google Play "Hermes agent" anchor on Hen Works vs. the desire to overtake it without compromising the brand identity requires metadata as well as Custom Store Listings and a faster-rating ramp.
- Apple Search Ads Brand campaign requires brand-search volume; it can produce a paid position 1 above the verified organic position 1 without buying rank gains organically (paid and organic Apple search ranks are kept separate in Apple's auction algorithm; this is observed in Apple's spacetime between ad position 1 and organic chart position).
- Apple algorithm personalization by installed apps, downloads, and browsing history means rank is partly a function of the user, not just the app; the deliverable target is therefore "stay rank 1 on the median US user device", not "rank 1 on every user".

Implication: dominant positioning requires a portfolio of branded-anchored Apple metadata, brand-defective Apple Search Ads, persona-rich Apple Custom Product Pages, persona-rich Google Play Custom Store Listings, a Google App Campaign that doubles as brand defense, and a defensibly strict quality floor below the Google Play bad-behavior thresholds. This maximizes relevance, conversion, defensibility, and friction-readiness simultaneously. Without that portfolio, the keywords with the highest purchase intent (e.g., "desktop AI agent", "remote coding assistant", "self-hosted AI assistant") will continue to be captured by Hermes Agent - Android or by Cursor iOS's launch buzz, while Hermes Mobile's title-position-1 sits on a small surface of low-intent search.

Recommendation closure: deliver Hermes Mobile's distribution as a portfolio; hold the verified Apple position 1; reach for category-anchored ranks (top 5) on "Hermes agent", "desktop AI agent", "remote coding assistant", and "self-hosted AI assistant" within 90 days while staying inside policy and quality floors. Any single-term number 1 guarantee is not engineering-honest given the algorithm's personalization and ongoing competition; this portfolio is the engineering-honest answer.

## References

1. *Unlocking Success: A Deep Dive into Google Play Ranking Factors*. https://www.microbitmedia.io/2025/06/16/google-play-ranking-factors
2. *Google Play Console - App Store Apple https://apps.apple.com › app › google-play-console*. https://apps.apple.com/us/app/google-play-console/id1606772645
3. *Google Play Console Android Developers https://developer.android.com › distribute › console*. https://developer.android.com/distribute/console
4. *App Store & Google Play ASO in 2026: new factors to watch*. https://animavie.org/app-store-aso
5. *ASO in 2026: New App Store & Play Ranking Signals — ASOScan*. https://asoscan.com/blog/aso-ranking-factors-2026
6. *Store listing experiments | Google Play Console*. https://play.google.com/console/about/store-listing-experiments
7. *Google Play store listing experiments: A/B testing for Android*. https://www.mobileaction.co/blog/google-play-store-listing-experiments
8. *Store listings | Google Play Console*. https://play.google.com/console/about/storelistings
9. *Google Play Store Listing Experiments: How to Run Native A/B ...*. https://appradar.com/blog/app-ab-testing-with-store-listing-experiments-in-google-play
10. *Google Play Store Listing Experiments: A/B Guide 2026*. https://appdrift.co/blog/google-play-store-listing-experiments
11. *Best practices to succeed with Universal App campaigns*. https://blog.google/products-and-platforms/products/ads/apps-best-practices
12. *What creative assets do you need for Google App Campaigns ...*. https://www.rocketshiphq.com/creative-assets-google-app-campaigns
13. *Google Ads App Campaigns: 5 Best Practices + Setup Guide*. https://hawksem.com/blog/google-ads-app-campaigns
14. *Google App Campaigns: Best Practices for Mobile Marketers...*. https://admiral.media/google-app-campaigns-best-practices
15. *Performance Max Audience Signals: Complete Guide 2026*. https://blog.adnabu.com/google-ads/performance-max-audience-signals
16. *App Store product page optimization: how to run A/B tests ...*. https://www.mobileaction.co/blog/product-page-optimization
17. *Product Page Optimization - Acquisition - App Store Connect ...*. https://developer.apple.com/help/app-store-connect-analytics/acquisition/product-page-optimization
18. *Product Page Optimization for App Marketers - Business of Apps*. https://www.businessofapps.com/guide/app-store-optimization-custom-product-pages-a-b-testing
19. *A/B testing in App Store: Full guide to Product Page Optimization*. https://appradar.com/blog/app-ab-testing-with-product-page-optimization-in-apple-app-store
20. *Product Page Optimization - App Store - Apple Developer*. https://developer.apple.com/app-store/product-page-optimization
21. *Apple Search Ads: Best Practices in 2026 - Adapty*. https://adapty.io/blog/apple-ads-best-practices
22. *Keywords - Best Practices - Apple Ads - Apple Search Ads*. https://ads.apple.com/app-store/best-practices/keywords
23. *5 Apple Search Ads Best Practices*. https://appradar.com/blog/apple-search-ads-best-practices
24. *Apple Search Ads Best Practices For 2024*. https://outrankapps.com/apple-search-ads-best-practices
25. *Apple Search Ads Guide: Discovery Campaign*. https://asa.tools/blog/how_to_run_search_ads_discovery_campaign
26. *Apple App Store Ranking Factors for 2026 | ASOWin Blog*. https://asowin.com/blog/app-store-ranking-factors-2026
27. *App Store Search Algorithm 2026: Ranking Factors Explained*. https://www.appstemple.com/guides/app-store-search-algorithm
28. *Apple App Store ranking factors: A guide | Median.co*. https://median.co/blog/ranking-in-the-app-store-key-factors-apple-developers-should-know
29. *How the App Store Algorithm Works in 2026 | AppDrift*. https://appdrift.co/blog/how-app-store-algorithm-works-2026
30. *Human Interface Guidelines*. https://developer.apple.com/design/human-interface-guidelines
31. *App Store Keywords: 100-Char Field (2026) | Push My App*. https://pushmyapp.ai/blog/apple-app-store-keywords-field
32. *App Store Title, Subtitle, Keywords: 30/30/100 (2026)*. https://appscreenshotstudio.com/blog/app-store-metadata-for-indie-devs-title-subtitle-keywords-2026
33. *iOS Keywords Field — How to Optimize the Hidden 100-Char ASO ...*. https://mwm.ai/glossary/keywords-field
34. *App Store 100-Character Keyword Field Guide | AppDrift*. https://appdrift.co/guides/app-store-connect/keyword-field
35. *8 Tips to Optimize Your Keywords List in App Store Connect*. https://appfigures.com/resources/guides/keyword-optimization-app-store-connect
36. *ANRs | App quality*. https://developer.android.com/topic/performance/vitals/anr
37. *Monitor your app's technical quality with Android vitals*. https://support.google.com/googleplay/android-developer/answer/9844486?hl=en
38. *Android Enterprise App Performance Benchmarks: What US CTOs ...*. https://mobile.wednesday.is/writing/android-enterprise-app-performance-benchmarks-2026
39. *Android vitals | App quality | Android Developers*. https://developer.android.com/topic/performance/vitals
40. *Crashes | App quality*. https://developer.android.com/topic/performance/vitals/crash
41. *Monitor your app's technical quality with Android vitals - Play Console Help*. https://support.google.com/googleplay/android-developer/answer/9844486
42. *Claude by Anthropic - App Store - Apple*. https://apps.apple.com/bz/iphone/story/id1806667385
43. *Claude by Anthropic ऐप - App Store - Apple*. https://apps.apple.com/in/app/claude-by-anthropic/id6473753684?l=hi
44. *Anthropic’s Claude tops US App Store rankings*. https://kite.kagi.com/tech/2026030214/anthropics-claude-tops-us-app-store-rankings
45. *Claude by Anthropic Productivity App Benchmark - Bitrise*. https://bitrise.io/resources/tools/app-navigator/apps/android/com.anthropic.claude
46. *Claude by Anthropic অ্যাপ - App Store - Apple*. https://apps.apple.com/in/app/claude-by-anthropic/id6473753684?l=bn
47. *Cursor launches iOS app so developers can spin up coding agents ...*. https://thenextweb.com/news/cursor-mobile-app-coding-agents-phone
48. *What Is Cursor for iOS? Control Coding Agents from iPhone and ...*. https://www.oflight.co.jp/en/columns/cursor-ios-mobile-coding-agent-2026-06
49. *Mobile SSH & AI agent guides*. https://onepilotapp.com/blog
50. *Cursor Ships Mobile App for Steering Coding Agents From iOS*. https://webdeveloper.com/news/cursor-mobile-ios-agent-remote-control
51. *Cursor now has a mobile app for guiding your coding agent on ...*. https://tech.yahoo.com/ai/copilot/articles/cursor-now-mobile-app-guiding-170350485.html
52. *Replit Mobile App – Join 50+ million creators*. http://replit.com/mobile
53. *Idea to Mobile App in Minutes*. https://replit.com/mobile-apps
54. *2026 Mobile App Development With Replit AI - Vibe Coding*. https://www.coursera.org/learn/mobile-app-development-ai
55. *Cursor launches iOS app so developers can spin up coding ...*. http://thenextweb.com/news/cursor-mobile-app-coding-agents-phone
56. *Replit – Build apps and sites with AI - Replit*. http://repl.it/
57. *ChatGPT - App Store - Apple*. https://apps.apple.com/us/app/chatgpt/id6448311069
58. *ChatGPT Mobile App: Complete Guide for iOS & Android (2026)*. https://www.ai-toolbox.co/chatgpt-management-and-productivity/chatgpt-mobile-app-guide-2026
59. *OpenAI's official ChatGPT app for Android arrives on the Play Store*. https://www.androidcentral.com/apps-software/chatgpt-android-app-launch
60. *Official ChatGPT App is now available on the Google Play Store ...*. https://www.facebook.com/technologychannel.org/posts/official-chatgpt-app-is-now-available-on-the-google-play-store-you-can-join-the-/839695991099669
61. *ChatGPT - Apps on Google Play*. https://play.google.com/store/apps/details?hl=en_US&id=com.openai.chatgpt
62. *Google Play Policies and Guidelines - Transparency Center*. https://transparency.google/intl/en_US/our-policies/product-terms/google-play
63. *Google Play Policy Updates 2026: What Every Developer Must ...*. https://www.apptester.co/blog/google-play-policy-updates-2025
64. *Google Play Console: App Suspended Due to Deceptive Behavior ...*. https://stackoverflow.com/questions/78516018/google-play-console-app-suspended-due-to-deceptive-behavior-policy-violation-on
65. *Developer Policy Center - play.google*. https://play.google/intl/en-US/developer-content-policy
66. *Google Play Developer Policies: Complete Reference 2026*. https://www.apptester.co/blog/google-play-policies
67. *App Store - Apple*. https://www.apple.com/app-store
68. *Discover how to get featured on the App Store & Google ...*. https://www.apptweak.com/en/aso-blog/how-to-get-your-app-featured-on-the-app-store
69. *Apple gives developers a way to nominate their apps for ...*. https://techcrunch.com/2024/06/13/apple-gives-developers-a-way-to-nominate-their-apps-for-editorial-consideration-on-the-app-store
70. *In-App Events and promotional content: a complete guide (2026)*. https://www.mobileaction.co/guide/in-app-events-promotional-content-guide
71. *Articles - App Store*. https://developer.apple.com/app-store/articles
72. *Getting every character out of the Apple keyword field*. https://asonomica.com/blog/apple-keyword-field
73. *aso-blog/keyword-research/ios-keyword-field-rules-character ...*. https://github.com/appalize/aso-blog/blob/main/keyword-research/ios-keyword-field-rules-character-limits-optimization.md
74. *App Store Connect Keyword Field: The 100-Character Guide (2026)*. https://www.marteso.com/blog/app-store-keyword-field-100-characters-guide
75. *App Store Connect adds 11 new languages for localized app ...*. https://9to5mac.com/2026/03/31/app-store-connect-adds-11-new-languages-for-localized-app-metadata
76. *App Store Supports 11 New Languages: ASO Localization Guide ...*. https://asoworld.com/blog/app-store-now-supports-11-new-languages-aso-localization-guide
77. *Apple App Store now supports 11 new languages: Check full ...*. https://www.digit.in/news/general/apple-app-store-now-supports-11-new-languages-check-full-list-here.html
78. *App Store Connect New Languages for App Metadata: What to ...*. https://www.live-feeds.com/2026/03/31/app-store-connect-new-languages-for-app-metadata-what-to-localize-first
79. *App Localization - Translate Your App to 22+ Languages*. https://mustscope.com/app-localization
80. *Hermes Agent | F-Droid - Free and Open Source Android App ...*. https://f-droid.org/packages/com.nousresearch.hermesagent
81. *Hermes Agent - Android - Free APK Download for Android - AppBrain*. https://www.appbrain.com/app/hermes-agent-android/com.hermesagent.android
82. *Hermes Agent - Android - Apps on Google Play*. https://play.google.com/store/apps/details?hl=en-US&id=com.hermesagent.android
83. *Download Hermes Agent - Android APK latest version App by Hen ...*. https://apkamp.com/com.hermesagent.android
84. *Hermes Agent Fork | F-Droid - Free and Open Source Android ...*. https://f-droid.org/en/packages/com.mobilefork.hermesagent
85. *Apple Product designs, themes, templates and ...*. https://dribbble.com/tags/apple-product
86. *7 Customizable Timeline Templates in Pages: Download ... Apple Education Community https://education.apple.com › resource*. https://education.apple.com/resource/250012940
87. *Set up targeting - Help - Ads on Apple News*. https://ads.apple.com/apple-news/publishers/help/campaign-management/0022-set-up-targeting
88. *The ultimate guide to Apple Ads for 2026*. https://www.apptweak.com/en/aso-blog/guide-to-apple-search-ads
89. *I talked to Apple about why my Search Ads were burning ...*. https://www.reddit.com/r/iOSProgramming/comments/1pi9rma/i_talked_to_apple_about_why_my_search_ads_were
90. *Prompt Saver - App Store*. https://apps.apple.com/in/app/prompt-saver/id6740009425
91. *Submitting an iOS App for Review Using Only the App Store ...*. https://ldas.jp/en/posts/appstore-connect-api-guide
92. *Downloading App Store Reviews Using App Store Connect API*. https://emndeniz.medium.com/downloading-app-store-reviews-a248759a5e0f
93. *Prompt Krafter - App Store - Apple*. https://apps.apple.com/us/app/prompt-krafter/id6446342150
94. *Prompting for app reviews and ratings on iOS and Android Appbot https://appbot.co › blog › prompting-for-app-reviews-r...*. https://appbot.co/blog/prompting-for-app-reviews-ratings-ios-android-ultimate-guide
95. *Hermes Agent Mobile - App Store*. https://apps.apple.com/us/app/hermes-agent-mobile/id6767006319
96. *‎Hermes Agent Mobile App - App Store - t.co*. https://t.co/v6GtYIm0zw
97. *Hermes Agent Mobile for iPhone - Free App Download*. https://www.appbrain.com/appstore/hermes-agent-mobile/ios-6767006319
98. *Hermes Agent Crosses 192K Stars, Mobile App Hits Play Store ...*. https://hermes-tutorials.dev/blog/2026-06-13-hermes-community-momentum-june-2026
99. *Hermes Agent Mobile - Developer Tools App | MWM*. https://mwm.ai/apps/hermes-agent-mobile/6767006319
100. *Custom Product Pages - App Store - Apple Developer*. https://developer.apple.com/app-store/custom-product-pages
101. *Custom Product Pages | Apple Developer Documentation*. https://developer.apple.com/documentation/apple_ads/custom-product-pages
102. *Apple doubles the custom product page limit, here’s what it ...*. https://www.mobileaction.co/blog/apple-doubles-the-custom-product-page-limit
103. *Apple Custom Product Pages Gummicube https://www.gummicube.com › ap...*. https://www.gummicube.com/blog/apples-custom-product-pages
104. *Submit a custom product page - Manage submissions to ...*. https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-a-custom-product-page
105. *Nominate your app for featuring - Apple Developer*. https://developer.apple.com/help/app-store-connect/manage-featuring-nominations/nominate-your-app-for-featuring
106. *Editorial - App Store - Apple*. https://apps.apple.com/bb/app/editorial/id673907758
107. *Editorial - App Store - Apple*. https://apps.apple.com/us/app/editorial/id673907758
108. *Developers can now nominate apps for App Store promotions*. https://appleinsider.com/articles/24/06/13/developers-can-now-nominate-apps-and-updates-for-app-store-promotions
109. *Apple Search Ads Benchmarks: CPT, CPA, Conversion Rates ...*. https://peakasa.com/blog/apple-search-ads-benchmarks-2026
110. *Apple Search Ads Benchmarks: CPT, CPI, TTR & ROAS by App*. https://admiral.media/apple-search-ads-benchmarks
111. *Apple Search Ads Benchmarks 2026: TTR, CR, CPT, and CPI by ...*. https://sparrowapps.io/articles/apple-ads-benchmarks
112. *Apple Ads benchmarks 2026: CPT, CPI, CR & ROAS by category*. https://www.apptweak.com/en/aso-blog/apple-ads-benchmarks
113. *Apple Search Ads Costs (2026) - Business of Apps*. https://www.businessofapps.com/marketplace/apple-search-ads/research/apple-search-ads-costs
114. *Apple Search Ads 101 - Campaign Setup*. https://www.jordandigitalmarketing.com/blog/apple-search-ads-101
115. *Apple Search Ads: 3 Lessons I Learned Before Burning My ...*. https://www.reddit.com/r/AppStoreOptimization/comments/1qxhiqj/apple_search_ads_3_lessons_i_learned_before
116. *Apple Search Ads Best Practices: The Ultimate Guide*. https://www.revenuecat.com/blog/growth/apple-search-ads-guide
117. *Apple Ads Guide: From Beginner to Expert (2025)*. https://splitmetrics.com/blog/apple-search-ads
118. *Apple Search Ads Keywords: What are They and How do ...*. https://appradar.com/academy/apple-search-ads/ads-campaign-and-keywords-types
119. *Guidelines - App Store - Apple Developer*. https://developer.apple.com/app-store/guidelines
120. *Apple App Store Rejection Guide 2026: The 15 Most Common ...*. https://www.openspaceservices.com/blog/mobile-app-development/apple-app-store-rejection-guide-2026-the-15-most-common-reasons-and-how-to-fix-each
121. *App Review Guidelines - Apple Developer*. https://developer.apple.com/app-store/review/guidelines
122. *Apple App Store Review Guidelines: Developer Reference 2026*. https://www.apptester.co/blog/app-store-guidelines
123. *Apple App Store Rejection Guide 2026: The 15 Most Common ...*. https://www.openspaceservices.com/blog/general/apple-app-store-rejection-guide-2026-the-15-most-common-reasons-and-how-to-fix-each
