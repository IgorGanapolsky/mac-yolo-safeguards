# Hermes Mobile — Revenue-Focused Daily Content Engine v1

**Canonical mode: `DRAFT_ONLY`**

This engine produces **paste-ready drafts only**. It must **never** auto-publish via Chrome, LinkedIn/X APIs, Reddit, or any browser automation. Status for every run is **Drafted** — never **Posted**.

## Override vs prior engines

| Prior behavior | v1 rule |
|----------------|---------|
| Auto-publish / claim Posted | **Forbidden** |
| Chrome posting | **Forbidden** |
| Output | Files under `docs/social/revenue-engine-YYYY-MM-DD/` + memory TSV append |

## Daily ritual

1. Read `docs/social/content-engine-memory.tsv` (14 days) + campaign folders for hooks.
2. Mandatory research: Play live listing, iTunes `bundleId` lookup, monetization code, `latest.json` E2E, one competitor, one why-now search, differentiator check, telemetry honesty.
3. Pick **one** platform (rotate LinkedIn / X / Dev.to; Reddit only if discussion-first with **no** store link — else SKIP).
4. Write: `RESEARCH.md`, `DECISION.md`, `FINAL-POST.md`, `CTA-PLACEMENT.md`, `MEMORY-LINE.tsv`; append memory TSV.
5. Stop. Human publishes later if desired.

## Competitor / why-now angles (keep honest)

| Angle | Use when | Hard truth |
|-------|----------|------------|
| **OpenClaw + Ollama** always-on messaging agent | Viral local-agent / Telegram-bot weeks | Same shape as Hermes gateway+chat; our wedge is **approve-before-execute** + multi-agent gates — do **not** claim native OpenClaw integration until reproduced. Never dual-bot on one Telegram token. Positioning: repo `docs/OPENCLAW-VS-HERMES.md`. |
| Hosted Hermes / MyClaw always-online | Hosting platform launches | Hosting ≠ hard stop / freeze guard (`docs/HERMES-HOSTED-RELIABILITY.md`). |
| Cursor Mobile / Claude Remote Control | Remote-control news | Vendor-neutral: any agent **behind your Hermes gateway**. |

**Differentiator checklist (must be true before claiming):**

- Phone approve/deny **before** risky tool runs (Leash) — not after-the-fact chat summary
- BYO gateway + optional $0 local Ollama (zero-spend) on operator Mac
- Honest connection states (no “Connected” + “Can’t reach” at once)
- Crash logs only (Sentry) — never “zero telemetry”
- No ads / no rate-to-unlock

## Latest run

- [revenue-engine-2026-07-13/](./social/revenue-engine-2026-07-13/) — LinkedIn multi-stack / Claude Remote Control angle — **Drafted, NOT published**

## Related

- [PROMOTION-PLAYBOOK.md](./PROMOTION-PLAYBOOK.md) — paid attribution (separate from organic drafts)
- [ASO-POSITIONING-SOCIAL-JULY-2026.md](./ASO-POSITIONING-SOCIAL-JULY-2026.md)
- [social/README.md](./social/README.md)
