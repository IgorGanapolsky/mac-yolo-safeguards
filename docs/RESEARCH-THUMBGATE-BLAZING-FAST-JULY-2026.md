# Research: Blazing-fast ThumbGate web (July 2026)

- **Run ID:** `trun_d3be5e813aa9497095d4635a7d7fc0e2` (parallel-cli pro-fast)
- **Raw:** `parallel-research/thumbgate-blazing-fast-july-2026.md` / `.json`
- **Interaction ID:** same as run_id (use as `--previous-interaction-id` for follow-ups)
- **Live measurement date:** 2026-07-22 (agent, MIA egress)

## Verdict

The public site is slow because the **marketing page is fully dynamic + `no-store` + D1 session read**, and Sign-in is a **multi-hop full navigation into a heavy WorkOS AuthKit SPA** (~108 KB HTML, ~44 scripts). Workers cold-start is **not** the primary story.

## Live measurements (2026-07-22)

| Probe | Result |
|-------|--------|
| Landing TTFB (5 hits) | **0.15–3.09 s** (avg ~1.73 s) |
| Landing `Cache-Control` | **`no-store`** |
| Landing HTML | ~27 KB, 10 scripts, 9 modulepreloads |
| `/api/auth/login` TTFB (5 hits) | **0.19–0.27 s** (fast alone) |
| Login hop chain | Worker → WorkOS → AuthKit (sum of hop TTFBs often **~2–3 s** lab) |
| AuthKit document | **~108 KB**, **~44** `<script` tags |
| Sign-in CTAs on landing | **3×** same `/api/auth/login` |

User-perceived “20 seconds” is consistent with: slow/cold landing + full navigation + AuthKit SPA boot + possible third-party OAuth, not a single 20 s Worker hang.

## Root causes in *our* code

1. `app/page.tsx` calls `await currentSession()` → `cookies()` + **D1 join** on every public hit → forces dynamic/`no-store`.
2. No edge cache for anonymous marketing HTML.
3. Login does D1 `auth_states` INSERT/DELETE before redirect (necessary for CSRF state; can be optimized later with signed state JWT).
4. Triple sign-in CTAs (UX noise; not the latency root).
5. AuthKit host is external; we cannot make WorkOS’s SPA tiny, only get users there faster and with fewer preceding waits.

## Ranked actions (research + measurement)

### P0 — biggest wins

1. **Static public shell:** remove `currentSession()` from `/`; personalize “Sign in” vs “Open dashboard” via tiny client fetch to `/api/me` after paint.
2. **Cache-Control for anon marketing:** `public, s-maxage=300, stale-while-revalidate=86400` when no session cookie (or always for shell + client auth hole).
3. **Preconnect** `api.workos.com` + AuthKit host in landing `<head>`.
4. **One primary Sign-in CTA** (nav secondary optional); drop duplicate panel CTA.

### P1

5. Sign-in = **top-level navigation** (already `<a href>`-style; avoid any client work before navigate).
6. Keep ordinary login **without `max_age=0`** (already fixed on prod).
7. Early Hints / modulepreload only for LCP-critical assets.
8. RUM: Cloudflare Web Analytics + field LCP/INP budgets.

### P2

9. Signed OAuth `state` cookie instead of D1 write on every login (removes D1 from hot path).
10. Speculation Rules carefully (not authenticated dashboard shells).
11. Bundle discipline on Worker (AuthKit not in marketing graph).

## $10 WorkOS spend still holds

Speed work must **not** buy WorkOS custom domains ($99/mo) or enterprise SSO connections.

## Do not

- Blame Workers isolate boot first (sub-ms; problem is dynamic HTML + third-party SPA).
- Proxy AuthKit HTML through our origin.
- Cache authenticated dashboard HTML at the edge.
- Add more Sign-in buttons hoping conversion improves.
