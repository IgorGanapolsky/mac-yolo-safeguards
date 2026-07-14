# Hermes Mobile — Revenue-Focused Daily Content Engine v1

| Field | Value |
|-------|--------|
| **Date** | 2026-07-14 |
| **Checked (UTC)** | 2026-07-14T00:16:55Z – 2026-07-14T00:17:14Z |
| **PublishMode** | **PUBLISHED** (LinkedIn, after PUBLISH_APPROVED) |
| **Engine** | Revenue-Focused Daily Content Engine v1 (not evidence-pack duplicate) |

---

## 1. Research summary (fetched this run)

### Store listing (Google Play)

| Claim | Evidence | Use in copy? |
|-------|----------|--------------|
| Public product exists | HTTP fetch Play page `id=com.iganapolsky.hermesmobile`; title **Hermes Mobile: AI Agent Leash**; developer **IgorGanapolsky** | Yes |
| Free + IAP | `itemprop="price" content="0"`; In-app purchases; listing text **LEASH PRO ($19.99/mo)** | Yes — use **$19.99/mo** from public listing (code label is `$19/mo`; prefer store for public CTA) |
| Positioning (public description) | “Hermes is the leash for AI coding agents… Approve or deny risky commands before they touch production.” Chat free; Leash Pro for approve/deny + gate rules | Yes |
| Updated | Listing shows **Updated on Jul 12, 2026** | Optional |
| Installs | HTML signals **0+** downloads; no public install count | **Never** imply traction |
| Star rating / reviews | No star rating, no review count, no review bodies parseable this run | **OMIT** entirely |
| Data safety | App may collect/share app activity, performance, device IDs; encrypted in transit; Sentry-class telemetry possible | **Never** say “zero telemetry”; “crash logs only, never sold” only if verified elsewhere — this pack does **not** claim zero telemetry |

### App Store (iOS)

| Claim | Evidence |
|-------|----------|
| **Not public** | `https://itunes.apple.com/lookup?bundleId=com.iganapolsky.hermesmobile&country=us` → **`resultCount: 0`** |

**Rule:** Do not link App Store. Do not say “available on iOS” / “on the App Store.”

### In-app monetization (code, secondary)

- `src/constants/monetization.ts`: `THUMBGATE_PRO_PRICE_LABEL = '$19/mo'`, `FREE_LEASH_APPROVALS_PER_WEEK = 10`, product name **ThumbGate Leash**
- Public Play listing says **LEASH PRO ($19.99/mo)** — social copy should say check Play for live IAP; safe external phrasing: **free chat; paid Leash for remote approve/deny (~$19.99/mo on Play)**

### Continuous E2E (device proof)

- `docs/proofs/continuous/latest.json`: `e2e=skipped`, `unit=skipped` (load wait timeout). **Do not** claim device E2E pass.

### Competitor watch (one timely, honest contrast)

| Player | What research showed | Honest contrast |
|--------|----------------------|-----------------|
| **Claude Code Remote Control** | Official Anthropic docs (`code.claude.com/docs/en/remote-control`): continue a **local Claude Code** session from Claude mobile/web; research preview; Claude-only surface | Great if you live in Claude Code only. Hermes Mobile is a **vendor-neutral phone control plane for agents behind YOUR Hermes gateway** — not a replacement for Anthropic’s product, not “native Cursor/OpenClaw gating.” |
| Hermes-Relay / name collisions | GitHub search surfaces community “Hermes Relay” projects (e.g. pocket chat for Hermes Agent). **Axiom-Labs Hermes-Relay URL 404 this run** — do not invent product claims | Name collision risk only; no attack post |

### “Why now” (one timely discourse)

**GhostApproval / deceptive human-in-the-loop (early July 2026 reporting):**  
CSO Online (Jul 9, 2026) summarized Wiz research: a vulnerability pattern where AI coding assistants’ confirmation prompts can **conceal the real target** of a dangerous action, so a human “approves” under false UI. Named products in that reporting include Claude Code, Cursor, and others.

**Why it matters for Hermes content (without overclaiming):**  
Human-in-the-loop is only as strong as **what the human actually sees before execution**. Hermes’s product bet is **pause + visible gated command (and risk tier) on a phone card before the tool runs on your gateway** — not after-the-fact diff review, and not “trust the agent’s self-report.”  
**Do not claim** Hermes “fixes GhostApproval” or patches those vendors. Claim only: outer-loop design goal = **honest approval surface + approve-before-run for agents you gate through your gateway.**

Supporting context (general, not fabricated metrics): 2026 discourse on agents with shell/filesystem access, long-running sessions, and production HITL approvals (LangGraph/HITL guides, agent-cost runaway narratives).

### Hard truth guards (this pack)

- ~0 installs / $0 revenue signals → no “thousands of devs,” no social proof theater  
- iOS not public  
- No star rating claimed  
- No “zero telemetry”  
- No native multi-vendor agent APIs claimed  
- Reddit already mod-removed once today for self-promo → **not** today’s primary channel  

---

## 2. Chosen platform + persona + pain + angle

| Slot | Choice | Why fresh vs 14-day memory |
|------|--------|----------------------------|
| **Platform** | **LinkedIn** | Reddit used + mod-removed 2026-07-13; X thread published same day; HN Show dead. LinkedIn drafts exist but **different angle** (desk/away, cloud credits). Revenue/authority fit. |
| **Persona** | **#8 Security engineer** | Memory only has `indie_operator` / solo founder. Not used. |
| **Pain** | **HITL that can lie** — you approve a confirm UI that doesn’t show the real command target | Prior angle = unsupervised agent away from desk. New scenario: **trust boundary of the approval surface itself.** |
| **Angle** | **Outer-loop honesty**: approve-before-run on a card you control, for agents behind your own gateway — contrasted honestly with Claude-only Remote Control | Not rm -rf couch sprint; not runaway token loop as lead. |
| **CTA** | Play install (Android) in **first comment only**; soft path to ThumbGate Leash / free weekly approvals — no purchase hard-sell in body | Platform rule: link not in post body. |

**Revenue chain this post optimizes:**  
LinkedIn authority → Play visit → install → pair gateway → first chat (free) → hit Leash approve moment → free 10/wk or **$19.99/mo** Leash Pro (store).

---

## 3. Final post (paste-ready — LinkedIn)

**Status:** **PUBLISHED** 2026-07-14 via logged-in Chrome as Igor Ganapolsky.

```text
Security engineers already know this: human-in-the-loop is not a feature checkbox.

It’s a trust boundary.

This month’s GhostApproval research made that concrete for AI coding tools: if the confirmation UI hides what the agent is actually about to do, “Approve” is theater. The human becomes the last weak link, not the control plane.

I build for a narrower job than “chat with Claude from the couch.”

I want a phone control surface where a risky tool call on MY machine can pause, show me the gated command and risk tier, and wait for Approve or Deny BEFORE it runs — then remember a durable deny when I thumbs-down.

That’s Hermes Mobile (Android): free chat/steer against a Hermes gateway you operate; ThumbGate Leash is the paid unlock for those remote approve/deny cards (check Play for live pricing — listing shows Leash Pro at $19.99/mo; free weekly allowance exists in-app).

Honest limits, because security people will smell hype:
• Not affiliated with Anthropic, OpenAI, Cursor, or Nous
• Not a patch for vendor-side confirmation bugs
• Works for agents routed through YOUR Hermes gateway — not “native Cursor gating”
• Cellular often needs Tailscale (or equivalent), not pure 5G magic
• iOS is not on the public App Store yet (Apple lookup returns 0 results; do not claim “live” or invent review status)
• Crash/product telemetry can exist (Sentry-class); I won’t say “zero telemetry”

If you already use Claude Code Remote Control: great product for Claude-only local sessions. Different problem if you want a vendor-neutral outer loop on hardware you own.

If you review agent tool policy for a living: what do you require to be on the approval surface before a human is allowed to tap Approve?
```

**Character/structure notes:** Story + insight, founder voice, ends on a technical question (engagement without shill tone). No Play URL in the post body.

---

## 4. Link / CTA placement (LinkedIn rule)

**First comment (post immediately after publishing the body):**

```text
Android (Google Play): https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile

Source / setup docs: https://github.com/IgorGanapolsky/mac-yolo-safeguards/tree/main/hermes-mobile

Chat is free. Remote approve/deny is Leash (free weekly allowance in-app; Pro on Play ~$19.99/mo — confirm live store).

iOS: not public yet. DMs open if you want a critical read of the pairing + gate model.
```

**Do not put** the Play link in the main post.  
**Do not** multi-post Reddit variants of this today (mod-remove risk still hot).

---

## 5. Optional micro-adaptations (NOT primary; only if second channel needed later)

### X (only if LinkedIn already live; different hook)

```text
HITL fails when the confirm UI lies.

GhostApproval-class bugs made that hard to ignore for coding agents.

I built phone approve/deny cards that gate tools on YOUR machine before they run (Hermes gateway). Not a vendor patch. Android only for now.

(link in reply)
```

### Reddit — **blocked for this angle this week**

Value-only security discussion of GhostApproval/HITL surfaces is fine **without** app link. Do not re-shill Hermes on r/LocalLLaMA after 2026-07-13 removal.

---

## 6. Memory update (TSV)

See `memory-update.tsv` in this directory. Append to rolling 14-day log when pasting into the engine runner.

---

## 7. Publish checklist (human)

- [ ] PublishMode still DRAFT_ONLY unless Igor sets PUBLISH_APPROVED  
- [ ] LinkedIn account authenticated  
- [ ] Post body without URL  
- [ ] First comment with Play + GitHub within 60s  
- [ ] No iOS live claim  
- [ ] No install/rating/traction claim  
- [ ] No “zero telemetry”  
- [ ] Capture PostURL into memory when live  


---

## 8. Publish receipt

| Field | Value |
|-------|--------|
| **Platform** | LinkedIn |
| **Account** | Igor Ganapolsky (logged-in Chrome) |
| **Post URL** | https://www.linkedin.com/feed/update/urn:li:share:7482591296050728960/ |
| **URN** | urn:li:share:7482591296050728960 |
| **Visibility** | Anyone (on or off LinkedIn) |
| **Body** | GhostApproval / HITL trust-boundary post; no Play URL in body |
| **First comment** | Play + GitHub + Leash soft CTA + iOS not public |
| **Proof** | `docs/social/proofs/proof-linkedin-2026-07-14.png`, `docs/social/proofs/linkedin-url.txt` |
| **Verified** | Live page: postHasGhost/HITL/iOS honest; comment has Play, GitHub, $19.99 |
| **Published (local)** | 2026-07-13 evening ET / 2026-07-14 UTC |
