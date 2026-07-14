Decision-grade memo — Hermes Mobile (Android) launch, July 2026

Summary (one line)
- Focus on high-conviction organic developer channels + rapid Store Listing experiments, with a freemium + cheap pro IAP ($20/mo leash) and optional higher-ticket B2B diagnostic sells for early revenue; prioritize quality installs, retention and paid conversion over vanity installs.

1) Google Play ASO ranking & conversion for near-zero-install apps — what matters and recommended experiments
- What drives early ranking and conversion: keyword relevance and conversion (views -> installs) are primary ranking signals; for tiny apps you must create search demand (keywords + cross-channel traffic) because organic search rank without installs is weak [Apptweak overview of ranking factors doc_id=12].
- Conversion benchmarks: overall Google Play conversion rates are in the mid-20%s (aggregate reports) but install -> purchase conversion for apps is usually 1–2% (useful for revenue planning) [Kirro/app conversion doc_id=8; UXCam conversion doc_id=7].
- Screenshot/video best-practices (practical checklist):
  - Use all 8 phone screenshot slots; make the first two count (they appear in search thumbnails) — lead with the core value: “Phone control plane for self-hosted AI agents on your Mac” and clear CTA (e.g., “Connect in 2 minutes”) [StoreShots doc_id=42 segs 1–4].
  - Text must be legible at thumbnail size (5–7 words per caption); use high contrast and consistent brand colors; show device context and at least one short demo frame (GIF/video hosted on YouTube) [StoreShots doc_id=42 seg 3–5].
  - Provide a short YouTube promo (15–30s) showing: install + pairing to Mac, a sample agent run, and how Leash Pro unlocks features — use the video in the listing to improve conversion (Google Play supports YouTube video) [StoreShots doc_id=42 seg 2].
- Store listing experiments design (fast, low-traffic approach):
  - Use Google Play Store Listing Experiments to A/B test icon, first screenshot pair, and short description; run sequentially, one variable at a time, 7–14 day tests per variant to collect signal [MobileAction/AppTweak guides doc_id=3 doc_id=6 doc_id=4].
  - For near-zero installs, bootstrap experiments from external traffic (see distribution channels below) so experiments get page views fast — otherwise Play’s experiments will take too long to reach statistical power [AppTweak doc_id=6; MobileAction doc_id=3].

2) Screenshot / Video concrete assets (deliverables for week 0)
- 8 phone screenshots (1080x1920 or 1242x2208 source), first two show: 1) core value + Mac pairing flow; 2) Leash Pro feature overlay (e.g., persistent sessions, priority agent access). Localize top 3 languages later [StoreShots doc_id=42 segs 1–6].
- 15–30s YouTube video: hero headline frame, 3 quick scenes (pairing, code agent run, pro feature), end card with CTA.
- Icon variants: dark/clean/utility styles for A/B.
- Copy variants: short description vs benefit-led 1-liner for experiments (use Play experiments to test) [MobileAction/doc_id=3; AppTweak/doc_id=6].

3) Realistic organic distribution channels that actually convert AI-developer ICPs (no paid ads)
- Hacker News (Launch / Show HN): still a top channel for developer tools; good for initial spikes and feedback if you invest in a tight, technical “how it works” launch post [Hacker News launch example doc_id=18].
- Reddit (dev/AI/self-hosted subreddits): communities like r/selfhosted, r/LanguageTechnology/LinuxAndroid and r/Programming can drive targeted installs if you participate and show technical depth; organic recommendations carry weight for tooling [Ranqer/Reddit marketing doc_id=17; Business Daily.dev guide doc_id=20].
- X (Twitter) & developer influencers: publish short demo clips and how-tos; engage maintainers of related OSS (Hermes Agent, OpenClaw) for cross-posts — targeted outreach converts better than broadcast DMs [social evidence & influencer patterns doc_id=31 doc_id=35].
- LinkedIn (technical posts & niche communities): for B2B/outbound and enterprise leads, developer-focused posts and event recaps get 2–6% engagement typical for B2B; use to surface the B2B diagnostic offering and recruit pilot customers [LinkedIn benchmarks doc_id=32].
- Indie dev communities & OSS maintainers (Product Hunt, Indie Hackers, Discords, GitHub issues/Discussions): reach out to Hermes Agent/OpenClaw communities and make an integration/usage guide — conversions are high when the app solves a workflow gap [developer stack commentary doc_id=29; Hermes Agent docs doc_id=37].
- Tactical play: combine a short Show HN + a Reddit how-to + a pinned X thread + 1–2 GitHub README integrations in the same 48–72 hour window to concentrate page-view traffic so Play Store experiments and ranking get signal quickly [Hacker News doc_id=18; Reddit doc_id=17].

4) Monetization mix (solo founder realism)
- Recommended primary model: freemium core (free chat + basic Mac pairing) + Leash Pro IAP (~$20/mo) as stated — this targets developers who value immediate convenience and will pay a small monthly for reliability.
  - Rationale: industry conversion to purchase after install is low (1–2% typical) so price and perceived value must match frequency of use (developer tooling, $5–30/mo is common) [UXCam conversion doc_id=7].
- Secondary: one-off B2B/consulting diagnostics ($499–$3k) sold selectively to teams who need secure Mac-on-prem installs, or enterprise pairing; sell as scoped, short engagements rather than productized early B2B to avoid heavy sales load. Use LinkedIn / demo calls to convert leads (LinkedIn engagement benchmarks doc_id=32).
- Revenue mix target (early months, realistic): 90% from freemium -> IAP (small # of subscribers), 10% from B2B diagnostics initially. Expect low paid conversion from organic installs; prioritize LTV via monthly retention and a trial-to-pay flow.

5) Competitor landscape (key items found in research)
- Hermes Agent (Nous Research) — active Android client and phone-native CLI agent; already available on Google Play and F-Droid; demonstrates developer appetite for phone-based agents and potential name confusion with Hermes Mobile [Hermes docs and Play listing doc_id=37 doc_id=39 doc_id=38].
- OpenClaw — major OSS agent ecosystem (noted as a major project in prior knowledge); relevant because community integrations and name recognition can be leveraged for cross-posts (prior knowledge doc_id=0). 
- Clawdroid (Clawdroid app) — an Android app that runs OpenClaw locally on device; keep an eye for functional overlap with “mobile agent” features (prior knowledge doc_id=1).
- Implication: differentiate on Mac control-plane story (explicitly brand as Hermes Mobile — phone -> Mac pairing for self-hosted agents) and avoid ambiguous “Hermes” naming conflicts by clarifying tie-ins to Hermes Agent or stating distinct ownership.

6) Prioritized 7-day action plan (focused, measurable, no-vanity metrics)
Day 0 (pre-launch, 0–24h)
- Deliverables: final 8 screenshots, 15–30s video, 3 icon variants, 2 short description variants, Play listing filled.
- Metric: listing ready + external launch content prepared.

Day 1–2 (soft launch + concentrated outreach)
- Actions: Post Show HN (technical walkthrough + how it pairs to Mac); post detailed how-to to r/selfhosted and r/programming; announce on X with short demo clip and tag Hermes Agent/OpenClaw maintainers.
- Metric: achieve 500–2,000 Play listing page views (goal) and 50–200 unique page sessions from combined channels (these are actionable signals, not vanity installs).

Day 3–5 (Store listing experiments + community follow-ups)
- Actions: Start Play Store experiments testing (A) icon A vs B, (B) screenshot set A vs B (first-two screenshots), (C) short description variants. Run experiments with traffic split from your external channels.
- Metric: measure change in page-view -> install conversion; target relative uplift >=10% from best variant. Also track installs/day and new user retention day-1.

Day 6 (pilot sales + feedback loop)
- Actions: Invite 5–10 engaged developers to 1:1 calls/demos for feedback and B2B diagnostic upsell; offer free 14-day Leash Pro trial to early adopters.
- Metric: 2–3 product feedback calls booked; 1 pilot diagnostic lead (qualified).

Day 7 (iterate + re-run experiments)
- Actions: Apply findings: keep best listing variant, push updated assets, post a consolidated “lessons learned” thread on HN/Reddit/X; prepare next-week outreach (GitHub integrations, blog post).
- Metric: maintain or improve install conversion; aim for >25% day-1 retention among new installs from the concentrated launch cohort (honest retention target for a developer tool).

Success metrics (honest, not vanity)
- Page view -> install conversion uplift from experiments (primary optimization metric).
- Day-1 retention for new installs (quality signal) — target: >20% for engaged developer cohort; if below, iterate on onboarding.
- Paid conversion (IAP subscribers as share of installed base) — expect 0.5–2% in early months; goal: reach 1% paid conversion within 3 months (with $20/mo price, 1% of 1k active = $200/mo recurring).
- B2B diagnostic revenue — goal: 1–3 deals at $499–$3k in first 90 days as validation, sold via LinkedIn/outreach.

Citations (sources used inline)
- Play screenshots & best practices: StoreShots guide (Google Play Screenshot Sizes & Best Practices, 2026) [StoreShots doc_id=42].
- Store listing experiments / A/B testing: MobileAction, AppTweak, AppRadar guides on Google Play experiments (doc_id=3 doc_id=6 doc_id=4).
- Conversion benchmarks and install->purchase rates: Kirro/App conversion summaries and UXCam conversion benchmarks (doc_id=8 doc_id=7).
- Organic channels: Reddit marketing guides and Hacker News launch examples; developer audience behavior notes (doc_id=17 doc_id=18 doc_id=20 doc_id=31).
- Hermes Agent & competitor notices: Hermes Agent docs and Play listing / F-Droid entries showing existing Android Hermes clients (doc_id=37 doc_id=39 doc_id=38) and prior knowledge about OpenClaw (prior knowledge doc_id=0) and Clawdroid (prior knowledge doc_id=1).

Bottom line / Recommendation
- Launch now with the freemium + $20/mo Leash Pro IAP, invest first-week effort into concentrated cross-channel launch (HN + Reddit + X + GitHub), and use Play Store Listing Experiments immediately with externally-driven traffic so you can optimize conversion quickly. Reserve heavy B2B sales effort until you have 2–3 pilot customers from outreach; treat diagnostics as a validation pathway rather than a primary revenue engine.

Prepared by: Research & GTM coordinator — recommended next immediate actions: finalize assets, schedule Show HN, prepare Reddit how-to, configure Play experiments, recruit 5 pilot devs for calls.

