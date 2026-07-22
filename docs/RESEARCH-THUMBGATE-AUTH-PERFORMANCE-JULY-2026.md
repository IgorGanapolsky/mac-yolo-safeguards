# ThumbGate authentication performance — July 2026

Research run: `trun_256675ca321f45ec8c177f452cd7d02b`

## Verdict

The production delay was not explained by page weight or a 20-second ThumbGate server response. The reproducible ThumbGate defect was the sign-in CTA using Next/vinext client navigation for an API endpoint that immediately redirects off-site. Chrome logged `[vinext] RSC navigation error: TypeError: Failed to fetch`; the browser then had to recover and perform a document navigation. That failure creates the reported "nothing happened" experience and is under our control.

The highest-ROI July 2026 fix is therefore:

1. Use a native `<a href="/api/auth/login">` for signed-out authentication and reserve `<Link>` for same-app dashboard navigation.
2. Preconnect and DNS-prefetch the existing production AuthKit and WorkOS API hosts while the user reads the landing page.
3. Keep one primary sign-in CTA and enforce the navigation contract in runtime and Worker E2E tests.

This costs $0/month and does not weaken the private-route boundary.

## Live baseline

Measured against production before the change:

| Path | Observation |
| --- | --- |
| `GET /` | Four warm samples completed in 157–189 ms; one sample took 595 ms. |
| `GET /api/auth/login` | Four warm samples completed in 172–182 ms; one sample took 1.491 s. |
| Full redirect chain to hosted AuthKit | Five samples completed in 1.85–5.08 s over three redirects; cross-origin TLS dominated the slow samples. |
| Browser click | Reached the production AuthKit page, but logged a vinext RSC fetch failure before fallback navigation. |

The 20-second report remains valid user evidence, but these measurements show the application server was not consistently spending 20 seconds. The deterministic client-navigation error plus cold cross-origin setup best explains the gap between warm `curl` results and the stalled-click experience.

## Research synthesis

The Parallel report ranked preconnect, immediate interaction feedback, a custom AuthKit domain, edge timing, and callback key caching. We accepted only recommendations supported by this code and the live trace.

### Implemented

- Native browser navigation for API-to-hosted-auth redirects. This removes vinext RSC handling from a navigation that cannot remain inside the React tree.
- `preconnect` plus `dns-prefetch` for the existing production AuthKit hostname and `api.workos.com`.
- Regression tests proving the auth target is an `<a>`, the dashboard target remains a `<Link>`, connection hints remain present, and anonymous HTML has exactly one primary `sign_in_click` action.

### Rejected or deferred

- **Custom WorkOS auth domain:** rejected because the account shows it as a paid add-on that would violate the strict $10/month ceiling. The research report's claim that it is free is not accepted.
- **React `useTransition` wrapper:** unnecessary for the chosen native navigation. A button that first fetches a URL in JavaScript reintroduces a failure point; the native anchor begins navigation immediately and remains keyboard/middle-click friendly.
- **JWKS edge caching:** deferred because ThumbGate's current session implementation must be profiled before adding cache/key-rotation complexity.
- **Synthetic keep-warm polling:** rejected. It creates permanent request spend and masks rather than removes cold-path defects.
- **Paid RUM or custom performance SaaS:** rejected. Cloudflare observability and browser timings are sufficient at the present traffic level.

## Performance contract

The release gate separates ThumbGate-controlled latency from hosted-provider latency:

- The sign-in CTA must be a native document-navigation anchor, never a vinext/Next client link.
- The landing HTML must contain preconnect hints for the production AuthKit host and WorkOS API.
- Anonymous landing HTML must expose exactly one primary `sign_in_click` event.
- ThumbGate `/api/auth/login` warm TTFB target: p50 at or below 250 ms and p95 at or below 1.5 s.
- Browser interaction target: navigation begins in the click task with no RSC fetch error.
- Hosted AuthKit latency is measured separately; it must not be reported as ThumbGate render time.

## Evidence plan

1. Run unit, runtime-contract, lint, Cloudflare build, and Worker+D1 auth lifecycle E2E locally.
2. Require GitHub CI on the rebased PR.
3. Deploy the exact merged tree.
4. In a signed-out production browser, verify one sign-in CTA, click it, confirm the production AuthKit host, and confirm no vinext RSC navigation error.
5. Sample the public page, ThumbGate redirect, and complete hosted-auth chain separately after deployment.

## Primary references

- vinext project: https://github.com/cloudflare/vinext
- React navigation and transitions: https://react.dev/reference/react/useTransition
- Resource hints: https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel/preconnect
- Interaction to Next Paint: https://web.dev/articles/inp
- Cloudflare Workers observability: https://developers.cloudflare.com/workers/observability/
- WorkOS AuthKit sessions: https://workos.com/docs/authkit/sessions
- WorkOS AuthKit Next.js SDK: https://workos.com/docs/sdks/authkit-nextjs
- WorkOS pricing: https://workos.com/pricing

The full research output and citations are preserved at `parallel-research/thumbgate-auth-performance-july-2026.md` and `.json`.
