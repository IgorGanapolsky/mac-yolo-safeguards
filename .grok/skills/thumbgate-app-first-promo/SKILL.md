---
name: thumbgate-app-first-promo
description: >
  HARD default product narrative for ThumbGate social/promo: ThumbGate.app is the
  hero product and primary CTA; Hermes Mobile and thumbgate.ai are downstream defaults.
  Auto-invoke when: promote ThumbGate, post everywhere, fill the gaps, social promo,
  content engine, Creator Platform Promo, fan-out, LinkedIn/Medium/dev.to/X/Bluesky/
  Threads/Reddit/HN distribute, "did we post", Continuity promo, or any plan that
  still treats store/mobile as co-equal heroes. Slash: /thumbgate-app-first-promo.
---

# ThumbGate.app-first promo (canonical product order)

**Standing (2026-07-26):** Promote **https://thumbgate.app/** as the main product.
Hermes Mobile + thumbgate.ai ride **downstream** from that funnel — not co-equal
heroes on every post.

Canonical engine (repo): `docs/social/hermes-mobile-content-engine.md`  
Memory log: `docs/social/hermes-mobile-content-log.tsv`  
Fan-out mechanics: [[thumbgate-chrome-promo-fanout]]  
UTMs / cash CTAs: [[thumbgate-promo-buy-links]]  
Hashnode: [[no-hashnode-publish]] · Zernio: [[no-zernio-social-publish]] · Double-post: [[never-double-post]]

## Ordered funnel (optimize for this)

```
post / article
  → ThumbGate.app (hero link + UTM)
      → pair / dashboard / Continuity
      → /go/android · /go/ios  (secondary)
      → thumbgate.ai only when pain = gates / token burn / Pro
  → retained user → first success → honest review (optional)
```

Do **not** make Play/App Store the default first link unless `PrimaryProductMode=MOBILE_ONLY`
and Research Receipt justifies it.

## Product stack (truth hierarchy)

| Priority | Product | Role |
|----------|---------|------|
| **1 Hero** | https://thumbgate.app/ | Web remote for Hermes agents; Continuity when Mac offline |
| **2 Secondary** | Hermes Mobile paid stores via `/go/android` `/go/ios` | Phone remote — **paid download only** |
| **3 Conditional** | https://thumbgate.ai/ | Reliability / diagnostic / Pro — only when that is the angle |

**Hero line:** Control your Hermes agents from any browser — on ThumbGate.app.

**Simple mobile line (secondary):** Same agents on your phone — paid Hermes Mobile download.

### UTM hero template

```
https://thumbgate.app/?utm_source=<channel>&utm_medium=social&utm_campaign=<batch>&cta_id=<batch>_<channel>_home
```

### Cash / reliability (when angle needs it — still not the hero)

```
https://thumbgate.ai/diagnostic?utm_source=<channel>&utm_medium=social&utm_campaign=<batch>&cta_id=<batch>_<channel>_diag
https://thumbgate.ai/checkout/pro?utm_source=<channel>&utm_medium=social&utm_campaign=<batch>&cta_id=<batch>_<channel>_pro
```

Every non-Reddit public promo must include **thumbgate.app** (or platform-forbidden → first comment).  
Cash path links must be live (HTTP 200) same day. Never invent Stripe placeholders.

## Hard bans

| NEVER | ALWAYS |
|-------|--------|
| Co-equal "web + mobile + GitHub" hero pressure on every post | **≥4 of 7 days** hero CTA = thumbgate.app |
| Free store install claims | Paid Android `com.iganapolsky.hermesmobile.paid` only; re-fetch prices |
| Hashnode publish / re-try | Mark Hashnode **FROZEN** |
| Zernio / Creator Platform Promo as publish | Chrome / direct APIs; prove LIVE matrix |
| "Posted everywhere" without per-channel LIVE URLs | Print honest matrix |
| Oak & Sparrow / Gatekeeper name-drops | Omit entirely |
| Fake Continuity / device claims | Match live thumbgate.app copy; E2E pass for device language |
| Affiliation with Nous / Anthropic / OpenAI / Cursor / Fly | Name + @ when relevant, **no affiliation** |

## Auto-invoke chain (every promo)

1. **This skill** — product order + hero CTA  
2. [[no-zernio-social-publish]]  
3. [[no-hashnode-publish]]  
4. [[never-double-post]]  
5. [[thumbgate-promo-buy-links]] — keep/add cash CTAs; **hero remains thumbgate.app**  
6. [[thumbgate-chrome-promo-fanout]] — channel matrix + Chrome recipes  
7. [[linkedin-account-ig5973700]] before LinkedIn  
8. [[social-product-creator-mentions]] for Nous Hermes / Fly when relevant  

## Research (failures → omit claim)

1. Live fetch thumbgate.app (title, hero, Continuity wording).  
2. Live fetch stores (paid packages only) + iTunes lookup.  
3. `hermes-mobile/docs/proofs/continuous/latest.json` before "works on device".  
4. Monetization constants / Continuity docs before selling Continuity.  
5. One competitor + one community pain.  

## PublishMode

| Mode | Behavior |
|------|----------|
| `DRAFT_ONLY` | Research + drafts only |
| `PUBLISH_APPROVED` or CEO said promote/post everywhere | Fan-out with LIVE proof matrix |

Default desktop: **no Chrome hijack** unless this message authorizes publish/promo (standing promo phrases count). Prefer non-daily focus when possible.

## Exit criteria

- [ ] Hero CTA is thumbgate.app (unless MOBILE_ONLY / GATES_AI_ONLY justified)  
- [ ] Matrix with LIVE / PARTIAL / BLOCKED / FROZEN  
- [ ] Every LIVE row has public URL + intended text  
- [ ] Hashnode FROZEN, zero Zernio publish  
- [ ] Content log TSV rows + private send log updated  
- [ ] Continuity / device claims match live evidence  

## Related

- Repo engine: `docs/social/hermes-mobile-content-engine.md`  
- Continuity sell craft: [[sell-thumbgate-continuity]]  
- Cash outbound: [[execute-revenue-cash-path]]  
