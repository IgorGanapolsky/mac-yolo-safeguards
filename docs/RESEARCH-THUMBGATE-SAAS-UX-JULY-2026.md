# ThumbGate SaaS UX decision — July 2026

Research run: `trun_d3be5e813aa94970bea07ecb5f64cb86`

Raw evidence: `parallel-research/thumbgate-saas-ux-july-2026.md` and `.json`

## Verdict

Keep ThumbGate's web surface on React 19 with Vinext/Vite and Cloudflare Workers. Do not move the marketing, authentication, or chat-heavy web experience to React Native Web. Reuse Hermes Mobile's visual language and product vocabulary, not its rendering runtime.

The benchmark compared ChatGPT, Claude, Linear, Raycast, Vercel, WorkOS/AuthKit, Tailscale, Replit, GitHub, and Stripe. The highest-ROI patterns for ThumbGate are:

1. Make signed-out and authenticated state unmistakable; private workspace data stays behind server-side authentication.
2. Keep sign-out visible and reachable in one action from the authenticated landing page.
3. Treat one-command, zero-paste Mac pairing as the product's main activation event.
4. Use onboarding-oriented empty states and progressive disclosure instead of inert dashboard cards.
5. Enforce WCAG 2.2 AA fundamentals in code and CI, including keyboard access, visible focus, and usable target sizes.
6. Test the real Worker runtime with an opaque session, private-route denial, logout revocation, and cleared-cookie behavior.

Primary evidence includes [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [RFC 8628 device authorization](https://datatracker.ietf.org/doc/html/rfc8628), [Tailscale device approval](https://tailscale.com/docs/features/access-control/device-management/device-approval), [Vercel's 2026 navigation redesign](https://vercel.com/changelog/new-dashboard-navigation-available), [WorkOS AuthKit](https://workos.com/docs/authkit/overview), [Cloudflare's React/Vite guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/), and [React `useOptimistic`](https://react.dev/reference/react/useOptimistic). Vendor screenshots and third-party teardowns are supporting inspiration, not product-performance proof.

## Implemented in this change

- Authenticated landing navigation now exposes both **Open dashboard** and a first-class **Sign out** POST action.
- Signed-in users see explicit shared-device session guidance; signed-out users continue to see only public content and sign-in entry points.
- The landing page has a keyboard skip link, named primary navigation, 44 px session targets, visible focus support, and reduced-motion handling.
- The local Cloudflare Worker E2E seeds an opaque session and proves:
  - anonymous dashboard redirect;
  - anonymous private APIs return `401`;
  - authenticated landing and dashboard access;
  - `/api/me` tenant identity;
  - logout cookie clearing and server-side session revocation;
  - the revoked token is denied;
  - the browser returns to a signed-out landing state.
- Required CI runs unit coverage thresholds plus the named Worker E2E gate.

## Next P0/P1 work

These are deliberately not bundled into this landing-page change because their files are owned by another active task or require separate product decisions:

- Add axe/Playwright viewport coverage and a manual VoiceOver release smoke.
- Measure pair start-to-approval time and drive p50 below 25 seconds with zero token paste.
- Finish responsive dashboard navigation, empty/loading/error states, reversible chat deletion, and account/device controls.
- Show failover allowance and cost before enabling paid continuation.
- Preserve drafts across session expiry and transient network failure.

## Measurement

Track this funnel without message content or email addresses: landing view → sign-in click → authenticated landing → first chat visible → pairing started → pairing approved → failover enabled → checkout created → paid subscription confirmed. Treat published benchmarks as hypotheses; ThumbGate's own cohort data decides subsequent changes.
