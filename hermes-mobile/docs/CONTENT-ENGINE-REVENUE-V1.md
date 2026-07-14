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

## Latest run

- [revenue-engine-2026-07-13/](./social/revenue-engine-2026-07-13/) — LinkedIn multi-stack / Claude Remote Control angle — **Drafted, NOT published**

## Related

- [PROMOTION-PLAYBOOK.md](./PROMOTION-PLAYBOOK.md) — paid attribution (separate from organic drafts)
- [ASO-POSITIONING-SOCIAL-JULY-2026.md](./ASO-POSITIONING-SOCIAL-JULY-2026.md)
- [social/README.md](./social/README.md)
