# ThumbGate.app Research Brief (Corrected) - Hermes Mobile Promo Card

## TL;DR - What the prior report got wrong

Every claim in the prior brief that ThumbGate.app, Hermes Web, Continuity, signed machine pairing, or Leash do not exist is false. Live first-party sources at thumbgate.app, its llms.txt, its api/billing/plan endpoint, its ai-catalog.json, and the mac-yolo-safeguards repository together confirm that ThumbGate.app is a separate, live product positioned as "Leash by ThumbGate" / "Hermes Web by ThumbGate" with a $0 free Web Control tier and a paid Cloud Continuity tier at $10 USD per month (verified from the live billing endpoint: unitAmount 1000, currency USD, interval month). The earlier report's premise that the product does not exist is the error to correct.

## Corrections to every false statement in the prior report

| Prior report claim | Verified reality | Source |
|---|---|---|
| "There is no ThumbGate.app" | ThumbGate.app exists and is live; canonical URL https://thumbgate.app/ | [3] |
| "no Hermes Web" | The product is literally named "Hermes Web by ThumbGate"; ARD catalog URN urn:air:thumbgate.app:service:hermes-web | [1] |
| "no Continuity" | Cloud Continuity is the paid product; homepage lists "automatic fenced failover" and "100 cloud continuations every 30 days" | [3] |
| "no signed machine pairing" | llms.txt core capability: "Signed pairing to a user's Hermes machine without inbound ports"; homepage proof-strip: "1 signed device identity / 0 shared private keys" | [2], [3] |
| "no Leash" | The product title is "# Leash by ThumbGate"; Leash controls are a core capability | [2] |
| "thumbgate.ai is the only ThumbGate product" | thumbgate.ai (Pre-Action Checks firewall) and thumbgate.app (Hermes Web + Cloud Continuity) are TWO products from the same author, with no overlap in domain role | [7], [3] |

Observation -> mechanism -> implication: the prior report searched the open web and stopped at the SEO-commentary cluster around thumbgate.ai. Mechanism: that cluster dominates search recall, while thumbgate.app sits on a different domain with a single-URL sitemap. Implication: a search-first methodology without opening the named first-party URLs is the failure mode that produced the wrong answer. For promo copy, the same bias will hide thumbgate.app from anyone who only searches for "ThumbGate"; the promo card must link directly so the in-app reader lands on the correct product.

## What ThumbGate.app is (first-party verified)

Single product at one canonical domain. The home page identifies as "ThumbGate - Your Hermes chats from any screen", the HTML title is "ThumbGate for Hermes", and JSON-LD on the page declares `name:"ThumbGate for Hermes"`, `applicationCategory:"DeveloperApplication"`, `operatingSystem:"Web, macOS, iOS, Android"`. The llms.txt opens with `# Leash by ThumbGate` and the one-line summary "ThumbGate is the Hermes web dashboard and Continuity product: remote control of Hermes from any browser, free while your machine is online, with optional paid VPS continuity when it goes offline." [3], [2]]

Core capabilities, verified from llms.txt and the homepage:
- Web remote control dashboard for Hermes (chats, machines, Leash controls).
- Signed pairing to a user's Hermes machine without inbound ports.
- Optional managed cloud / VPS continuation when a paired machine is offline.
- Renewable, expiring fenced leases so only the current unexpired executor can complete a task (homepage proof-strip: "90s execution lease").
- Aggregate, content-free product analytics and an auditable task trail.

Mechanism: the ThumbGate connector installed on a Hermes-running Mac dials out over HTTPS, creates a device key on the machine, and keeps the local gateway credential local - it is never uploaded. Chats appear in the dashboard only after the user signs in and approves the device short code. [3]]

## The two-tier pricing truth

| Tier | Price | Includes | Offline behavior |
|---|---|---|---|
| Web Control | $0 / month | Signed machine pairing; synced Hermes threads; local task continuation while online | Pauses or asks when Mac is offline |
| Cloud Continuity | $10.00 USD / month (verified at api/billing/plan: unitAmount 1000, currency USD, interval month) | Everything in Web Control; 100 cloud continuations every 30 days; automatic fenced failover; 14-day trial with 5 cloud runs | Automatic fenced VPS failover when paired Mac is offline |

JSON-LD on the homepage formally lists the Web Control offer as `price:"0", priceCurrency:"USD"`. The live billing API shows the Cloud Continuity plan is `configured:true, active:true`. [3], [4]]

Insight: the only paid SKU is Cloud Continuity at $10/mo. There is no separate Pro tier, no enterprise list price, no separate dashboard SKU at thumbgate.app - the $19/mo Pro on the prior report belongs to thumbgate.ai, not thumbgate.app. Recommending the wrong tier or the wrong price would undercut the promo card's credibility the first time a buyer clicks "Pricing".

## Privacy boundary (first-party)

- Device private keys and local gateway credentials stay on the paired machine.
- Funnel analytics do not contain prompts, threads, email addresses, IP addresses, cookies, or user-agent strings.
- Chats, task receipts, response feedback, and lessons require an authenticated workspace session.
- The homepage explicit honesty-note: "No workspace telemetry is fetched or rendered on this public page." [3], [2]]

Implication: the privacy boundary is itself a saleable feature. The Mac-stays-local model plus no-prompt analytics is exactly the answer a Hermes Mobile user with privacy objections to AI agents will accept.

## Relationship to other Igor Ganapolsky / Hermes products

- thumbgate.app = Hermes Web dashboard + Cloud Continuity VPS failover (live; one-domain product).
- thumbgate.ai = local pre-action firewall for AI coding agents (separate product; $0 free CLI, $19/mo Pro, custom Enterprise). [7]]
- IgorGanapolsky/mac-yolo-safeguards = OS-level safeguards layer for AI agent loops on macOS (runaway-kill, hard timeouts, resource limits so agents in YOLO mode cannot burn tokens or freeze the Mac). It is a separate repo that positions itself as a complement to hosted Hermes platforms, not as ThumbGate.app's source. [12]]
- Hermes Agent = Nous Research's open-source agent runtime. ThumbGate.app is the web control plane for it; Hermes Mobile (the Android app from a third-party developer) is a separate native client to the same agent.
- No documented shared-auth or handoff between Hermes Mobile and ThumbGate.app exists in first-party sources. The honest positioning is "two clients to Hermes", not "one bundle". [3]]

## Honest GA / availability caveats

- GA status is not explicitly declared on thumbgate.app. The homepage has no "beta" badge; the pricing is active and the billing endpoint returns active:true. Treat the product as live with the standard early-product caveats below.
- The sitemap contains only the homepage (one URL, lastmod 2026-07-22), so most surfaces (legal pages, status, help center, dedicated pricing subpage) are not yet public. The promo card should link to / and to /api/billing/plan, not to non-existent /pricing or /docs pages.
- Cloud Continuity at $10/mo with a 14-day trial of 5 runs is the only paid SKU; there is no published enterprise list price, no separate Mac-pairing fee, no seat-based pricing.
- "Web Control $0" requires the user's own Mac to be online. Offline behavior on free is "pause or ask" - i.e., Web Control alone is not a complete mobile-to-Mac handoff if the Mac sleeps.
- Hermes Mobile (Android native app) and ThumbGate.app are independent clients - ThumbGate.app is reached via mobile web browser on Android, not via a native in-app integration with Hermes Mobile. [3]]

## Buyer jobs, upgrade triggers, trust objections

| Job to be done | ThumbGate.app feature that answers it | Trigger that converts free to Cloud Continuity |
|---|---|---|
| Read Hermes chats on the phone when the Mac is on the desk | Mobile-web responsive Hermes Web workspace at thumbgate.app | User opens mobile browser and sees Hermes Web mirrors their threads |
| Keep a long task alive when the Mac lid closes or Wi-Fi drops | Cloud Continuity fenced VPS failover | First time a free user sees the prompt "pause or ask" on the web and wants hands-off behavior |
| Stay signed in across devices without typing on the phone | AuthKit SSO (Google, Apple, Microsoft, GitHub, email, enterprise SSO) | Multi-device sign-in flow works without a ThumbGate password |
| Privacy review | Device keys + local gateway credential stay on Mac; no prompts/IP/cookies in funnel analytics | Enterprise buyer or compliance team asks where keys live |
| Audit / lessons review | Auditable task trail + PrivateResponseFeedback capability in ARD catalog | Team lead needs per-task receipts |

Insight: the upgrade trigger is operational, not feature-driven. Cloud Continuity is what changes the moment the user thinks "I want my task to keep running while I am away from my Mac" - the value is reliability, not capability.

## The one recommended mobile promo card

Headline: Your Hermes chats, from any screen.

Body: Open ThumbGate in your Android browser and the same Hermes threads you see in this app are waiting - signed pairing, no inbound ports, your Mac runs the work locally. Add Cloud Continuity when you want a task to keep going on a fenced VPS after your Mac sleeps. 14-day trial with 5 free cloud runs. From $10/mo after.

Primary CTA: Open Hermes Web (thumbgate.app)
Secondary CTA: See the failover path (in-page anchor on thumbgate.app)

Why this card: it positions ThumbGate.app as an additional surface for an already-capable Hermes Mobile app (no claim of broken connectivity), names the free Web Control tier explicitly so the user is not pitched a paywall on the first visit, names the paid Cloud Continuity tier with the actual $10/mo and the actual 14-day/5-run trial so the click matches the landing page, and it avoids every false premise that broke the prior report.

Why the other draft variants were dropped:
- A "your phone cannot reach your Mac" framing was dropped because the brief explicitly forbids rescue framing and no first-party source supports it.
- A "free for everyone" framing was dropped because Cloud Continuity is the only paid SKU and the promo card exists to convert it - not naming it would hide the upgrade.
- A "ThumbGate is Hermes Mobile's companion app" framing was dropped because no first-party source documents shared auth, deep links, or a native integration between the two clients.

## Measurable conversion events

Because the CTA opens a web URL inside the Hermes Mobile app, instrument the in-app WebView, not external browser analytics. Suggested events, each tied to a specific truth claim so the metric is auditable:

| Event | Trigger | Truth-claim check |
|---|---|---|
| promo_impression | Card visible on home screen for at least 1s | Baseline |
| promo_cta_click | User taps the primary CTA | Measures copy resonance |
| pairing_land | thumbgate.app/api/auth/login is the resolved URL | Confirms link is correctly deep-linked, not generic |
| plan_view | thumbgate.app/api/billing/plan called within 30s of click | Measures intent, not bounce |
| trial_start | User reaches 14-day trial activation (post-sign-in, post-pairing) | Measures free-to-paid trigger conversion |
| subscribed | Cloud Continuity $10/mo becomes active:true for the user | Measures the headline conversion |

## Synthesis - what the corrected picture changes

Mechanism, scope, and evidence base differ between the two ThumbGate products in a way the prior report erased:

- thumbgate.ai is a local pre-action firewall sitting in front of tool calls; it is a developer-side trust layer with thumbs-up/down rules and a Pro tier. Evidence base is the Pre-Action Checks whitepaper and a $19/mo Pro SKU.
- thumbgate.app is a remote-control plane for an already-installed Hermes; it is an end-user convenience and reliability layer with a $0 Web Control tier and a $10/mo Cloud Continuity tier. Evidence base is the homepage, llms.txt, the live billing endpoint, and the ARD catalog.
- mac-yolo-safeguards is a third product that complements both by adding OS-level runaway-kill to Mac-hosted agent loops.

Divergence to surface in the promo card: thumbgate.ai's $19/mo Pro could be confused with thumbgate.app's $10/mo Cloud Continuity. The promo card must use the exact "$10/mo after trial" wording so the in-app reader does not arrive expecting ThumbGate.ai's dashboard and find ThumbGate.app's pairing flow. This is the single most likely copy failure post-launch.

Time horizon: thumbgate.app is live with a single-page site (one URL in sitemap) and active billing. Treat the product as early-stage but operational; assume a short roadmap and re-verify pricing before each major campaign.

## References

1. *Fetched web page*. https://thumbgate.app/.well-known/ai-catalog.json
2. *Fetched web page*. https://thumbgate.app/llms.txt
3. *ThumbGate — Your Hermes chats from any screen*. https://thumbgate.app/
4. *Fetched web page*. https://thumbgate.app/api/billing/plan
5. *IgorGanapolsky/ThumbGate: Agent governance ...*. http://github.com/IgorGanapolsky/ThumbGate
6. *Hermes Agent Guardrails | Firewall for Self-Improving Agents*. https://thumbgate.ai/guides/hermes-agent-guardrails
7. *ThumbGate — Pre-action checks for AI coding agents*. https://thumbgate.ai/
8. *IgorGanapolsky (Igor Ganapolsky) · GitHub*. https://github.com/IgorGanapolsky
9. *Igor Ganapolsky - Senior AI Systems Engineer*. http://linkedin.com/in/igor-ganapolsky-859317343
10. *Fetched web page*. https://thumbgate.app/sitemap.xml
11. *mac-yolo-safeguards/README.md at main · IgorGanapolsky/mac-yolo-safeguards · GitHub*. https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/README.md
12. *GitHub - IgorGanapolsky/mac-yolo-safeguards: OS-level safeguards layer for AI agent loops — runaway-kill, timeouts & resource limits so coding agents (Claude Code, Cursor, Codex, Antigravity) in YOLO mode can't burn tokens or freeze your Mac · GitHub*. https://github.com/IgorGanapolsky/mac-yolo-safeguards
13. *Fetched web page*. https://raw.githubusercontent.com/IgorGanapolsky/mac-yolo-safeguards/main/README.md
14. *Hermes WebUI Mobile Access: Use Your AI Agent From ...*. https://aisuccesslabjuliangoldie.com/blog/hermes-webui
15. *Hermes WebUI: The best way to use ...*. https://github.com/nesquena/hermes-webui
16. *hermes-custom-skills/handoff/SKILL.md at main · bohanyt ...*. https://github.com/bohanyt/hermes-custom-skills/blob/main/handoff/SKILL.md
17. *Hermes Agent - Android - Apps on Google Play*. http://play.google.com/store/apps/details?hl=en-US&id=com.hermesagent.android
18. *hermes-custom-skills/skills/handoff/SKILL.md at main · Anesu ...*. https://github.com/Anesu/hermes-custom-skills/blob/main/skills/handoff/SKILL.md
