# Show HN — Hermes Mobile (approve AI agents from your phone)

**Status:** PUBLISHED 2026-07-13 — https://news.ycombinator.com/item?id=48898789  
**Play:** https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile

---

## Title

Show HN: Hermes Mobile – approve Cursor/Claude agent tool calls from your phone (your Mac, not cloud credits)

## Body

I run local coding agents on a Mac and kept getting burned by runaway tool loops while away from the desk — `git push --force`, `rm -rf`, deploy scripts, the usual.

**Hermes Mobile** is a phone remote for agents already running on **your machine**:

- **Hermes Chat** — free: talk to your gateway from cellular or Wi‑Fi (Tailscale when off-LAN)
- **Leash** — **10 routed approvals/week free**, then **Leash Pro** ($19.99/mo) for unlimited mobile approval cards + standing gate rules
- QR pair; API keys stay on your computer — not another cloud agent inbox

This is not Termux-on-phone and not OpenAI-only Codex mobile. It's the operator UI for Hermes / Cursor / Claude Code style workflows on hardware you control.

Android is live on Play. iOS is in App Store review.

Happy to answer setup questions. Gateway repo: https://github.com/IgorGanapolsky/mac-yolo-safeguards

Play: https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile

---

## First comment (optional, post immediately after)

Demo path for reviewers / curious HNers without a paired Mac: the app supports `hermes://setup?demo=1` for a sandboxed walkthrough. Real use needs your own gateway + Tailscale for off-Wi‑Fi.
