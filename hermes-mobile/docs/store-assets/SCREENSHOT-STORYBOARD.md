# Screenshot storyboard — Hermes Mobile — STELLAR JULY 2026 (no dogfood)

Canonical spec: [STORE-ASO-JULY-2026.md](../STORE-ASO-JULY-2026.md) §2 + [STORE-LISTING-STELLAR-JULY-2026.md](../STORE-LISTING-STELLAR-JULY-2026.md) §2.
Monetization wedge: [MONETIZATION-PROMOTION.md](../MONETIZATION-PROMOTION.md), [COMPETITIVE-REPLIT-AGENT.md](../COMPETITIVE-REPLIT-AGENT.md).

> **July 11 2026 Fix:** Prior screenshots shipped duplicate frames (01 and 05 same chat list, only caption band swapped) plus dogfood thread "Print money make money faster" visible. That fails brand-new-user test and breaks stellar conversion. This doc forbids dogfood threads and enforces distinct story.

## July 2026 Audit — what was wrong (fixed in this revision)

| Issue | Impact | Fix |
|-------|--------|-----|
| **Duplicate frames 01/05** — identical chat list UI | Wastes 2/6 frames, looks unfinished | Frame 5 now shows **completed chat bubble + 👍 thumb tapped**, not session list |
| **Dogfood "Print money make money faster"** in frames 1&5 | Unprofessional, spammy, violates fresh-user onboarding | Demo threads now: "Approve production deploy", "Review PR #107 safety rules", "Mac freeze guard fired", "Pair new Mac", "ThumbGate on last reply", "Cellular + Tailscale status" |
| **Feature graphic v1 only** | Weak browse CVR | v2 shipped (1024x500 outcome + proof) |
| **No Play promo video** on live listing | Misses 15-35% CVR lift | 22s script + rendered video ready in `store-assets/` |

## Capture commands (clean demo, no real user threads)

```bash
cd hermes-mobile
# Clean install, brand-new user, demo mode — NEVER capture Igor's real "make money faster" threads
# Demo bootstrap uses hermes://setup?demo=1 and hides ConnectMacGate dogfood
HERMES_ANDROID_DEVICE=R3CY90QPM7E bash scripts/capture-store-screenshots.sh --demo
# Framed multi-device exports (caption bands baked in):
bash scripts/generate-store-screenshots.sh
# Verify no duplicate frames + no dogfood words in OCR:
python3 scripts/_assert_store_frame_distinct.py fastlane/store-capture/raw
python3 scripts/_assert_store_no_dogfood.py fastlane/metadata --ban-list "make money,Print money,freelance,crypto"
```

## Frame spec — STELLAR 6-frame story (Hook → Journey → Proof) — JULY 11 2026

**Framework:** Hook (safety) → Journey (approve/chat/pair) → Proof (memory + connectivity) — per [SCREENSHOT-STORYBOARD-2026](../SCREENSHOT-STORYBOARD.md) and Launch Shots 2026.

Each frame MUST show a **different screen/moment**. Reusing same chat list with different caption = REJECTED (duplicate frames).

| # | Screen / Deep link | Clean demo content (NO dogfood) | Caption (≤7 words, outcome-first) | Keywords | Story beat |
|---|--------------------|----------------------------------|----------------------------------|----------|------------|
| **1 — Hero** | `hermes://chat` demo, Connected pill green | Thread titles: "Approve production deploy", "Review PR #107 safety rules", "Mac freeze guard fired" — NO money threads | **Approve AI agents from phone** | approve, AI agent, mobile | Outcome — standalone ad (Play search) |
| **2 — Safety** | `hermes://leash` blocked `git push --force` diff | Blocked card with real diff, Approve/Deny visible | **Block destructive commands remotely** | block, commands, safety | Problem → solution |
| **3 — Pro** | Pro tab: standing gate rules list | Gate rules list or paywall $19.99/mo visible | **Standing gate rules synced** | gate rules, Leash Pro | Monetization hook |
| **4 — Onboard** | `hermes://settings?pair=qr` QR flow | QR scan with numbered steps, no Tailscale jargon in first run | **Pair your Mac in one scan** | pair, Mac, QR | Onboarding proof |
| **5 — Memory** | Chat thread: completed assistant reply + 👍 tapped | **DIFFERENT** from frame 1: single thread detail with ThumbGate thumbs, not session list | **ThumbGate memory on replies** | ThumbGate, feedback | Differentiator vs SSH clients — FIXES duplicate |
| **6 — Reach** | Connection panel: cellular icon + Tailscale | "Use Tailscale from cellular" copy, honest offline states | **Works on cellular + tunnel** | cellular, remote, tunnel | Honest connectivity (vs competitors) |

**Order rationale:** Safety → approval → paid tier → setup → memory → connectivity. Matches campaign value props: wallet guard, machine guard, thumb from couch. See [STORE-ASO-JULY-2026.md §2].

**Distinctness rule:** 01 and 05 previously failed visual audit (same chat list UI, only caption band differs). Now 01 = session list with professional threads, 05 = single thread with 👍 feedback — visually distinct + semantically distinct.

## Caption band (all frames) — stellar July 2026 spec

- Top panel: 120px, `#111827`, no "Print money" threads
- Headline: Space Grotesk Bold 48px white, outcome-first, keyword-rich (not "Easy to Use")
- Accent keyword: `#22D3EE` per [STORE-ASO-JULY-2026.md]
- Device frame: centered, 92% width, 8px `#374151` border, 24px radius
- OCR-indexed (Apple + Google index caption text in 2026 per Phiture/ASO World) — captions must be screenshot text, not burned into flag art

## Squint test + brand-new-user test

- Shrink to 200px width — caption readable? If not → 56px font or shorter copy.
- Brand-new user sees onboarding steps, finds computers, pairs with QR — never "gateway", "LAN", "Pair relay" in first frame.
- NEVER show "Print money make money faster", "make money faster #3", or Igor's real money threads — violates [AGENTS.md] fresh-user onboarding contract and makes listing look like money-scheme spam.

## Caption band (all frames)

- Top panel: 120px, `#111827`
- Headline: Space Grotesk or Inter Bold, 48px, `#F3F4F6`
- Accent keyword: `#22D3EE`
- Device frame: centered, 92% width, 8px `#374151` border, 24px radius

## Squint test

Export at 200px width. If caption unreadable → increase font to 56px or shorten copy.
