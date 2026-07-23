# ThumbGate Web reliability evidence — 2026-07-23

## Gate command

```bash
node tools/verify-thumbgate-web-reliability.js
```

## Verified layers

| Layer | Result | Evidence |
|-------|--------|----------|
| Control plane health | PASS | `/api/health` → ok, database available, workos/stripe/cloudRunner configured |
| Public endpoints | PASS | `/`, `/dashboard`, brand assets 200 |
| Auth gates | PASS | devices/tasks/threads/lessons 401 without session |
| Store redirects | PASS | `/go/android`, `/go/ios` 302 |
| Mobile CSS app shell | PASS | live CSS: 100dvh, hermes-scroll-pane, composer relative, metrics hidden |
| Mobile JS contracts | PASS | data-mobile-tab, route explain, run error handling strings |
| Unit/source tests | PASS | 24 frictionless/rendered-html + 17 vitest (routing/pairing/feedback/continuity) |
| Playwright layout (iPhone 14) | PASS | no composer/tab overlap; tab panes isolate; body overflow locked |
| Fleet connectivity | PASS | 2/3 devices online (MacBook Pro + mini); canary offline expected |
| Task outcomes | MIXED | 10 completed / 5 failed historically — see failure classes below |

## Live fleet snapshot (D1 remote)

- devices_active: 3
- devices_online_2m: 2 (Pro + mini)
- threads: ~261
- tasks_total: 15 (10 completed, 5 failed, 0 active)
- feedback_rows: 0 (lessons = ratings only)
- tasks_24h: 4, failed_24h: 1

## Task failure classes (reliability debt — not layout)

1. **Local timeout** — `The operation was aborted due to timeout`
2. **Invalid model name** — `model=hermes` rejected by local completions proxy
3. **Cloud model access** — Together/non-serverless GLM access error on Continuity path

These are **runtime/model routing** reliability issues, separate from the mobile shell.

## Deep research (PWA, Aug 2026)

- run_id: `trun_26f1bd2259b04955882c51cba558ce57`
- report: `parallel-research/pwa-mobile-web-august-2026.md`
- Applied: app shell, 100dvh, overflow lock, tab panes, relative composer
- Not yet: full installable PWA (manifest `id` + service worker), visualViewport keyboard lift

## How to re-verify

```bash
node tools/verify-thumbgate-web-reliability.js
cd apps/hermes-control-plane && node --test tests/frictionless-onboarding.test.mjs
```
