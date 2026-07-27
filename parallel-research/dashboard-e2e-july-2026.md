# E2E Testing Authenticated Cloudflare-Worker Dashboards (July 2026)
*A practical, opinionated stack for vinext/Next-on-Workers SaaS dashboards — built around Playwright, the Cloudflare Vitest pool, and D1-backed WorkOS sessions.*

---

## 1. Recommended architecture (one diagram in words)

Three concentric layers, each with a different test runner and a different deployment target:

| Layer | Runner | Where it runs | What it proves |
|---|---|---|---|
| **Unit / contract** | `@cloudflare/vitest-pool-workers` (Vitest pool) | `workerd` in-process, no network | Pure functions, route handlers, D1 SQL queries, R2 bindings, KV, Queues |
| **API (handler) tests** | Same Vitest pool + `SELF.fetch()` | Inside `workerd`, with real bindings | API routes return the right status/body; auth middleware rejects bad cookies |
| **Browser E2E** | Playwright (`@playwright/test`) | Chromium/Firefox/WebKit against a **deployed preview** Worker URL | Whole-stack behavior: SSR + client hydration + real D1 + real WorkOS cookies |
| **Synthetic / post-deploy smoke** | Playwright via Checkly (or scheduled GitHub Actions cron) | Headless against production | Liveness, latency, no broken pages |

> **Why this shape:** Vinext is "Next.js on Vite that targets Workers" (Cloudflare, 2026), so the React component layer compiles to the same bundle that runs on the edge. That means *component tests run on the same runtime as production* — but they only catch the component-level bugs. Auth, cookies, SSR redirects, RSC streaming, and "the button is on the left" all need a real browser against a real Worker URL.

---

## 2. Tooling checklist (the actual install list)

```bash
# Vinext + Cloudflare
pnpm add -D @cloudflare/vitest-pool-workers vitest wrangler @cloudflare/workers-types

# Browser E2E
pnpm add -D @playwright/test @playwright/checkly    # or just @playwright/test if you self-host

# Auth helper
pnpm add -D jsonwebtoken jose                       # mint WorkOS-issued JWTs in tests

# Reporting & merge
pnpm add -D @playwright/blob-reporter dotenv-cli
```

Pin: Playwright `>=1.55`, Vitest `>=3`, `wrangler` `>=4`, vinext `>=0.6` (May 2026 line). Use Node 22 LTS for both local and CI.

---

## 3. Layering rules (where to put each assertion)

A clean rule of thumb for vinext dashboards:

- **Vitest-in-Workers** for: validation, SQL queries, the WorkOS session-verify code path, RBAC checks, request→response without DOM. Aim for ~70% of coverage.
- **Playwright** for: anything a user *sees or touches*: login redirect, dashboard chrome, drag-and-drop, the multi-device routing overlay, the "which machine ran my task?" page. Aim for ~30 high-value tests, not 500 flaky ones.
- **Checkly synthetic** for: 3-5 happy-path URLs (login → dashboard → task detail), run every 5 minutes from multiple regions. Alerts on failure. *Never* the place to test new behavior.

**Anti-pattern to retire:** spinning up `next start` and a local Postgres for "E2E". With Workers there's no Node process to spin up; the canonical local server is `wrangler dev` or a deployed `*-<sha>.workers.dev` preview.

---

## 4. Seeding D1 sessions without real WorkOS OAuth

Two viable patterns; pick one and never both.

### 4a. WorkOS Test SSO (preferred for behavior coverage)
WorkOS ships a **Test Identity Provider** in every staging environment ([86]). The Test IdP lets you script the full SP-initiated and IdP-initiated flows, including error and guest-email paths, with no real IdP and no real email. Use this when you care that the *integration* still works.

```ts
// tests/e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test';
const AUTH_FILE = '.auth/admin.json';

setup('auth via WorkOS Test SSO', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /sso/i }).click();
  await page.getByLabel('Email').fill('admin@thumbgate.test');
  await page.getByRole('button', { name: /test sso/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: AUTH_FILE });
});
```

### 4b. Direct D1 row seed + signed session JWT (preferred for everything else)
For all *other* tests, skip WorkOS entirely and inject a pre-baked session. Vinext's middleware typically trusts a cookie containing a signed JWT; in test mode, mint that JWT with a test-only secret and write the row into D1 ahead of time.

```ts
// tests/helpers/seed.ts
import { SignJWT } from 'jose';
import { env } from 'cloudflare:test';

export async function seedSession(env, opts: { userId: string; orgId: string }) {
  const secret = new TextEncoder().encode(env.AUTH_SECRET);
  const jwt = await new SignJWT({ sub: opts.userId, org: opts.orgId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, org_id, jwt, expires_at) VALUES (?,?,?,?,?)'
  ).bind(id, opts.userId, opts.orgId, jwt, Math.floor(Date.now()/1000) + 3600).run();
  return { id, jwt };
}
```

In Playwright:

```ts
test.beforeEach(async ({ context, baseURL }) => {
  const { jwt } = await seedSession(env, { userId: 'u_admin', orgId: 'o_thumb' });
  await context.addCookies([{
    name: '__session', value: jwt, domain: new URL(baseURL!).hostname,
    path: '/', httpOnly: true, secure: true, sameSite: 'Lax',
  }]);
});
```

This is ~100× faster than driving a real OAuth round-trip per test and never flaked because of email or IdP latency.

---

## 5. Multi-device routing UI assertions (hostname, not "MacBook Pro")

A dashboard like ThumbGate must show *which* physical/VM machine owns a deviceId — not a generic OS label. The assertion is best made on the **machine's hostname**, which Cloudflare Workers can read via `request.cf?.colo` (cheap, but gives a POP, not a host) or, more usefully, by having the device agent send `X-Forwarded-Host`-style metadata or a dedicated `GET /whoami` that returns its hostname.

For E2E you typically assert what the **UI** renders:

```ts
await expect(page.getByTestId('device-row-abc123'))
  .toContainText(/desktop-tower-[a-z0-9]{4}\.local/); // real hostname regex
await expect(page.getByTestId('device-row-abc123'))
  .not.toContainText(/MacBook/);                      // reject generic label
```

The `not.toContainText(/MacBook/)` matters because users (and designers) often paste the OS name into the wrong field. The hostname check stops the regression where the "machine name" is hardcoded to "MacBook Pro M3".

Use Playwright **`projects`** to run the same matrix against:

```ts
// playwright.config.ts
projects: [
  { name: 'desktop-chrome',  use: { ...devices['Desktop Chrome'],  viewport: { width: 1440, height: 900 } } },
  { name: 'mobile-pixel',    use: { ...devices['Pixel 7'] } },
  { name: 'mobile-iphone',   use: { ...devices['iPhone 15'] } },
  { name: 'tablet-ipad',     use: { ...devices['iPad (gen 7)'] } },
]
```

That covers the "multi-device routing" requirement *without* maintaining a parallel Pixel/iPhone farm.

---

## 6. CI on GitHub Actions (sharded, cached, deterministic)

```yaml
# .github/workflows/e2e.yml
name: e2e
on:  [push, pull_request]
jobs:
  shard:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix: { shard: [1, 2, 3, 4] }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4   # pinned Node 22
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps
      - name: Unit + handler tests (vitest-pool-workers)
        run: pnpm test:unit
      - name: Browser E2E (shard ${{ matrix.shard }}/4)
        run: pnpm test:e2e --shard=${{ matrix.shard }}/4
        env:
          CI: true
      - name: Upload blob
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v4
        with:
          name: blob-${{ matrix.shard }}
          path: blob-report-*
  merge:
    needs: shard
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright merge-reports --reporter html,github ./blob-*
        env: { PLAYWRIGHT_BLOB_REPORT_DIR: ./blob-* }
      - uses: actions/upload-artifact@v4
        with: { name: html-report, path: playwright-report }
```

Three rules that prevent 90% of CI flakes ([60]):

1. Always use **`--shard=N/M`** + **blob reporter** so partial failures don't lose trace/video artefacts.
2. Cache `~/.cache/ms-playwright` keyed on `package.json` hash; cold-cache installs dominate wall time.
3. Cap `maxFailures` in `playwright.config.ts` so a flaky single test never blocks merge — quarantine via `test.fixme(true, 'flaky: <issue>')` and a 7-day SLO.

---

## 7. Post-deploy smoke *without* desktop hijack

Two clean patterns:

**a. Checkly (recommended for prod).** A separate Checkly account owns the credentials, so the smoke check never touches a developer's browser. Checkly runs Playwright checks from 20+ regions on a cron, takes a screenshot, and pages you on failure. Crucially: it does not click anything in your real workstation browser, so there is no "desktop hijack" risk.

```ts
// checks/prod-smoke.check.ts
import { test, expect } from '@playwright/test';
test('ThumbGate prod smoke', async ({ page }) => {
  await page.goto('https://app.thumbgate.com/login');
  await page.getByLabel(/email/i).fill(process.env.SMOKE_USER!);
  await page.getByLabel(/password/i).fill(process.env.SMOKE_PASS!);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15_000 });
});
```

**b. GitHub Actions cron.** `on: { schedule: [{ cron: '*/15 * * * *' }] }` running the same suite against `https://app.thumbgate.com`. Use a dedicated deploy service-account so the credentials have no user privileges. Never run prod smoke in the developer browser tab that is logged into the dashboard with admin cookies — that is the hijack.

**c. The "headed-on-local" anti-pattern.** A developer hitting "run all tests" in Playwright Inspector on the prod URL, with their own admin cookies loaded, is exactly the hijack you're trying to avoid. Make CI the only place that targets prod.

---

## 8. Anti-patterns to retire in 2026

| Smell | Why it bites in vinext | Replacement |
|---|---|---|
| `await page.waitForLoadState('networkidle')` | RSC streams never settle on Workers SSR; networkidle stalls for the default 30 s and times out | Use `expect(locator).toBeVisible()` or `page.waitForResponse` with a specific URL |
| `page.locator('.btn-primary')` / `:nth-child(2)` | Every design tweak breaks tests | `getByRole('button', { name: /run task/i })`, or a stable `data-testid` |
| `route.fulfill()` registered *after* `page.goto()` | Vinext's edge fetch starts before your handler mounts; the request escapes the mock | Register handlers in `beforeEach`, or use `context.route` before navigation |
| Shared `page` across tests | Vinext's session cookies are per-context, not per-page; state leaks across suites | One fresh `context` per test (`fullyParallel: true`) |
| `if (process.env.CI) await page.screenshot()` | Screenshots land in two different places per CI vs local | Always capture; let `blob` reporter dedupe |
| `await sleep(500)` after click | Replaces a deterministic wait with a probabilistic one | `expect(locator).toHaveText(...)` or `waitForFunction` |
| Running E2E against `next dev` on the engineer's laptop | The engineer's desktop is the test environment; flakes compound | Run against `wrangler dev` in CI, or against a preview deploy |

The Playwright Best Practices guide lists these as the canonical anti-patterns; the same applies on top of vinext, with the addition that **Workers' streaming responses make `networkidle` even more dangerous** than in a Node-Express app.

---

## 9. Concrete E2E matrix for a ThumbGate-style control plane

Four user-visible flows, each broken into component / API / browser layers, with the exact assertion.

### Flow A — *Pair a new machine*

| Layer | What it asserts | How |
|---|---|---|
| **Unit / handler (Vitest-pool-workers)** | `POST /api/devices/pair` writes a row and returns a pairing code | `SELF.fetch('/api/devices/pair', { method:'POST' })` against seeded D1 |
| **API (Playwright `request`)** | Same endpoint, authed, returns 201 + JSON with `pairingCode` | `await request.post(...)`, `expect(res.status()).toBe(201)` |
| **Component (Vitest + Testing Library)** | `<PairDeviceDialog>` validates empty serial, blocks submit | Render via Vite; assert the disabled state |
| **Browser (Playwright)** | User pastes pairing code → list shows new row with **hostname**, not "MacBook Pro" | `expect(row).toContainText(/desktop-tower-/)` and `not.toContainText(/MacBook/)` |

### Flow B — *Select which machine runs a task*

| Layer | What it asserts | How |
|---|---|---|
| **Handler** | `PATCH /api/tasks/:id/runner` updates `runner_device_id` and invalidates `tasks-by-device` cache | Insert row, call endpoint, read back |
| **API** | 403 if user not in `org_id`; 200 otherwise | Two `request.fetch` calls, one with foreign session |
| **Component** | `<RunnerPicker>` shows hostname + status pill; empty state when no devices | RTL renders JSON state |
| **Browser** | Selecting a different device updates the *visible* machine name (real hostname, not generic label) | `await page.getByRole('combobox').selectOption(...); expect(page.getByTestId('current-runner')).toHaveText(/desktop-tower-[a-z0-9]+/)` |

### Flow C — *Pin a deviceId to a job*

| Layer | What it asserts | How |
|---|---|---|
| **Handler** | `tasks.runner_device_id` is required and foreign-keyed; 422 on missing | Insert + update with bad FK |
| **API** | Pinning persists across reloads | GET twice |
| **Component** | `<DevicePinChip>` shows hostname; `aria-pressed` toggles | RTL |
| **Browser** | Pin a device → reload → assertion survives | Reload via `page.reload()`, then `expect(chip).toHaveAttribute('aria-pressed','true')` |

### Flow D — *Assert real machine name in UI* (the headline assertion)

| Layer | What it asserts | How |
|---|---|---|
| **Handler** | `/api/devices/:id` returns `{ name: 'desktop-tower-bd7f.local', ... }` | Seed D1, fetch |
| **API** | Same | Same |
| **Component** | `<DeviceRow>` renders `name` not `os` | RTL with seeded prop |
| **Browser** | Real hostname rendered, NOT generic label | `expect(row.locator('[data-testid="device-name"]')).toHaveText(/^[a-z]+-[a-z0-9]+(-[a-z0-9]+)?\.local$/); expect(row).not.toContainText(/MacBook\|Windows\|Linux desktop/)` |

That last assertion is the one that would have caught the "MacBook Pro M3" regression: a hostname regex that *requires* an RFC-1123-ish label and rejects OS-only strings.

### Cross-cutting meta-tests

* **Auth bypass** — every authenticated page refuses an anonymous request with a 401 (browser layer asserts redirect to `/login`).
* **Cookie integrity** — `__Host-session` cookie has `Secure`, `HttpOnly`, `SameSite=Lax` (Playwright `request.get(...)` plus `context.cookies()`).
* **Session expiry** — set `AUTH_TTL=10s` in CI, wait 11 s, refresh, expect redirect.
* **D1 migration rollback** — apply a migration that drops a column; assert endpoints respond 500 *with a typed error code*, not a generic crash.
* **Workers cold start** — first request after deploy < 1.5 s on P50 (Checkly synthetic).
* **Time-zone / locale matrix** — run the "select machine" flow under `en-US`, `fr-FR`, `ja-JP`; hostname regex must pass in all three.

---

## 10. Cheat-sheet summary

* **Three test runners, one app:** Vitest-pool-workers for unit + handlers, Playwright for browser, Checkly (or a cron) for synthetic.
* **Auth in tests:** `Test SSO` for behavior; `D1 row + signed JWT` for everything else. Never both in the same test.
* **CI:** sharded Playwright with `--shard=N/M`, `blob` reporter, merge-reports in a separate job. Cache browsers. Cap `maxFailures`.
* **Smoke:** owned by a separate identity (Checkly or deploy-bot). Never run from a developer's browser.
* **Anti-patterns:** `networkidle`, generic CSS selectors, `sleep`, route-after-nav, shared page objects across suites, local prod-hits.
* **Multi-device:** Playwright `projects` with named `devices`, not a real device farm.
* **Hostname truth:** assert with a regex that requires an RFC-1123-ish label and rejects OS-only strings. That single assertion is what makes the "real machine name in UI" check robust.

---

### References

1. Cloudflare Workers Vitest integration (Vitest pool-workers) — https://developers.cloudflare.com/workers/testing/vitest-integration
2. vinext — Cloudflare Vite plugin that reimplements the Next.js API surface — https://github.com/cloudflare/vinext (and the launch post "How we rebuilt Next.js with AI in one week")
3. Playwright — Authentication and `storageState` — https://playwright.dev/docs/auth
4. Playwright — Projects (multi-browser / multi-device) — https://playwright.dev/docs/test-projects
5. Playwright — Best Practices (locators, web-first assertions, anti-patterns) — https://playwright.dev/docs/best-practices
6. Playwright — Sharding & the blob reporter merge workflow — https://playwright.dev/docs/test-sharding
7. Playwright — `webServer` config — https://playwright.dev/docs/test-webserver
8. Cloudflare D1 Wrangler commands (`migrations apply`, `execute`) — https://developers.cloudflare.com/d1/wrangler-commands
9. WorkOS — Test SSO (Test Identity Provider) — https://workos.com/docs/sso/test-sso
10. Checkly — Playwright Monitoring / synthetic checks — https://www.checklyhq.com/product/synthetic-monitoring

## References

1. *Vitest integration · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/testing/vitest-integration
2. *Testing · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/testing
3. *Configuration · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/testing/vitest-integration/configuration
4. *@cloudflare/vitest-pool-workers - npm*. https://www.npmjs.com/package/%40cloudflare/vitest-pool-workers
5. *vitest — AI agent skill - explainx.ai*. http://explainx.ai/skills/antfu/skills/vitest
6. *Authentication*. http://playwright.dev/docs/auth
7. *Playwright Best Practices: 8 Patterns for Stable E2E (2026 ...*. https://getautonoma.com/blog/playwright-best-practices-2026
8. *Fixtures*. https://playwright.dev/docs/test-fixtures
9. *API testing | Playwright*. http://playwright.dev/docs/api-testing
10. *Playwright Storage State Authentication Setup*. http://bondaracademy.com/blog/playwright-storage-state-authentication
11. *opennextjs/opennextjs-cloudflare: Open Next.js adapter for ...*. https://github.com/opennextjs/opennextjs-cloudflare
12. *opennextjs/cloudflare*. https://www.npmjs.com/package/%40opennextjs/cloudflare
13. *cloudflare/vinext: Vite plugin that reimplements the Next.js ...*. https://github.com/cloudflare/vinext
14. *Cloudflare*. https://opennext.js.org/cloudflare
15. *Next.js on Netlify*. http://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview
16. *Sharding | Playwright*. http://playwright.dev/docs/test-sharding
17. *GitHub Actions Playwright Matrix & Sharding Guide (2026)*. https://qaskills.sh/blog/github-actions-playwright-matrix-guide-2026
18. *GitHub - botre/parallel-playwright*. https://github.com/botre/parallel-playwright
19. *Reporting in CI - Currents Documentation*. https://docs.currents.dev/guides/parallelization-guide/playwright-sharding
20. *Flaky Test GitHub Actions: Detect, Quarantine & Fix (2026)*. https://testdino.com/blog/flaky-test-github-actions
21. *GitHub - StevenG0211/database-testing-demo: Playwright E2E ...*. https://github.com/StevenG0211/database-testing-demo
22. *Testing Authentication with Playwright: The Complete Guide<!-- --> | <!-- -->Apr 2026<!-- --> | Currents.dev Blog*. http://currents.dev/posts/testing-authentication-with-playwright-the-complete-guide
23. *D1 Database - Cloudflare Docs*. https://developers.cloudflare.com/d1/worker-api/d1-database
24. *Cloudflare D1 - Serverless SQL Database*. https://www.cloudflare.com/products/d1
25. *GitHub - lazors/playwright-seed-project*. https://github.com/lazors/playwright-seed-project
26. *Playwright Mobile Emulation: Devices, Viewport & iPhone Guide*. https://qaskills.sh/blog/playwright-mobile-emulation
27. *Playwright Mobile Emulation: Devices, Viewport & Config ...*. http://qaskills.sh/blog/playwright-mobile-emulation-guide
28. [Playwright Mobile Testing: Real Devices vs Emulators [2026]](https://testdino.com/blog/playwright-mobile-testing)
29. *Playwright device descriptors catalog (mobile/destkop ...*. https://github.com/playwright-php/devices
30. *Playwright Mobile Emulation: Devices & Viewport Reference*. http://qaskills.sh/blog/playwright-mobile-emulation-device-guide
31. *Playwright Locators - Comprehensive Guide for 2026 - BugBug.io*. https://bugbug.io/blog/testing-frameworks/playwright-locators
32. *Flaky tests in Playwright: every pattern that breaks CI, and ...*. https://mergify.com/learn/flaky-tests/playwright
33. *Locators*. https://playwright.dev/docs/locators
34. *Fixing Flaky Tests in Playwright: A Step-by-Step Guide with ...*. https://deflaky.com/blog/playwright-flaky-tests
35. *Playwright Locators Guide: getByRole, getByText, ...*. https://momentic.ai/blog/playwright-locators-guide
36. *Go From Playwright Testing to Playwright Monitoring with ...*. http://checklyhq.com/docs/guides/playwright-testing-to-monitoring
37. *Smoke Testing Your SaaS: A Practical Guide for Founders - MakerKit*. https://makerkit.dev/blog/tutorials/smoke-testing-saas-playwright
38. *Modern E2E Testing with Playwright and AI - YouTube*. http://youtube.com/watch?v=emUaq9FPIcc
39. *Artillery Documentation*. http://artillery.io/docs
40. *Start Monitoring with Playwright Test*. http://checklyhq.com/product/start-monitoring-with-playwright
41. *Wrangler commands - D1*. https://developers.cloudflare.com/d1/wrangler-commands
42. *D1 · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/wrangler/commands/d1
43. *Ephemeral testing environments | Blog*. https://northflank.com/blog/ephemeral-testing-environments
44. *Wrangler · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/wrangler
45. *Get Started with Drizzle and D1 - Drizzle ORM*. http://orm.drizzle.team/docs/get-started/d1-new
46. *Global setup and teardown - Playwright*. http://playwright.dev/docs/test-global-setup-teardown
47. *Using Playwright’s storageState - BrowserStack*. https://www.browserstack.com/guide/playwright-storage-state
48. *Handling Authentication for Multiple User Logins in Playwright*. https://www.neovasolutions.com/2024/11/14/handling-authentication-for-multiple-user-logins-in-playwright
49. *Sessions – AuthKit – WorkOS Docs*. http://workos.com/docs/authkit/sessions
50. *Test SSO - WorkOS*. https://workos.com/changelog/test-sso
51. *JWT issuer/audience mismatch with @workos/authkit-tanstack-react-start v0.4.x and convex auth · Issue #45 · workos/authkit-tanstack-start · GitHub*. http://github.com/workos/authkit-tanstack-start/issues/45
52. *Test OAuth 2.0 with a Mock Server | Beeceptor*. https://beeceptor.com/docs/tutorials/oauth-2-0-mock-usage
53. *JWT best practices: A guide to secure authentication*. http://workos.com/blog/jwt-best-practices
54. *Next.js · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs
55. *Properly handle RSC components and text/x-component mime ...*. https://github.com/opennextjs/opennextjs-cloudflare/issues/517
56. *Cloudflare Environments · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments
57. *"Just use Vite”… with the Workers runtime*. https://blog.cloudflare.com/introducing-the-cloudflare-vite-plugin
58. *Workers, WAF - WAF and framework adapter mitigations for ...*. https://community.cloudflare.com/t/workers-waf-waf-and-framework-adapter-mitigations-for-react-and-next-js-vulnerabilities/925938
59. *Authentication | Playwright*. https://playwright.dev/docs/auth
60. *Best Practices | Playwright*. https://playwright.dev/docs/best-practices
61. *Testing JavaScript | Testing JavaScript*. https://testingjavascript.com/
62. *The Testing Trophy and Testing Classifications*. https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications
63. *Web server | Playwright*. https://playwright.dev/docs/test-webserver
64. *Projects | Playwright*. https://playwright.dev/docs/test-projects
65. *description: One engineer used AI to rebuild Next.js on Vite in a week. vinext builds up to 4x faster, produces 57% smaller bundles, and deploys to Cloudflare Workers with a single command. title: How we rebuilt Next.js with AI in one week image: https://blog.cloudflare.com/_emdash/api/media/file/01KW48J6EQB93CWFATMKFPPG1K.png*. https://blog.cloudflare.com/vinext
66. *WorkOS Security Rating, Vendor Risk Report ...*. https://www.upguard.com/security-report/workos
67. *WorkOS — Your app, Enterprise Ready.*. https://workos.com/
68. *Free custom branding of Admin Portal in Sandbox*. https://workos.com/changelog/free-custom-branding-of-admin-portal-in-sandbox-environments
69. *The developer's guide to authentication security*. https://workos.com/blog/the-developers-guide-to-authentication-security
70. *workos/authkit-react - GitHub*. https://github.com/workos/authkit-react
71. *GitHub Actions: Part 3 - Shard your playwright tests for blazing ...*. https://abigailarmijo.substack.com/p/github-actions-part-3-shard-your
72. *Sharded Playwright Runs*. https://www.chromatic.com/docs/playwright/sharding
73. *Playwright Blob Reporter: Merge Sharded Reports 2026*. http://qaskills.sh/blog/playwright-blob-reporter-guide
74. *Playwright PR Smoke Runner - GitHub Marketplace*. https://github.com/marketplace/actions/playwright-pr-smoke-runner
75. *Synthetic Monitoring for Apps & APIs | Checkly*. https://www.checklyhq.com/product/synthetic-monitoring
76. *How do I set up scheduled tests with Playwright using ...*. https://ray.run/questions/how-do-i-set-up-scheduled-tests-with-playwright-using-external-tools
77. *GitHub - AsiaOstrich/playwright-scheduled-filler: Generic web form scheduling automation framework built on Playwright · GitHub*. http://github.com/AsiaOstrich/playwright-scheduled-filler
78. *Scheduled web scraping made easy: using Playwright with GitHub Actions - Dev stuff by Marc Veens*. http://marcveens.nl/posts/scheduled-web-scraping-made-easy-using-playwright-with-github-actions
79. *Playwright Assertions - Types & Best Practices*. https://checklyhq.com/docs/learn/playwright/assertions
80. *Assertions | Playwright*. https://playwright.dev/docs/test-assertions
81. *Playwright Assertions: A Guide to expect() and Test ...*. https://testdino.com/blog/playwright-assertions
82. *User Agent Client Hints API (navigator.userAgentData) ...*. http://gist.github.com/fuweichin/18522d21d3cd947026c2819bda25e0a6
83. *Playwright: Advanced CSS Assertion Techniques - Runebook.dev*. https://runebook.dev/en/docs/playwright/api/class-locatorassertions/locator-assertions-to-have-css
84. *description: Use environments to create different configurations for the same Worker application. title: Environments image: https://developers.cloudflare.com/og-docs.png*. https://developers.cloudflare.com/workers/wrangler/environments/
85. *description: Use Wrangler CLI commands to create, manage, and query D1 databases. title: Wrangler commands image: https://developers.cloudflare.com/og-docs.png*. https://developers.cloudflare.com/d1/wrangler-commands/
86. *Test SSO*. https://workos.com/docs/sso/test-sso
87. *Sharding | Playwright*. https://playwright.dev/docs/test-sharding
88. [
Google Testing Blog
](https://testing.googleblog.com/)
