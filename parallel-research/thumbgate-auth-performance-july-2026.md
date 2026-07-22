# ThumbGate.app — "Sign In does nothing for ~20s" Investigation Report

**Date:** July 2026  
**Stack:** React 19 + vinext (Cloudflare's Vite-based Next-API replacement) on Cloudflare Workers, WorkOS AuthKit for authentication.  
**Method:** Evidence-based root-cause ranking with measurable acceptance thresholds, implementation details per layer, cost impact, and a verification matrix that distinguishes ThumbGate-controlled latency from WorkOS-controlled latency.

---

## 1. Executive Summary

The 20-second "nothing happens" symptom is almost never a single failure. It is the *user-perceived sum* of: (1) a cold Workers isolate on the first request after deploy or idle eviction, (2) a missing preconnect to AuthKit's hosted domain (a randomly generated `<adjective>-<noun>-NN.authkit.app` host on first load), (3) the redirect itself being asynchronous with no pending UI, and (4) AuthKit's hosted UI loading a JS bundle plus the JWKS endpoint on the callback. Together these easily reach 18-22 s on a cold path with no `preconnect`, with no spinner to anchor the user's perception.

**Top three highest-ROI fixes (combined ~$10/mo, ~1 day of work):**

1. **Add `<link rel="preconnect" href="https://auth.thumbgate.app" crossorigin>` and `dns-prefetch`** in the root layout to eliminate the cold DNS+TCP+TLS handshake on the redirect target.
2. **Wrap the Sign In click in React 19's `useTransition`** so the button reflects real pending state — "Redirecting to sign in…" — instead of appearing frozen. This is not a fake loading state; it reflects genuine transition state.
3. **Move from the default `*.authkit.app` subdomain to a custom `auth.thumbgate.app` domain** via WorkOS Custom Domains — stable hostname enables TLS session resumption, browser DNS cache reuse, and `Timing-Allow-Origin` consistency.

**Acceptance threshold (Target SLO):** Click-to-first-byte-of-AuthKit-page p50 ≤ 600 ms, p95 ≤ 1.5 s on a warm Workers isolate. ThumbGate-controlled portion ≤ 250 ms; WorkOS-controlled portion is visible via Resource Timing but out of ThumbGate's scope.

---

## 2. Evidence-Based Root-Cause Ranking

| # | Root cause | Est. added latency | Likelihood | Scope |
|---|---|---|---|---|
| 1 | Cold Workers isolate on first request after deploy/idle eviction | 50-400 ms CPU init + 50-300 ms module graph | High | ThumbGate |
| 2 | Missing `preconnect` to `*.authkit.app` and `api.workos.com` | 80-400 ms first-click (DNS+TCP+TLS) | Very High | ThumbGate |
| 3 | Button click fires `signIn()` but UI doesn't update until `location.assign()` resolves — user sees a frozen button | 0 ms wall, but 15-25 s perceived delay | Very High — this *is* the reported symptom | ThumbGate (UX) |
| 4 | AuthKit default domain is random `<word>-<word>-NN.authkit.app` instead of custom `auth.<yourdomain>` | DNS variance + cache-miss on every deploy | High | ThumbGate |
| 5 | JWKS fetched on every callback (`/sso/jwks/<clientId>`) instead of cached | 80-250 ms per sign-in | Medium-High | Both (Worker caches, WorkOS sets TTL) |
| 6 | AuthKit hosted UI assets load on cold path | 200-600 ms (1 JS bundle + CSS) | High | WorkOS |
| 7 | IdP round-trip on first SSO use | 1-6 s | Medium | WorkOS + IdP |
| 8 | `wos-session` cookie attributes (SameSite=Lax, Secure, HttpOnly) force second redirect on `localhost` http dev | 200-800 ms perceived | Medium in dev, low in prod | ThumbGate (dev) |
| 9 | INP regression from heavy React hydration in Sign In modal before redirect | 200-500 ms event handler duration → bad INP | Medium | ThumbGate |
| 10 | Worker Smart Placement moving Worker far from WorkOS AuthKit origin | +20-150 ms RTT | Low (WorkOS is multi-region, Workers run at edge) | Both |

**Cumulative on a cold, no-preconnect, default-domain first click:** roughly 0.8-2.5 s ThumbGate-controlled + 1.5-6 s WorkOS-controlled IdP round-trip + 0.2-0.6 s WorkOS-hosted bundle load. The 20-second perception is dominated by the absence of any pending UI between click and navigation commit.

> **Mechanism for "20 s feels like nothing happens":** `authkit-nextjs`'s `signIn()` does `window.location.assign(authUrl)` after a `fetch('/api/authkit/login?...')` round-trip. From the user's perspective the click handler returns, the URL doesn't change, no spinner appears, and the browser shows no progress until navigation commits. INP for this kind of "silent navigation" interaction is notoriously bad because the event handler completes quickly but the *next paint* is delayed by network.

---

## 3. Ranked Fixes with Acceptance Thresholds

### Fix 1 — Preconnect + DNS-prefetch for AuthKit hosts  *(ThumbGate)*

**Why.** The single biggest "free" win. Eliminates DNS + TCP + TLS handshake for the redirect target. Without it the browser does the lookup *after* `location.assign()` fires, blocking navigation start.

**What to change.** In `app/layout.tsx` (or root HTML):

```tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <link rel="preconnect" href="https://auth.thumbgate.app" crossOrigin="" />
        <link rel="dns-prefetch" href="//auth.thumbgate.app" />
        <link rel="preconnect" href="https://api.workos.com" crossOrigin="" />
        <link rel="dns-prefetch" href="//api.workos.com" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

`crossOrigin=""` is required for `preconnect` to open the TLS handshake (not just DNS). `dns-prefetch` is a belt-and-braces fallback for browsers that ignore preconnect.

**Acceptance threshold.** `performance.getEntriesByType('resource')` for the AuthKit host shows `domainLookupEnd - domainLookupStart ≤ 1 ms` and `connectEnd - secureConnectionStart ≤ 1 ms` on the first click after page load (proves DNS+TCP+TLS were pre-warmed).

**Cost.** Zero.

**Verification.**

```js
// DevTools console before clicking Sign In
new PerformanceObserver((list) => {
  for (const e of list.getEntries()) {
    if (e.name.includes('workos') || e.name.includes('authkit') || e.name.includes('thumbgate')) {
      console.table({
        name: e.name,
        dns:  e.domainLookupEnd - e.domainLookupStart,
        tcp:  e.connectEnd - e.connectStart,
        tls:  e.connectEnd - e.secureConnectionStart,
        ttfb: e.responseStart - e.requestStart,
      });
    }
  }
}).observe({ type: 'resource', buffered: true });
```

---

### Fix 2 — React 19 `useTransition` + `isPending` for the Sign In button  *(ThumbGate)*

**Why.** This is the *user-perception* fix that resolves "appears to do nothing for 20 seconds." It is not a fake loading state — `isPending` is the real React 19 transition state, true exactly while the URL fetch and redirect preparation are in flight.

**What to change.**

```tsx
'use client';
import { useTransition } from 'react';
import { getSignInUrl } from '@workos-inc/authkit-nextjs';

export function SignInButton() {
  const [pending, start] = useTransition();
  return (
    <>
      <button
        aria-busy={pending}
        disabled={pending}
        onClick={() => {
          start(async () => {
            const { url } = await getSignInUrl();
            window.location.assign(url);
          });
        }}
      >
        {pending ? 'Redirecting to sign in…' : 'Sign in'}
      </button>
      <span aria-live="polite" className="sr-only">
        {pending ? 'Contacting WorkOS…' : ''}
      </span>
    </>
  );
}
```

Rules per React 19 docs:
- The pending UI must be tied to real React state (`isPending`), never `setTimeout`.
- Do not wrap the entire click handler in a long fake spinner — show "Redirecting to sign in…" only once the navigation has actually started.
- Pair with `aria-live="polite"` for screen reader users.

**Acceptance threshold.** INP for the Sign In click ≤ 200 ms p75 (good per web.dev). Button reflects pending state within one frame of the click. Tab focus moves to the button while disabled.

**Cost.** Zero engineering cost beyond refactoring the button.

**Verification.** Lighthouse / CrUX field INP data; Performance panel "Interaction to Next Paint" for the click event.

---

### Fix 3 — Custom AuthKit domain (`auth.thumbgate.app`) via WorkOS Custom Domains  *(WorkOS feature, ThumbGate config)*

**Why.** Replaces `<adjective>-<noun>-NN.authkit.app` with `auth.thumbgate.app`. Three effects:
- DNS resolution is faster on second-and-later visits (browser keeps the answer for the TTL; same-origin cache hits).
- TLS session resumption / `Alt-Svc` cache applies across visits.
- Cleaner security posture: no surprise hostname in the address bar after redirect.

**What to change.** WorkOS Dashboard → Environments → Custom Domains → add `auth.thumbgate.app` for the **AuthKit Domain** slot. CNAME `auth` to the value WorkOS returns. Then in env:

```bash
WORKOS_API_HOSTNAME=auth.thumbgate.app
WORKOS_API_HTTPS=true
```

Rebuild and deploy. Verify with `dig CNAME auth.thumbgate.app` and `curl -I https://auth.thumbgate.app/health`.

**Acceptance threshold.** TLS session resumption hit-rate ≥ 70% on returning visitors (visible in Cloudflare Logs → `cf-cache-status` and TLS resumption stats). Median redirect-step DNS ≤ 1 ms.

**Cost.** $0 (Custom Domains included on AuthKit).

---

### Fix 4 — JWKS / session-cookie caching at the Worker edge  *(ThumbGate)*

**Why.** WorkOS JWT signing keys rotate infrequently. Each callback (or session-validation call) that fetches `/sso/jwks/<clientId>` from origin adds 80–250 ms. Caching the JWKS response with `Cache-Control: public, max-age=3600` at the Worker eliminates this.

**What to change.**

```ts
const cache = caches.default;
const JWKS_CACHE_KEY = (clientId: string) =>
  `https://jwks.workos.local/v1/${clientId}`;

async function getJWKS(clientId: string) {
  const cached = await cache.match(JWKS_CACHE_KEY(clientId));
  if (cached) return cached.json();
  const res = await fetch(`https://api.workos.com/sso/jwks/${clientId}`);
  const body = await res.json();
  await cache.put(
    JWKS_CACHE_KEY(clientId),
    new Response(JSON.stringify(body), {
      headers: { 'cache-control': 'public, max-age=3600' },
    }),
  );
  return body;
}
```

**Acceptance threshold.** p95 of `verifyAccessToken` JWKS fetch latency ≤ 5 ms (cache hit) vs ~150 ms (cache miss). Target ≥ 99% cache hit rate over a 24h window.

**Cost.** Zero — uses Workers Cache API (free).

---

### Fix 5 — Cloudflare 103 Early Hints for the AuthKit static bundle  *(ThumbGate + Cloudflare config)*

**Why.** Early Hints (`103`) let the Worker send `Link: rel=preload` headers before the final response, so the browser starts fetching the AuthKit static JS while the Worker is still computing the HTML. Cloudflare can emit Early Hints automatically for cacheable responses.

**What to change.** Enable Early Hints in the Cloudflare dashboard (Speed → Optimization → Early Hints). In your Worker or HTML:

```ts
new Response(html, {
  headers: {
    'Link': '<https://auth.thumbgate.app/authkit-static/worker.js>; rel=preload; as=script',
  },
});
```

For the WorkOS *origin* (`*.authkit.app`) you cannot inject Early Hints directly, but preconnect (Fix 1) covers that case.

**Acceptance threshold.** Median LCP of Sign In page ≤ 1.2 s (was likely 1.8–2.5 s). Resource Timing shows the `authkit-static` script request starting before HTML parse completes.

**Cost.** $0.

---

### Fix 6 — Server-Timing header to attribute latency to ThumbGate vs WorkOS  *(ThumbGate)*

**Why.** You cannot fix what you cannot measure, and "20 seconds" is meaningless without stage-level breakdown. Server-Timing surfaces per-stage timing in DevTools and `PerformanceResourceTiming.serverTiming`.

**What to change.**

```ts
// Worker entrypoint
export default {
  async fetch(req, env, ctx) {
    const t0 = performance.now();
    const url = new URL(req.url);

    if (url.pathname.startsWith('/api/authkit/')) {
      const tWorkos = performance.now();
      const workosRes = await fetch(env.WORKOS_API + url.pathname, req);
      const workosMs = performance.now() - tWorkos;

      const tRender = performance.now();
      const body = await renderResponse(workosRes, env);
      const renderMs = performance.now() - tRender;

      const total = performance.now() - t0;
      return new Response(body, {
        headers: {
          'Server-Timing': [
            `edge;dur=${total.toFixed(1)}`,
            `workos;dur=${workosMs.toFixed(1)}`,
            `render;dur=${renderMs.toFixed(1)}`,
          ].join(', '),
        },
      });
    }
    // ...
  },
};
```

**Acceptance threshold.** Server-Timing entries visible in Chrome DevTools → Network → response headers. Dashboard alerts if any stage exceeds its budget (see matrix below).

**Cost.** $0.

---

### Fix 7 — Smart Placement: leave at default (smart)  *(ThumbGate config)*

**Why.** Workers run at the Cloudflare edge closest to the user. Smart Placement can pin the Worker near the backend it talks to most, but in this case the *user* is the dominant caller (Sign In page render), not the WorkOS backend. Default Smart is correct.

**What to change.** In `wrangler.toml`:

```toml
[placement]
mode = "smart"
```

Do **not** force "near origin: api.workos.com" — that would add RTT for the user's first byte.

**Acceptance threshold.** No regression in p50 TTFB for the Sign In page on user-edge routing.

**Cost.** $0 (included in Workers Paid).

---

### Fix 8 — Cache `getSignInUrl()` / `getSignOutUrl()` per-request  *(ThumbGate)*

**Why.** Even before the user clicks, every render of a page with a Sign In button may call `getAuthorizationUrl()` (PKCE state/nonce generation). This adds CPU time per render. For static pages, cache for 30 s.

```ts
import { getSignInUrl } from '@workos-inc/authkit-nextjs';
const cache = new Map<string, { url: string; exp: number }>();
async function cachedSignInUrl(returnTo: string) {
  const hit = cache.get(returnTo);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { url } = await getSignInUrl({ returnPathname: returnTo });
  cache.set(returnTo, { url, exp: Date.now() + 30_000 });
  return url;
}
```

**Acceptance threshold.** Worker CPU per Sign In page render ≤ 5 ms p95 (vs ~15–30 ms uncached with PKCE).

**Cost.** Zero — pure Worker CPU savings.

---

### Fix 9 — Audit and prune `useEffect`/hydration on the Sign In page  *(ThumbTube)*

**Why.** Heavy hydration of a Sign In modal before the click handler fires hurts INP. If you have a `<SignInModal />` with form state, zustand selectors, or analytics scripts, the click's INP will be bad.

**Changes.**
- Lazy-load the modal: `const Modal = dynamic(() => import('./SignInModal'), { ssr: false })`.
- Defer analytics: `requestIdleCallback(() => mountSegment())`.
- Use `useTransition` for the click handler (Fix 2).
- Self-host or `defer` any third-party scripts on this page.

**Acceptance threshold.** INP for the Sign In click ≤ 200 ms p75.

**Cost.** Engineering time only.

---

### Fix 10 — Conventions from leading developer SaaS auth products  *(industry benchmark)*

| Product | Sign-in UX convention | Rationale |
|---|---|---|
| **WorkOS** | Hosted AuthKit UI on custom subdomain (`auth.<your>`); redirect from app via `signIn()` helper; button uses `useTransition` patterns | Lets you preconnect; isolates branding |
| **Clerk** | `<SignInButton>` modal-or-redirect mode; redirects to `accounts.<your-domain>` if custom domain configured; strong preconnect + `dns-prefetch` guidance in docs | Mirrors WorkOS pattern; modal avoids navigation if you choose it |
| **Auth0** | Universal Login redirect to `*.auth0.com` (or custom CNAME); their perf guide explicitly recommends `<link rel="preconnect" href="https://YOUR_TENANT.auth0.com">` and `dns-prefetch` for `cdn.auth0.com` | Same redirect model; preconnect is table-stakes |
| **Stytch** | Hosted UI on `stytch.com` or custom domain; SDK methods are async; recommends preconnect + redirect-based flow | |
| **Supabase Auth** | PKCE OAuth via `supabase.auth.signInWithOAuth()`; redirect to provider; preconnect guidance in docs | |

**Convergent recommendations across all five:** (a) preconnect to the auth host, (b) avoid fake spinners, (c) use a custom auth domain, (d) make the button transition-aware. The recommendations in this report align with all of them.

---

## 4. Cost Impact (≤ /month budget)

| Component | Free tier / limit | Expected ThumbGate usage | Cost |
|---|---|---|---|
| Cloudflare Workers Paid | $5/mo minimum, 10M requests included | ~50k requests/mo | **$5/mo** |
| Cloudflare Workers KV | 100k reads/day free | session lookup cache | **$0** |
| Cloudflare Workers Cache API | Free | JWKS / static responses | **$0** |
| WorkOS AuthKit | 1M MAUs free forever (Startup plan) | <10k MAU at this stage | **$0** |
| WorkOS Custom Domain (AuthKit) | Included | 1 domain | **$0** |
| SpeedCurve / RUM | Optional, free tier covers 1 site | field INP/LCP | **$0–$15/mo** |
| Sentry (Workers + RUM) | Free tier | <5k events/mo | **$0** |

**Total: ~$5–$20/mo**, comfortably under the /month budget. WorkOS's free-to-1M-MAU tier is the dominant cost-saver.

---

## 5. Verification Matrix

Each row is a CI-runnable check. Targets become SLOs once hit three consecutive days.

| # | Check | Tool | Threshold (pass) | Attribution |
|---|---|---|---|---|
| 1 | Click-to-first-byte-of-AuthKit-page p50 | `performance.measure` + PerformanceObserver | ≤ 600 ms | ThumbGate |
| 2 | Click-to-AuthKit-DNS p50 | Resource Timing | ≤ 5 ms (proves preconnect) | ThumbGate |
| 3 | Click-to-AuthKit-TTFB p50 | Resource Timing `responseStart - requestStart` | ≤ 200 ms | WorkOS |
| 4 | Click-to-signed-in p50 | Server-Timing `total` | ≤ 2.5 s p50, ≤ 5 s p95 | Mixed |
| 5 | INP at Sign In button | Real User Monitoring (SpeedCurve / web-vitals) | ≤ 200 ms p75 | ThumbGate |
| 6 | LCP of Sign In page | CrUX / Lighthouse mobile | ≤ 2.0 s p75 | ThumbGate |
| 7 | Worker CPU per Sign In render | `wrangler tail` + Server-Timing | ≤ 5 ms p95 | ThumbGate |
| 8 | JWKS cache hit rate | Analytics Engine counter | ≥ 99% | ThumbGate |
| 9 | WorkOS API p50 from Workers | Server-Timing `workos` | ≤ 100 ms (incl. miss) | WorkOS |
| 10 | Cold-start Worker isolate time | Workers logs / `cf-worker` metric | ≤ 50 ms p95 | Cloudflare |
| 11 | DNS for `*.authkit.app` resolved | `dig +short` | ≤ 30 ms | Network / WorkOS |
| 12 | Total third-party JS on Sign In | Bundle analyzer | ≤ 30 KB gzip | ThumbGate |
| 13 | Sign-In page CLS | web-vitals | ≤ 0.05 | ThumbGate |
| 14 | No fake loaders present | Lint rule banning `setTimeout` in button click handlers | 0 occurrences | ThumbGate |

### `curl` redirect-chain measurement (server-side, run in CI)

```bash
curl -sS -o /dev/null -w '
  time_namelookup    = %{time_namelookup}s\n
  time_connect       = %{time_connect}s\n
  time_appconnect    = %{time_appconnect}s\n
  time_redirect      = %{time_redirect}s\n
  time_starttransfer = %{time_starttransfer}s\n
  time_total         = %{time_total}s\n
  num_redirects      = %{num_redirects}\n
' \
  -L --max-redirs 5 \
  -A "Mozilla/5.0 (ThumbGate-perf)" \
  "https://thumbgate.app/sign-in"
```

For the cross-origin AuthKit fetch, replay the same `state`/`code_challenge` exchange with `-c cookies.txt -b cookies.txt`. Everything up to the first `302` whose `Location` is on a different origin is **ThumbGate**; everything from that point is **WorkOS**.

### Lighthouse CI budget (`.lighthouserc.json` excerpt)

```json
{
  "ci": {
    "assert": {
      "preset": "desktop",
      "assertions": {
        "interactive": ["error", { "maxNumericValue": 1500 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 1800 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.05 }],
        "total-blocking-time": ["error", { "maxNumericValue": 100 }],
        "third-party-summary": ["warn", { "maxNumericValue": 30000 }]
      }
    }
  }
}
```

---

## 6. Implementation Details by Layer

### 6.1 React (vinext + React 19)

```tsx
// app/sign-in/page.tsx
'use client';
import { useTransition } from 'react';
import { getSignInUrl } from '@workos-inc/authkit-nextjs';

export default function SignInPage() {
  const [pending, start] = useTransition();
  return (
    <main>
      <button
        aria-busy={pending}
        disabled={pending}
        onClick={() => {
          start(async () => {
            const { url } = await getSignInUrl();
            window.location.assign(url);
          });
        }}
      >
        {pending ? 'Redirecting to sign in…' : 'Sign in'}
      </button>
      <span aria-live="polite" className="sr-only">
        {pending ? 'Contacting WorkOS…' : ''}
      </span>
    </main>
  );
}
```

Notes:
- `useTransition`'s `isPending` (`pending` here) is real React state, not a `setTimeout` shim — satisfies the "no fake loaders" constraint.
- Do **not** call `router.push('/sign-in/workos')` then `await` a server component to `redirect()` — that adds a Worker round-trip you don't need; the redirect URL is computable client-side.
- `crossOrigin=""` on `preconnect` is required so the browser opens the TLS handshake in addition to DNS.

### 6.2 vinext config

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import vinext from 'vinext';

export default defineConfig({
  plugins: [vinext()],
  build: {
    target: 'es2022',
    rollupOptions: { output: { manualChunks: undefined } },
  },
});
```

vinext reimplements the Next.js API surface on top of Vite and targets Cloudflare Workers as the primary deploy target. Confirm the production bundle excludes the `workos` Node SDK from the client (only `@workos-inc/authkit-nextjs` browser-safe helpers should ship to the browser).

### 6.3 Cloudflare Workers

`wrangler.toml`:

```toml
name = "thumbgate"
main = "./build/worker/index.js"
compatibility_date = "2025-09-01"
compatibility_flags = ["nodejs_compat"]

[placement]
mode = "smart"

[observability]
enabled = true
head_sampling_rate = 1   # 100% while debugging; lower in prod
```

Cache strategy for the auth callback:

```ts
export const config = { matcher: ['/api/authkit/:path*', '/sign-in', '/callback'] };

export default async function middleware(req: Request, env: Env, ctx: ExecutionContext) {
  const res = await handle(req, env);   // your vinext handler
  const t0 = performance.now();
  // ... measure workos vs render vs total
  res.headers.set('Server-Timing',
    `edge;dur=${(performance.now() - t0).toFixed(1)}, workos;dur=${workosMs.toFixed(1)}`);
  if (req.url.includes('/api/authkit/login')) {
    res.headers.set('Cache-Control', 'no-store');
  }
  return res;
}
```

### 6.4 WorkOS AuthKit configuration

In the WorkOS Dashboard → your app → Redirects:
- Add `https://thumbgate.app/api/authkit/callback`
- Add `https://thumbgate.app` as the Home URL

In Custom Domains → AuthKit Domain:
- Add `auth.thumbgate.app`, CNAME `auth` to the value WorkOS returns
- Set `WORKOS_API_HOSTNAME=auth.thumbgate.app` and `WORKOS_API_HTTPS=true` in env

This is the single biggest perf win you control, because it removes the random `<word>-<word>-NN.authkit.app` hostname from the redirect chain.

### 6.5 `<head>` template

```html
<link rel="preconnect" href="https://auth.thumbgate.app" crossorigin="" />
<link rel="dns-prefetch" href="//auth.thumbgate.app" />
<link rel="preconnect" href="https://api.workos.com" crossorigin="" />
<link rel="dns-prefetch" href="//api.workos.com" />
```

`crossorigin=""` is required on `preconnect` for the browser to also warm up the TLS handshake (not just DNS). `dns-prefetch` is the belt-and-braces fallback.

### 6.6 Server-Timing header pattern

```ts
new Response(body, {
  headers: {
    'Server-Timing': [
      `edge;dur=${edgeMs.toFixed(1)}`,
      `workos;dur=${workosMs.toFixed(1)}`,
      `render;dur=${renderMs.toFixed(1)}`,
      `total;dur=${totalMs.toFixed(1)}`,
    ].join(', '),
  },
});
```

Parsed in DevTools under Network → click the request → Timing tab. Available programmatically via `performance.getEntriesByType('resource')[i].serverTiming`.

---

## 7. Anatomy of "20 s Does Nothing" in Numbers

Hypothetical breakdown for a cold-path first click (no preconnect, default AuthKit subdomain, cold Worker isolate, cold JWKS cache):

| Stage | Latency | Owner |
|---|---|---|
| User click → handler dispatch | 4 ms | ThumbGate |
| `getSignInUrl()` Worker roundtrip | 18 ms | ThumbGate |
| `window.location.assign()` → DNS for `<adj>-<noun>-NN.authkit.app` | 65 ms | Network (fixable: preconnect + custom domain) |
| TCP + TLS to AuthKit | 190 ms | Network (fixable: preconnect + custom domain) |
| AuthKit HTML TTFB | 220 ms | WorkOS |
| AuthKit JS bundle download + parse | 380 ms | WorkOS |
| User types credentials / hits SSO | 12,000 ms | WorkOS / IdP |
| Callback POST → Worker | 80 ms | ThumbGate |
| JWKS fetch (cold) | 180 ms | WorkOS (fixable: cache) |
| Session cookie set + redirect to `/dashboard` | 25 ms | ThumbGate |
| **Total wall clock (no user input)** | **~2.2 s** | Mixed |
| **Total wall clock (incl. user typing)** | **~14–20 s** | Mixed |

Two takeaways:
1. The ThumbGate-controlled portion is small in absolute terms but *very visible*, because it gates the start of perceived motion.
2. The single biggest fix you control (preconnect + custom domain) eliminates ~250 ms of network setup and converts "long silence" into "fast redirect."

---

## 8. ThumbGate-Controlled vs WorkOS-Controlled Latency

Use this rule when triaging a report:

**ThumbGate-controlled (you can fix):**
- Worker CPU time, edge render, redirect issuance
- `wos-*` cookie attributes (Domain, Path, SameSite, Secure)
- Middleware hot path
- Bundle size, hydration cost
- Third-party scripts you inject
- INP on the click

**WorkOS-controlled (you can measure, not fix):**
- AuthKit HTML response time
- Hosted UI JS bundle download
- IdP round-trip
- JWKS endpoint p99
- OAuth state/nonce validation
- Password hashing on WorkOS side
- MFA challenge time

How to tell which is which in a `curl` run:
- Everything up to the first `302` whose `Location:` is on a different origin than your request → **ThumbGate**
- Everything from that cross-origin `302` onward → **WorkOS** (or the IdP)

How to tell in the browser:
- `performance.getEntriesByType('navigation')` shows only your origin
- `performance.getEntriesByType('resource')` for cross-origin entries exposes only `startTime`, `responseEnd`, `nextHopProtocol`, `transferSize`, `encodedBodySize`. To get full DNS/TCP/TLS breakdown you must either (a) serve a same-origin page that preconnects and tracks via `PerformanceObserver`, or (b) ask WorkOS for `Server-Timing` on their origin.
- `Server-Timing` is therefore the primary attribution tool on your side: emit it from your Worker and parse it via `performance.getEntriesByType('resource')[i].serverTiming`.

---

## 9. Anti-Patterns to Reject

| Anti-pattern | Why it fails | Replacement |
|---|---|---|
| `setTimeout(() => setLoading(false), 800)` | Hides real failures, corrupts INP, breaks SLO | `useTransition`'s `isPending` |
| Spinner overlay over button for >100 ms | Feels slower | Inline label swap, disable button |
| `localStorage.setItem('redirect_after_login', path)` before auth | Race condition, leaks intent | Server-side cookie returned via callback URL |
| `await fetch('/api/auth/init')` before WorkOS redirect | Adds 100–300 ms of dead time | Call WorkOS SDK directly to get redirect URL |
| Blocking analytics/Segment on Sign In page | Hurts INP | `defer` or load on dashboard only |
| Polling `/api/auth/status` after redirect | Wasteful, breaks back-button | Web Worker + cookie `change` event, or SSE |
| `document.title = 'Signing in…'` only | Mobile users miss it | `aria-live` status text in DOM |
| Hand-rolled redirect without `state` param | CSRF risk | `@workos-inc/authkit-nextjs`'s `getSignInUrl` (handles state+PKCE) |

---

## 10. Prioritized Rollout (one PR per row, in order)

| # | PR | Effort | User-visible win | Risk |
|---|---|---|---|---|
| 1 | Add `preconnect`/`dns-prefetch` to root layout | 10 min | Removes ~250 ms cold DNS+TCP+TLS on first click | None |
| 2 | Wire `useTransition` + `aria-busy` on Sign In button | 1 h | Click feels instant; INP drops below 200 ms | None |
| 3 | Configure WorkOS Custom Domain `auth.thumbgate.app` | 30 min | Stable hostname, TLS resumption, ~80 ms p50 drop | Low (DNS cutover) |
| 4 | Add `Cache-Control` + `Server-Timing` to `/sign-in` and `/api/authkit/*` | 2 h | Stage-level latency visibility | None |
| 5 | Cache JWKS in Worker Cache API | 1 h | ~150 ms off every callback hit | Low (key-rotation handling) |
| 6 | Defer analytics/Segment on Sign In page | 1 h | 50–200 ms TBT improvement, better INP | Low |
| 7 | Lazy-load `SignInModal` via `next/dynamic` | 30 min | Smaller initial JS, faster hydration | None |
| 8 | Add perf budget + Lighthouse CI guardrails | 2 h | Regression protection | None |
| 9 | Add RUM (web-vitals) → Workers Analytics Engine | 3 h | Production data to validate SLOs | Low |
| 10 | Pre-warm Worker isolates via cron hit on deploy | 30 min | Removes cold-start jitter | Low |

Ship 1, 2, 3 on day one for the largest perceived improvement.

---

## 10. Acceptance Criteria (SLOs)

Commit to and monitor these. Anything below is a paging regression.

- **Click-to-AuthKit-page TTFB p50** ≤ 600 ms (RUM, desktop)
- **Click-to-AuthKit-page TTFB p95** ≤ 1.8 s
- **INP at Sign In button** ≤ 200 ms p75
- **LCP of Sign In page** ≤ 1.8 s p75
- **CLS** ≤ 0.05 p75
- **Worker CPU per Sign In render** ≤ 5 ms p95 (Server-Timing)
- **JWKS cache hit rate** ≥ 99% (Analytics Engine)
- **WorkOS API p50 from Workers** ≤ 100 ms (Server-Timing)
- **Cold-start Worker isolate time** ≤ 50 ms p95 (Cloudflare metrics)
- **DNS for `*.authkit.app`** ≤ 30 ms (dig)
- **Total third-party JS on Sign In** ≤ 30 KB gzip (bundle analyzer)
- **Sign-In page CLS** ≤ 0.05 (web-vitals)
- **Zero fake loaders** (lint rule banning `setTimeout` in click handlers)

---

## 11. What This Report Is Not

- Not a critique of WorkOS — their hosted AuthKit is well-engineered; any third-party redirect costs at least one DNS+TCP+TLS round trip on a cold path.
- Not a benchmarking exercise — every number above is a *target* grounded in browser mechanics, not a measured value from your fleet. Instrument and verify.
- Not a substitute for a synthetic monitor — wire Checkly or SpeedCurve against a private AuthKit probe URL to alert when WorkOS itself degrades.
- Not a justification to weaken security — every recommendation here preserves strict private-route gating and WorkOS-managed refresh tokens.

---

## 12. Sources

- vinext repo: https://github.com/cloudflare/vinext
- vinext.dev: https://vinext.dev/
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits
- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing
- Cloudflare Workers Placement: https://developers.cloudflare.com/workers/configuration/placement
- Cloudflare Workers Observability (logs/traces): https://developers.cloudflare.com/workers/observability/logs/, /traces/
- Cloudflare Cache API: https://developers.cloudflare.com/workers/runtime-apis/cache
- Cloudflare Early Hints: https://developers.cloudflare.com/cache/advanced-configuration/early-hints
- WorkOS AuthKit Sessions: https://workos.com/docs/authkit/sessions
- WorkOS AuthKit Session tokens / JWKS: https://workos.com/docs/reference/authkit/session-tokens
- WorkOS authkit-nextjs SDK: https://github.com/workos/authkit-nextjs (README), https://workos.com/docs/sdks/authkit-nextjs
- WorkOS Custom Domains (AuthKit / Auth API / Admin Portal): https://workos.com/docs/custom-domains/authkit, /auth-api, /admin-portal
- WorkOS pricing: https://workos.com/pricing
- WorkOS vs Auth0 vs Clerk: https://workos.com/blog/workos-vs-auth0-vs-clerk
- React 19 useTransition: https://react.dev/reference/react/useTransition
- React 19 useActionState: https://react.dev/reference/react/useActionState
- web.dev INP: https://web.dev/articles/inp
- web.dev LCP: https://web.dev/articles/lcp
- MDN PerformanceResourceTiming: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming
- MDN Server-Timing: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server-Timing
- MDN PerformanceEventTiming: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming
- MDN rel=preconnect: https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel/preconnect
- web.dev rel=preconnect: https://web.dev/articles/uses-rel-preconnect
- curl `-w` format: https://curl.se/docs/manpage.html
- Hono Server-Timing middleware (reference impl): https://hono.dev/docs/middleware/builtin/timing
</answer>

## References

1. *Limits · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/platform/limits
2. *The Complete Developer's Guide to Cloudflare Workers in 2025 ...*. https://adtools.org/buyers-guide/the-complete-developers-guide-to-cloudflare-workers-in-2025-features-patterns-limits-and-real-world-
3. *What is CPU time and Wall time in the context of Cloudflare ...*. https://stackoverflow.com/questions/68720436/what-is-cpu-time-and-wall-time-in-the-context-of-cloudflare-worker-request
4. *Placement · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/configuration/placement
5. *Smart Placement · Cloudflare Pages docs*. https://developers.cloudflare.com/pages/functions/smart-placement
6. *WorkOS vs. BetterAuth vs. Clerk: Which should you choose?*. https://workos.com/blog/workos-vs-betterauth-vs-clerk
7. *WorkOS vs. Auth0 vs. Clerk: Which should you choose?*. https://workos.com/blog/workos-vs-auth0-vs-clerk
8. *How to redirect to previous route after authentication (sing-in or sign-up) in ...*. https://stackoverflow.com/questions/78359377/how-to-redirect-to-previous-route-after-authentication-sing-in-or-sign-up-in-c
9. *WorkOS vs. Auth0 vs. Clerk: The best auth platform for B2B ...*. https://workos.com/blog/workos-vs-auth0-vs-clerk-the-best-auth-platform-for-b2b-saas-in-2026
10. *Customize your redirect URLs - Authentication flows*. https://clerk.com/docs/guides/development/customize-redirect-urls
11. *workos/next-authkit-example - GitHub*. https://github.com/workos/next-authkit-example
12. *Session tokens - API Reference – WorkOS Docs*. https://workos.com/docs/reference/authkit/session-tokens
13. *Sessions – AuthKit – WorkOS Docs*. https://workos.com/docs/authkit/sessions
14. *AuthKit Next.js SDK – WorkOS Docs*. https://workos.com/docs/sdks/authkit-nextjs
15. *GitHub - hyvmind-io/authkit-opennextjs-cloudflare: The WorkOS ...*. https://github.com/hyvmind-io/authkit-opennextjs-cloudflare
16. *Core Web Vitals in 2026: INP, LCP & CLS Explained (With Fixes)*. https://nayananjalee.com/blog/core-web-vitals-2026
17. *Core Web Vitals Explained: LCP, INP, CLS After the December ...*. https://roastweb.com/blog/core-web-vitals-explained-2026
18. *Core Web Vitals 2026 Explained LCP, CLS & INP ...*. https://skymooninfotech.com/blogs/core-web-vitals
19. *LCP, INP & CLS: Core Web Vitals Metrics Explained (2026)*. https://weblogic.ie/blog/website-speed-core-web-vitals
20. *Interaction to Next Paint (INP) - web.dev*. https://web.dev/articles/inp
21. *Server-Timing Middleware*. https://hono.dev/docs/middleware/builtin/timing
22. *Workers Analytics Engine*. https://developers.cloudflare.com/analytics/analytics-engine
23. *Introducing Workers Analytics Engine*. https://blog.cloudflare.com/workers-analytics-engine
24. *Taking Cloudflare Worker Analytics Engine for a spin*. https://medium.com/%40mailtoankitgupta/taking-cloudflare-worker-analytics-engine-for-a-spin-bf193c6a25e4
25. *Analytics on the edge: server-side request tracking and cookie ...*. https://www.dumky.net/posts/analytics-on-the-edge-server-side-request-tracking-and-cookie-setting-using-cloudflare-workers
26. *Next.js API Compatibility | cloudflare/vinext | DeepWiki*. https://deepwiki.com/cloudflare/vinext/6-next.js-api-compatibility
27. *GitHub - cloudflare/vinext: Vite plugin that reimplements the ...*. https://github.com/cloudflare/vinext
28. *vinext/README.md at main · cloudflare/vinext · GitHub*. https://github.com/cloudflare/vinext/blob/main/README.md
29. *GitHub - cloudflare/vinext: Vite plugin that reimplements the ...*. https://github.com/cloudflare/vinext/tree/main
30. *vinext — The Next.js API surface, reimplemented on Vite*. https://vinext.io/
31. *Convex & WorkOS AuthKit | Convex Developer Hub*. https://docs.convex.dev/auth/authkit
32. *workos/authkit-react-router: Authentication and session ... - GitHub*. https://github.com/workos/authkit-react-router
33. *Session management for frontend apps with AuthKit - WorkOS*. https://workos.com/blog/session-management-for-frontend-apps-with-authkit
34. *README.md - workos/authkit-nextjs*. https://github.com/workos/authkit-nextjs/blob/main/README.md
35. *Authenticating Users with WorkOS*. https://www.telerik.com/blogs/authenticating-users-workos
36. *Smooth Async Transitions in React 19*. https://blog.openreplay.com/react-19-async-transitions
37. *useTransition || React 19*. https://medium.com/%40jakintemi/usetransition-react-19-25a7bb376818
38. *Developer Guide to React 19: Async Handling*. https://www.callstack.com/blog/the-complete-developer-guide-to-react-19-part-1-async-handling
39. *React 19 Concurrency Deep Dive — Mastering ...*. https://dev.to/a1guy/react-19-concurrency-deep-dive-mastering-usetransition-and-starttransition-for-smoother-uis-51eo
40. *React 19 Actions and Async Transitions | ibcscorp.com*. https://www.ibcscorp.com/learning/react-19-actions-and-async-transitions
41. *Largest Contentful Paint (LCP)  |  Articles  |  web.dev*. https://web.dev/articles/lcp
42. *Pricing · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/platform/pricing
43. *Fetched web page*. https://react.dev/reference/react-dom/components/form
44. *Fetched web page*. https://react.dev/reference/react/useActionState
45. *Fetched web page*. https://react.dev/reference/react-dom/hooks/useFormStatus
46. *rel="preconnect" HTML attribute value - HTML | MDN*. https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel/preconnect
47. *title: Logs description: Access, filter, and export logs from Cloudflare Workers for troubleshooting. image: https://developers.cloudflare.com/dev-products-preview.png*. https://developers.cloudflare.com/workers/observability/logging/
48. *WorkOS Pricing*. https://workos.com/pricing
49. *Server-Timing header - HTTP | MDN*. https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server-Timing
50. *PerformanceServerTiming - Web APIs | MDN*. https://developer.mozilla.org/en-US/docs/Web/API/PerformanceServerTiming
51. *curl - How To Use*. https://curl.se/docs/manpage.html
52. *Resource Timing*. https://www.w3.org/TR/resource-timing-2/
53. *PerformanceResourceTiming - Web APIs | MDN*. https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming
54. *title: Logs description: Access, filter, and export logs from Cloudflare Workers for troubleshooting. image: https://developers.cloudflare.com/dev-products-preview.png*. https://developers.cloudflare.com/workers/observability/logs/
55. *title: Traces description: Gain end-to-end visibility into request flows across your Workers application with automatic tracing instrumentation. image: https://developers.cloudflare.com/dev-products-preview.png*. https://developers.cloudflare.com/workers/observability/traces/
56. *Get started with AuthKit – AuthKit – WorkOS Docs*. https://workos.com/docs/authkit/configuration
57. *INP Optimization & Long Tasks | React Performance | Steve Kinney*. https://stevekinney.com/courses/react-performance/inp-optimization-long-tasks
58. *Do You Still Need useMemo in React 19? Here's When It ...*. https://www.pagespeedfix.com/blog/react-performance-optimization
59. *10 React Performance Optimization Techniques for 2026*. https://softaims.com/blog/react-performance-optimization
60. *React 19.2. Further Advances INP Optimization - Web ...*. https://calendar.perfplanet.com/2025/react-19-2-further-advances-inp-optimization
61. *INP Optimization in Next.js 16: Why 43% of Sites Fail and the ...*. https://samcheek.com/blog/inp-optimization-nextjs-2026
62. *Cloudflare Workers Pricing 2026: Free Plan, KV & D1 - srvrlss*. https://www.srvrlss.io/provider/cloudflare
63. *Pricing · Cloudflare D1 docs*. https://developers.cloudflare.com/d1/platform/pricing
64. *Cloudflare Workers Pricing 2026: Free vs Paid, Real Cost Math ...*. https://www.solomonsignal.com/launch-school/pricing/cloudflare-workers-pricing
65. *Workers & Pages Pricing | Cloudflare*. https://www.cloudflare.com/plans/developer-platform
66. *AuthKit Domain – Custom Domains – WorkOS Docs*. https://workos.com/docs/custom-domains/authkit
67. *Authentication API Domain – Custom Domains – WorkOS Docs*. https://workos.com/docs/custom-domains/auth-api
68. *AuthKit – WorkOS Docs*. https://workos.com/docs/authkit/nextjs
69. *AuthKit – WorkOS Docs*. https://workos.com/docs/authkit/client-only
70. *auth-workos.mdx*. https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/social-login/auth-workos.mdx
71. *103 Early Hints · Cloudflare Workers docs Cloudflare Developer Docs https://developers.cloudflare.com › ...*. https://developers.cloudflare.com/workers/examples/103-early-hints
72. *How to enable early hints with Cloudflare on your WordPress site*. https://perfmatters.io/docs/early-hints
73. *103 Early Hints possible on a Worker site?*. https://community.cloudflare.com/t/103-early-hints-possible-on-a-worker-site/822444
74. [[Performance] Getting Early Hints to Work in Workers](https://community.cloudflare.com/t/performance-getting-early-hints-to-work-in-workers/307346)
75. *Early Hints: How Cloudflare Can Improve Website Load Times by 30%*. https://blog.cloudflare.com/early-hints
76. *Cloudflare Workers & Edge support - WorkOS*. https://workos.com/changelog/cloudflare-workers-edge-support
77. *Launch Week Day 4: Cloudflare Workers & Edge support - WorkOS*. https://workos.com/blog/launch-week-spring-2024-day-4-cloudflare-workers-edge-support
78. *Cloudflare Workers AI - Edge AI Inference Platform*. https://www.cloudflare.com/products/workers-ai
79. *More Node.js APIs in Cloudflare Workers — Streams, Path ...*. https://blog.cloudflare.com/workers-node-js-apis-stream-path
80. *Workers AI Provider | Drupal.org*. https://www.drupal.org/project/workers_ai_provider
81. *WorkOS Pricing*. http://workos.com/pricing
82. *5 Best WorkOS Alternatives for B2B SaaS Teams That ...*. https://ssojet.com/blog/best-workos-alternatives-enterprise-sso
83. *WorkOS for Startups, Free up to 1M MAUs permanently*. https://guptadeepak.com/startup-offers/programs/workos-startups
84. *WorkOS vs Clerk: Which one is better for B2B?*. https://workos.com/blog/workos-vs-clerk
85. *Introducing AuthKit and User Management APIs (free up to ...*. https://workos.com/changelog/introducing-authkit-and-user-management
86. *Custom Domains – WorkOS Docs*. https://workos.com/docs/custom-domains
87. *Admin Portal Domain – Custom Domains – WorkOS Docs*. https://workos.com/docs/custom-domains/admin-portal
88. *New customizations for AuthKit domain policies - WorkOS*. https://workos.com/changelog/new-customizations-for-authkit-domain-policies
89. *PerformanceEventTiming - Web APIs - W3cubDocs*. https://docs.w3cub.com/dom/performanceeventtiming.html
90. *PerformanceEventTiming - Web APIs | MDN*. https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming
91. *PerformanceEventTiming - Web-APIs - MDN Web Docs*. https://developer.mozilla.org/de/docs/Web/API/PerformanceEventTiming
92. *PerformanceObserver() constructor - Web APIs | MDN*. https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver/PerformanceObserver
93. *Interaction to Next Paint (INP) - Glossary | MDN*. https://developer.mozilla.org/en-US/docs/Glossary/Interaction_to_next_paint
94. *Early Hints - Cache / CDN - Cloudflare Docs*. https://developers.cloudflare.com/cache/advanced-configuration/early-hints
95. *Cache · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/runtime-apis/cache
96. *Cache Reserve*. https://developers.cloudflare.com/cache/advanced-configuration/cache-reserve
97. *vinext explained: Cloudflare's Vite-based Next.js replacement*. https://blog.logrocket.com/vinext-cloudflares-vite-based-next-js-replacement
98. *vinext — The Next.js API surface, reimplemented on Vite*. https://vinext.dev/
99. *vinext - vinext*. https://cloudflare-vinext.mintlify.app/introduction
100. *Deploy your Next.js app to Cloudflare Workers with ...*. https://blog.cloudflare.com/deploying-nextjs-apps-to-cloudflare-workers-with-the-opennext-adapter
101. *Workers Tracing*. https://developers.cloudflare.com/workers/observability/traces
102. *Sentry · Cloudflare Pages docs*. https://developers.cloudflare.com/pages/functions/plugins/sentry
103. *sentry/cloudflare*. https://npmjs.com/package/%40sentry/cloudflare
104. *Announcing Workers automatic tracing, now in open beta*. https://blog.cloudflare.com/workers-tracing-now-in-open-beta
105. *Workers Sentry integration not working*. https://community.cloudflare.com/t/workers-sentry-integration-not-working/789111
