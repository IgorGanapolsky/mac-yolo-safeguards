# ThumbGate Research Brief — for an in-app Hermes Mobile promo card

## TL;DR

The brief as written does not match the product. There is no ThumbGate.app, no Hermes Web, no Continuity, no signed machine pairing, and no Leash in ThumbGate's first-party surface. ThumbGate is one product at thumbgate.ai — a local pre-action firewall for AI coding agents — and "Hermes" in its docs refers to a separate Nous Research project (NousResearch/hermes-agent) that ThumbGate can sit in front of, not a ThumbGate product line. A promo card that names those features would be invented copy. The honest deliverable is a card promoting the one paid tier that actually exists (ThumbGate Pro, $19/mo or $149/yr) using only verified claims.

---

## What ThumbGate actually is (first-party verified)

Single product, single domain. thumbgate.ai is operated under the GitHub org IgorGanapolsky. GitHub repo: github.com/IgorGanapolsky/ThumbGate ("Pre-Action Checks self-improve from ranked lessons and repeated failures, hard-block detected secret leaks, and block matches in strict mode") [GitHub].

What it does, verbatim from the site and repo:
- Sits at the tool-call boundary of AI coding agents (Claude Code, Cursor, Codex, Gemini CLI, Amp, Cline, OpenCode, plus any MCP-compatible agent).
- "Pre-Action Checks" — flag a matching risky action before it executes.
- "Thumbs-down feedback that becomes explicit prevention rules."
- Default policy: deny detected secret exfiltration and gate kill/bypass commands; warn on other matched high-risk checks; strict mode also denies matched warning-mode checks.
- Pro-only add-ons, verbatim: "personal local dashboard, DPO export, auto-connect after activation, and founder support" [Pro page].
- Pro also adds "personal lesson recall," "managed adapter matrix," "unlimited prevention rules," "DPO + HuggingFace export," and "auto-connect" [Pricing page].

Plans, verbatim from thumbgate.ai/pricing:
- Free: $0 — "2 feedback captures/day (10 total)", "Up to 3 active auto-promoted prevention rules", "All MCP integrations", "PreToolUse hook", "Runs 100% local."
- Pro: $19/mo or $149/yr — adds personal lesson recall, managed adapter matrix, personal dashboard, unlimited prevention rules, DPO + HuggingFace export, auto-connect.
- Diagnostic: $499 one-time — "one workflow, one owner, one failure pattern", "Gate split + proof checklist deliverable."
- Workflow Hardening Sprint: $1,500 — "workflow map + approval boundaries", "memory / gate wiring plan", "proof pack for the next production-facing iteration."
- Enterprise: custom, scoped after intake. Workflow Reliability Operations $3,000/mo, Enterprise Governance Pilot $15,000 (30 days), Enterprise Reliability Operations $10,000/mo.

Explicit GA caveats, verbatim: "Hosted team sync and a hosted org dashboard are not generally available"; "Hosted team lesson sync, a hosted org dashboard, SSO, SIEM, and compliance packaging are not general-availability features in the current public runtime" [Pricing, Pro].

---

## Where the brief diverges from reality

| Claim in the brief | First-party reality |
|---|---|
| "ThumbGate.app" as a distinct product | Does not exist as a ThumbGate-owned surface. thumbgate.com resolves to an unrelated parked login page; thumbgate.ai is the only ThumbGate product. |
| "Hermes Web" | Not a ThumbGate product. The only "Hermes" reference on thumbgate.ai is the guide page "Hermes Agent Guardrails," which positions ThumbGate as the firewall layer in front of a separate product, Hermes Agent. |
| "Continuity" / VPS / always-on relay | No mention of remote access, VPS, relay, or mobile-to-host connectivity anywhere in the ThumbGate product copy or repo description. |
| "Signed machine pairing" | Not in the feature set. The repo mentions configured agent integrations and a PreToolUse hook, but no device pairing or signed-pairing protocol. |
| "Leash controls" | Not named. The closest equivalent is the "strict mode" toggle that escalates warning-mode matches to denials. |
| "Web dashboard" | Pro ships a "personal local dashboard," not a hosted web dashboard. Hosted org/team dashboards are explicitly called out as not generally available. |
| "Hermes Mobile" as a working ThumbGate app | Not a ThumbGate product. Nous Research's Hermes Agent ships native desktop apps (macOS/Windows/Linux) and runs on Android via Termux; an unrelated third-party Android client "Hermes Agent Mobile" exists on Google Play under the publisher GroundWidgets. None are owned or controlled by ThumbGate. |
| Distinct plans between "ThumbGate.app" and "ThumbGate.ai" | One product, one plan ladder (Free / Pro / Diagnostic / Sprint / Enterprise). |

Bottom line: every named surface in the brief — the .app brand, Hermes Web, Hermes Mobile, Continuity, signed pairing, Leash — is unverified. No first-party page, press release, changelog, repo README, or docs entry surfaced for any of them.

---

## Why the requested card cannot be written as specified

The constraint stack is self-contradictory:

1. The product attributes the brief asks the card to promote (signed machine pairing, Leash, Continuity/VPS, a working Hermes Mobile app that "needs" ThumbGate to reach the computer) are not in any first-party source I can find.
2. The brief simultaneously forbids saying "the phone can't reach the computer" or implying the mobile app is broken — which is the only narrative reason a user would need a remote-access product.
3. Promoting ThumbGate Pro under those attributes would be invented copy. It would also risk implying that Nous Research's Hermes Agent (a third-party open-source project) ships a broken mobile experience, which is both unverified and brand-damaging to a partner ThumbGate's own guide page treats as a customer.

Per the brief's own quality bar ("honest caveats," "do not invent GA features," "first-party over SEO commentary"), producing the requested card as written would fail that bar.

---

## The closest honest deliverable

A promo card for the only paid tier that actually exists: ThumbGate Pro. Below is a variant that is fully source-grounded, says nothing about mobile-to-host connectivity, and does not claim any feature outside thumbgate.ai/pricing and thumbgate.ai/pro.

### Recommended card (single variant, ready for review)

- Headline: "Stop paying for the same AI coding mistake twice."
- Body: "ThumbGate Pro turns thumbs-down feedback into Pre-Action Checks that block the same risky tool call before it runs — across Claude Code, Cursor, Codex, Gemini CLI, Amp, Cline, OpenCode, and any MCP-compatible agent. Pro adds a personal local dashboard, DPO + HuggingFace export, history-aware lesson recall, and unlimited prevention rules. $19/mo or $149/yr."
- CTA: "See what's included -> thumbgate.ai/pro"

### Why this card and not three variants

Three variants only pay off if the underlying product surfaces are real and differentiated. They aren't — ThumbGate has one product, one pricing ladder, one Pro tier. A/B/C variants on the same one-product claim would dilute the message without adding signal. If you want to test angles, the meaningful split is hook, not body:

- Variant A (loss-framed, above): leads with cost of repeated mistakes.
- Variant B (control-framed): leads with "evidence pack for your next production-facing iteration" — matches the Diagnostic and Sprint deliverables ThumbGate actually sells.
- Variant C (compliance-framed): leads with "audit-trail + hard-blocks for the agent that ships to prod" — maps to the Enterprise governance positioning on the Federal page, without naming a vertical the brief did not authorize.

All three stay inside the verified feature set. None imply that any other product is broken.

---

## What I would need to write the original brief faithfully

Before I can produce a "ThumbGate.app for Hermes Mobile" card, one of the following has to be true and verifiable from a first-party source:

- A live thumbgate.app surface with a product page, pricing, and a documented Hermes Mobile integration; OR
- A Nous Research statement that Hermes Mobile depends on or recommends ThumbGate for remote control; OR
- A ThumbGate changelog or doc that names signed machine pairing, Leash, Continuity, or a hosted web dashboard as shipped or beta features.

If any of those surface, I will redo the card against the real specs. Until then, shipping the copy as briefed would be invented.

---

## Sources (first-party)

- thumbgate.ai (homepage, Pre-Action Checks framing) [thumbgate.ai]
- thumbgate.ai/pricing (Free / Pro / Diagnostic / Sprint / Enterprise ladder, GA caveats) [Pricing]
- thumbgate.ai/pro (Pro feature list, "personal local dashboard") [Pro]
- thumbgate.ai/guides/hermes-agent-guardrails (ThumbGate positioned as guardrails for Hermes Agent) [Hermes Guardrails]
- github.com/IgorGanapolsky/ThumbGate (repo description, PreToolUse hook, MCP adapters) [GitHub]
- github.com/NousResearch/hermes-agent (Hermes Agent is a Nous Research project, MIT, macOS/Windows/Linux native + Android via Termux) [Hermes Agent repo]

## Recommended next step

Pick one:

1. Approve the ThumbGate Pro card above as the in-app promo (single variant, source-grounded). Add B/C angle variants if you want to test hook framing.
2. Provide a first-party source for thumbgate.app / Hermes Web / Continuity / signed pairing / Leash, and I will rebuild the card against the real spec.
3. Confirm in writing that I am authorized to use aspirational or roadmap copy for unverified features, and I will mark every unverified claim explicitly inline.

Defaulting to option 1 unless you direct otherwise.

## References

1. *Hermes Agent Mobile - Fully Local Android App (Pre ...*. https://www.reddit.com/r/hermesagent/comments/1u3iscw/hermes_agent_mobile_fully_local_android_app
2. *Hermes Agent – Applications sur Google Play*. https://play.google.com/store/apps/details?hl=fr&id=hermes.agent.mobile
3. *Hermes Agent Guardrails | Firewall for Self-Improving Agents*. https://thumbgate.ai/guides/hermes-agent-guardrails
4. *Maison Hermès - Apps on Google Play*. https://play.google.com/store/apps/details?id=com.hermes.maisonhermesjpv2
5. *Hermes Worldwide - Apps on Google Play*. http://play.google.com/store/apps/details?hl=en_US&id=com.groundwidgets.hermes
6. *Pricing — ThumbGate*. https://thumbgate.ai/pricing
7. *ThumbGate - Agentic AI Directory*. https://agentic.ai/t/thumbgate
8. *ThumbGate — Stop risky AI-agent actions before they run*. https://thumbgate.ai/
9. *ThumbGate for ChatGPT - GPT Action + Agent Guardrails*. https://thumbgate.ai/chatgpt-app
10. *ThumbGate - Visual Studio Marketplace*. https://marketplace.visualstudio.com/items?itemName=igorganapolsky.thumbgate
11. *ThumbGate Pro | Personal local dashboard and proof for AI ...*. https://thumbgate.ai/pro
12. *thumbgate.com - Login to your admin interface*. https://www.thumbgate.com/
13. *ThumbGate for Federal Agencies | Auditable pre-action gates ...*. https://thumbgate.ai/federal
14. *ThumbGate — Pre-action checks for AI coding agents*. https://thumbgate-production.up.railway.app/
15. *ThumbGate vs Arcjet | Agent-Outbound Gate Pairs With App ...*. https://thumbgate.ai/compare/arcjet
16. *ThumbGate — ClawHub*. https://clawhub.ai/igorganapolsky/thumbgate
17. *IgorGanapolsky/ThumbGate: Agent governance ...*. http://github.com/IgorGanapolsky/ThumbGate
18. *Pre-Action Checks for AI Coding Agents | ThumbGate Guide*. https://thumbgate.ai/guides/pre-action-checks
19. *Whois – Applications sur Google Play*. https://play.google.com/store/apps/details?hl=fr&id=com.domaintools.whois
20. *GitHub - IgorGanapolsky/ThumbGate: Agent governance for ...*. https://github.com/IgorGanapolsky/ThumbGate
21. *ThumbGate — freshcrate*. https://www.freshcrate.ai/projects/ThumbGate
22. *Subscribe to checkout webhooks*. https://developer.paypal.com/docs/multiparty/checkout/apm/reference/subscribe-to-webhooks
23. *Hermes Agent - Android - Apps on Google Play*. http://play.google.com/store/apps/details?hl=en_US&id=com.hermesagent.android
24. *Hermes Agent | Nous Research*. https://hermes-agent.nousresearch.com/
25. *Hermes Agent (Nous Research) : l'agent IA à mémoire long ...*. https://www.noxcod.com/outils-ia/hermes
26. *Hermes Agent — Open-Source AI Agent with Persistent Memory hermes-agent.org https://hermes-agent.org*. https://hermes-agent.org/
27. *ThumbGate: Block AI Coding Errors with Pre-Action Gates*. https://mcpmarket.com/server/thumbgate
28. *hermes-agent/website/docs/getting-started/installation.md at main*. https://github.com/NousResearch/hermes-agent/blob/main/website/docs/getting-started/installation.md
29. *GitHub - NousResearch/hermes-agent: The agent that grows with you · GitHub*. http://github.com/NousResearch/hermes-agent
30. *Hermes Agent Documentation | Hermes Agent*. https://hermes-agent.nousresearch.com/docs
31. *nousresearch/hermes-agent - Docker Image*. https://hub.docker.com/r/nousresearch/hermes-agent
