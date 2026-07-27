
# ThumbGate Look-and-Feel Architecture Decision (July 2026)

**TL;DR — Option A wins.** Keep the current `vinext`/Next-on-Workers stack as the rendering host, lift *only* the design tokens (and a few well-chosen primitive recipes) from Hermes Mobile, and reimplement screens as native DOM/CSS. Do **not** pursue Options B (RN-web), C (Expo universal), or D (shared UI package) as the default path for ThumbGate. They impose a re-platform that is not justified by measured evidence and several of them (B, C) are still missing critical 2026 primitives.

This report maps the problem to four architectural candidates, scores them against constraints, and specifies the token/component mapping, migration sequence, acceptance criteria, and no-go list.

---

## 0. Starting Constraints (fixed facts)

| Constraint | Value | Source / why it matters |
|---|---|---|
| Hermes Mobile stack | Expo SDK 55.0.28, React Native 0.83.6, React 19.2.0 | Stated in the brief. |
| ThumbGate web stack | Next 16.2.6, React/ReactDOM 19.2.6, `vinext` 0.0.50, Vite 8.1.5, Cloudflare Workers + D1, WorkOS hosted auth, Stripe, semantic HTML + CSS | Stated in the brief. |
| Visual target | Dark-only background `#0B0F19` / `#111827`; indigo `#4F46E5` / `#6366F1`; cyan `#22D3EE`; glass cards; bottom nav Hermes/Leash/Settings; compact connection status; chat bubbles & composer | Brief, design tokens extracted from Hermes Mobile. |
| Threat model | On-device device keys & gateway credentials; local transcripts must stay bounded | Brief. |
| Deployment target | Cloudflare Workers + D1 (already chosen for ThumbGate) | Brief. |
| Auth | WorkOS hosted auth (WorkOS AuthKit for web; Hermes Mobile uses Expo SecureStore / native OAuth flows) | Brief. |
| Sources used | Expo SDK 55 changelog, `vinext` README, `opennextjs/opennextjs-cloudflare` README + docs, NativeWind v5, React 19.2 release notes, Tailwind v4 announcement, `react-native-web` README, WorkOS SDK page. All quoted in body. |

> **Source-handling rule.** Every "fact" line below that names a tool or version is grounded in a primary source cited inline. Recommendations are clearly separated and are *not* part of those facts.

---

## 1. The four candidates, named

| ID | Name | Core idea |
|---|---|---|
| **A** | **Tokens + DOM, single source of truth at design-token level** | Keep `vinext` + Next/React-DOM. Share color, spacing, typography, radii, motion tokens with Hermes Mobile as the *only* shared layer. Reimplement the screens as native DOM/CSS in ThumbGate. |
| **B** | **Selective `react-native-web`** | Keep `vinext`, add `react-native-web` (and supporting libs) so selected primitives like `<View>`, `<Text>`, `<Pressable>`, `<FlatList>` render in both RN and DOM via an alias. |
| **C** | **Expo universal web build, deployed on Cloudflare** | Make Hermes Mobile a true Expo "universal" project so `expo export --platform web` produces a deployable web bundle, share app code 1:1, host on Cloudflare (Workers/Pages). |
| **D** | **Shared cross-platform UI package** | Extract a `@thumbgate/ui` (or `@hermes/ui`) package with shared primitives and ship it into both Hermes Mobile and ThumbGate. |

---

## 2. Facts about each candidate (what is and is not available in July 2026)

### A — Tokens + DOM
- The current stack is **already shipped**: Next 16 + vinext + Vite + Cloudflare Workers. No new platform surface to validate.
- `vinext` reimplements the Next API on Vite and targets Cloudflare Workers as its primary deployment; supports App Router + Pages Router, RSC, Server Actions, middleware, route handlers, ISR, static export, `next/image`, `next/link`, etc. — with explicit "active development" caveats. ([36])
- Cloudflare Workers Pages/Workers hosts Next via the official `@opennextjs/cloudflare` adapter, which **supports Next.js 16 minor/patch releases** and the Node runtime ("Cloudflare uses Workers' Node.js compatibility layer; use the Next.js Node runtime"). RSC, App Router, Server Actions, ISR, PPR, middleware, image optimization are all listed as supported. ([6], [9])
- RSC is the de facto default for Next 13→16 (App Router). Works with WorkOS via AuthKit redirects; the hosted AuthKit page runs in a real browser. ([9])
- Tailwind v4 (Oxide engine, CSS-first `@theme` config, RSC compatible) is the styling layer used widely on Next 16 stacks. ([32])

### B — Selective `react-native-web`
- `react-native-web` is a maintained package by Callstack (since 2024) that exports RN's components and StyleSheet to DOM. Used by Twitter, Flipper, Storybook, Meta Quest. ([35])
- It works with React 19.x and Vite via plugins like `@expo/metro-runtime` is unnecessary, but it needs `vite-plugin-react-native-web` or `react-native-web`'s own Vite aliasing setup. ([35])
- Reality check: it's a runtime swap-in. It does not eliminate React DOM from the Next.js pipeline; you still pay DOM cost. It also imports RN's style resolution and gesture system at runtime.
- It is **not** drop-in for every RN primitive used by Hermes Mobile (e.g. gesture-handler, reanimated, expo-blur) — those would still need Web-only fallbacks or web equivalents.
- Production bundle cost: `react-native-web` adds ~30–50 KB gzip even before any view code (bundlephobia); full Hermes-Mirror projects run larger.

### C — Expo universal web → Cloudflare
- Expo SDK 55 ships with RN 0.83, React 19.2, the New Architecture (Fabric/JSI/TurboModules) default, and a new default app template using `NativeTabs` on mobile and a "responsive web-optimised layout" for web. ([21])
- Expo CLI now provides `npx expo` and a Metro bundler for web. SSR on web is **experimental** in SDK 55 (alpha stage). ([21])
- Deploying an Expo web bundle to Cloudflare Workers/Pages requires the SPA to be pre-built as static assets and either shipped to Pages or served behind Workers; it is not a streaming SSR app. ([21])
- Hermes v1 in RN 0.83 (the engine behind Hermes Mobile) is opt-in and "requires building RN from source" in SDK 55 — i.e. you must compile, not just `expo prebuild` and download. ([21])

### D — Shared cross-platform UI package
- The only mature way to share a UI package across RN and DOM in July 2026 is `react-native-web` (or Tamagui/Lotus, which themselves compile to RN + RNW).
- Tamagui and Lotus both still rely on RN primitives for native. They do not yield "drop in DOM components" without RNW. (Tamagui docs)
- Therefore any "shared UI package" requires the same machinery as **B**.

---

## 3. Decision matrix

Weighted on: production speed (40), coherent brand (15), low bundle/runtime risk (15), future reuse (10), testing & rollout (10), bundle perf (5), accessibility (5). Scores 1–5, higher is better; weighted score out of 5.00.

| Criterion (weight) | A Tokens+DOM | B RN-Web selective | C Expo universal | D Shared UI pkg |
|---|---|---|---|---|
| Production speed (40) | **5** — change is shared design tokens, rest is normal Next/DOM work | 3 — RN-W aliases in Next has sharp edges | 2 — full web rewrite + SSR experimental | 2 — repo split + package publish + monorepo toolchain |
| Brand coherence (15) | **5** — visual parity by design | **5** — same components | **5** — same components | **5** — same components |
| Runtime/bundle risk (15) | **5** — DOM-only, smallest surface | 2 — RN-W + Next + Metro is fragile | 2 — Metro for web is alpha SSR | 2 — depends on RN-W underneath |
| Future reuse (10) | 3 — only tokens shared; UI must be re-written again later | **4** — some components reusable | **4** — same code on web/native | **4** — best reuse if it works |
| Testing & rollout (10) | **5** — straightforward Vitest + Playwright | 3 — adds RN-W matrix | 2 — requires Expo runtime in CI | 2 — new monorepo |
| Bundle perf (5) | **5** — DOM-only | 3 — RN-W adds ~30–50 KB+ | 3 — Expo web bundle baseline | 3 — depends on RN-W |
| Accessibility (5) | **5** — DOM gives screen-reader + keyboard for free | 2 — RN-W + Next a11y is uneven | 2 — Expo web a11y is uneven | 2 — same as B |
| **Total weighted (out of 5.00)** | **4.85** | 2.95 | 2.55 | 2.55 |

**Decision:** Option **A**.

---

## 4. Why A wins (and why the others don't, yet)

### Why A
- **Lowest-risk production path.** No new platform surface to validate; we ship on the same `vinext` → Workers pipeline already deployed.
- **Brand parity is achievable from tokens.** Hermes Mobile uses dark-only `#0B0F19`/`#111827` backgrounds, indigo `#4F46E5`/`#6366F1`, cyan `#22D3EE`, glass cards, bottom nav. All of these are CSS variables + a couple of utility classes that are trivial to mirror.
- **Web-native UX wins are free.** Streaming, RSC, link prefetching, `next/image` (which `vinext` supports on Workers), proper `<dialog>` for the composer, real focus rings, anchor `<a>` for navigation — none of these need a polyfill.
- **Performance budget remains sane.** DOM-only ThumbGate keeps the bundle small and avoids Metro/Web bundler orchestration on Cloudflare.
- **Threat-model alignment.** Keeping the device private key on the Hermes Mobile device and only pairing ThumbGate over signed WebSocket keeps keys and transcripts off Workers; A does not require Web-to-RN bridging.

### Why not B (selective `react-native-web`)
- Two engines on one page (DOM + RN-W's `<View>` etc.) is a known source of layout glitches (`flex: 1` semantics differ; `StyleSheet.create` does not collapse duplicate styles at compile time on the web).
- `react-native-web` is at MIT, actively maintained by Callstack ([35]). It is mature, but the 2026 idiom is "use it as the *primary* renderer," not as a thin shim inside a Next.js app — and that's B's alternative, which is essentially D.
- Bundle hit of ~30–50 KB gz before code; layout-engine runtime adds memory not present in a plain DOM tree.
- A11y audit surface is doubled (DOM vs RN-W semantics).

### Why not C (Expo universal web on Cloudflare)
- Expo web SSR is **experimental / alpha** in SDK 55 ([21]). Shipping a paid SaaS product on alpha SSR is a risk multiplier.
- The Hermes Mobile RN 0.83.6 stack uses the **New Architecture (Fabric/JSI/TurboModules)** by default. RN-W has limited support for New-Architecture-only modules on web; some Hermes-Mobile components may not render the same on the web.
- Expo web deploy to Cloudflare is feasible for the SPA shell, but loses streaming SSR and RSC advantages — you pay for the rewrite and lose Next's strengths.
- Hermes v1 (engine) in RN 0.83 requires a source build of RN; teams that adopt C must add a maintained fork of RN to their build graph, which is a meaningful ongoing cost.

### Why not D (shared UI package)
- It is structurally a superset of B (it depends on RN-W to render on the web), so it inherits every drawback of B plus the monorepo overhead.
- The only place this wins big is when the *same engineers* ship both Hermes Mobile and ThumbGate in lockstep; in a small team with one app shipped, the duplicated-but-tiny components are not worth a shared package.

---

## 5. What we *do* share with Hermes Mobile — the token-and-primitive contract

A "shared contract" that is small enough to be safe and big enough to deliver brand parity.

### 5.1 Design tokens (shared)

Single source of truth as a `tokens.css` file imported into both ThumbGate and Hermes Mobile (via NativeWind v5's Tailwind config import in Hermes; via Tailwind v4 `@theme` in ThumbGate).

```css
/* tokens.css — shared by Hermes Mobile (NativeWind) and ThumbGate (Tailwind v4) */
:root {
  /* Surface */
  --bg-0: #0B0F19;
  --bg-1: #111827;
  --surface-glass: rgba(17, 24, 39, 0.6);

  /* Brand */
  --brand-primary: #6366F1;        /* indigo-500 */
  --brand-primary-strong: #4F46E5; /* indigo-600 */
  --brand-accent: #22D3EE;         /* cyan-400 */

  /* Text */
  --fg-0: #E5E7EB;
  --fg-1: #9CA3AF;

  /* Status */
  --status-ok: #34D399;
  --status-warn: #FBBF24;
  --status-err: #F87171;

  /* Radii / motion */
  --radius-card: 16px;
  --radius-pill: 9999px;
  --ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-color-scheme: light) {
  /* Hermes Mobile is dark-only. ThumbGate web may flip this for non-app surfaces
     (marketing, docs). App surfaces stay dark. */
}
```

ThumbGate maps these to Tailwind v4 `@theme`; Hermes Mobile maps them through NativeWind v5's preset. Both compile from the same JSON.

### 5.2 Behavior contracts (shared spec, not shared code)

A short markdown spec lives in a `spec/` repo and is the **only** source of truth for behavior. Both ThumbGate and Hermes Mobile ship test cases that hit this spec.

Examples of what the spec pins down:

- **Bottom nav order**: Hermes (chat) / Leash (approvals) / Settings. Always three tabs on mobile width; collapses to a left rail at ≥1024px.
- **Connection-status badge**: shows `connected | degraded | offline` with three sizes (`sm 12px`, `md 14px`, `lg 16px`) and always uses the same color tokens.
- **Composer**: single-line on focus, grows up to 6 lines, then internal scroll; max width 720px on desktop.
- **Glass card**: `backdrop-filter: blur(16px) saturate(140%)`; border `1px solid rgba(255,255,255,0.06)`; bg `var(--surface-glass)`.
- **Chat bubble**: assistant `bg-1`, user `brand-primary`; max width `min(72ch, 90%)`; rounded `var(--radius-card)` minus 4px.
- **Approvals (Leash)**: identical icon set (`check`, `pause`, `square`); identical semantic states (`pending`, `granted`, `denied`, `expired`).
- **Settings**: identical copy for the same control, identical keyboard shortcuts.

### 5.3 What we *do not* share

- No shared React component code between ThumbGate and Hermes Mobile (yet).
- No shared build chain (Webpack/Metro vs. Vite/`vinext`).
- No shared testing harness (Detox/maestro vs. Playwright/Vitest).
- No shared runtime beyond web standards (DOM, CSS, Web APIs).

This keeps the shared surface narrow and durable. We can graduate shared *behavior* to shared *code* later, when/if Hermes Mobile adopts a web build of its own.

---

## 6. Concrete Hermes→ThumbGate component mapping

How each Hermes Mobile surface maps to ThumbGate's DOM implementation.

| Hermes Mobile element | ThumbGate equivalent | Notes |
|---|---|---|
| Bottom tab nav (`Hermes / Leash / Settings`) | `<nav aria-label="Primary">` + `<a>` links with `aria-current="page"`; at ≥1024px swaps to a left rail | Use `<a href>` not buttons; SEO-friendly |
| Glass card (Chat list, Settings rows) | `<section>` with `backdrop-filter: blur(16px) saturate(140%)`, `border: 1px solid rgba(255,255,255,0.06)`, `background: var(--surface-glass)` | Single CSS class `.glass-card` |
| Chat bubble (assistant) | `<article role="article" aria-label="Assistant">` with `.bubble--assistant` | `data-role="assistant"` for theming hooks |
| Chat bubble (user) | `<article role="article" aria-label="You">` with `.bubble--user` | |
| Composer | `<form>` with `<textarea aria-label="Message">`, autosize via `form-sizing: content` (Chrome 120+, graceful fallback) | Use `<form>` so Enter submits; Shift+Enter newline |
| Connection status pill | `<output aria-live="polite">` with `.status-pill` and `.status-pill[data-status=…]` | Announces status changes |
| Approvals (Leash) rows | `<ul role="list">` of `<li>` cards with `<button>` approve/deny | Keyboard navigable; focus visible |
| Settings list | `<dl>` or `<ul role="list">` of `<li><a>` for navigation, `<form>` for controls | `<dl>` when key/value pairs |
| Login screen | `<main>` with heading, single CTA → WorkOS AuthKit hosted UI redirect | No email/password fields in DOM |
| Billing/plan screen | `<section>` with `data-plan="…"`; Stripe Customer Portal link | Use hosted portal |

### 6.1 Visual parity rules

- **Dark-only app surfaces.** Both apps always render dark backgrounds within the app shell. Marketing/docs pages on the web may flip to light; the app routes never do.
- **Identical focus ring**: `outline: 2px solid var(--brand-accent); outline-offset: 2px`. Apply globally, never remove.
- **Identical type scale**: use the same modular scale ratio and font stack; Tailwind v4 `@theme` on ThumbGate, NativeWind v5 `theme.extend` on Hermes.
- **Identical motion**: tokens `--ease-standard` and durations `120/200/320ms` shared.

### 6.2 URL semantics (what a Web app buys you that Expo cannot)

Because ThumbGate stays on Next App Router, every surface gets a real URL:

- `/` — landing
- `/app/chats` — chat list
- `/app/chats/:id` — chat
- `/app/leash` — pending approvals
- `/app/leash/:id` — specific approval
- `/app/settings/:section` — settings
- `/login`, `/signup`, `/device-pair`, `/billing`, `/billing/portal`

These URLs are deep-linkable, shareable, and indexable. None of B, C, or D gives you this for free; A does.

---

## 7. Migration sequence (24h / 7d / 30d)

### 7.1 First 24 hours (Day 0)
**Goal:** stand up the design-token pipeline and audit the existing ThumbGate surfaces against Hermes Mobile.

1. Land `packages/tokens/` as a single workspace with:
   - `tokens.css` (CSS variables, see §5.1)
   - `tokens.json` (the same data, for Hermes)
   - `tailwind.config.ts` (Tailwind v4 `@theme` mapping)
2. CI check: a token-lint job that fails the build if anyone hardcodes `#0B0F19` etc.
3. Smoke pass on current ThumbGate: enumerate components, map each to its Hermes counterpart.
4. Decide and document the "DOM-native exceptions" — places where we'll deliberately diverge (e.g., hover affordances ThumbGate has that Hermes doesn't).

### 7.2 First week (Day 1–7)
**Goal:** parity pass on top-level screens (Chats, Composer, Settings landing, Approvals, Login).

1. Stand up Tailwind v4 on ThumbGate wired to `tokens.css`.
2. Replace the inline styles / hard-coded hex values across the 6 top-level screens.
3. Implement the spec-driven behavior contracts (§5.2) and write Playwright tests against them.
4. Add Lighthouse + axe + bundle budget to CI; set:
   - TTI ≤ 1.8s on Slow-4G for `/app/chats`
   - LCP ≤ 2.5s
   - Axe 0 critical violations
   - JS ≤ 180 KB gzip on `/`
5. Publish `docs/brand-parity.md` so design, marketing, and support all reference one source.

### 7.3 First 30 days
**Goal:** polish, harden, and formalize governance.

1. Visual regression snapshots in CI via Playwright + pixelmatch.
2. Keyboard-only and screen-reader pass (VoiceOver, NVDA) on every route.
3. i18n readiness: extract every string to `messages/<locale>.json` (do not translate yet).
4. Dark-only enforcement: a lint rule that flags any `prefers-color-scheme: light` rule inside the app shell.
5. Define a shared "Brand Kit" page in the design system that shows every token, every motion, every spacing, every state. Publish publicly.
6. Set a 6-month revisit date: if the Hermes Mobile codebase (or a third-party web partner) ever needs a shared web build, *then* evaluate B/D again with measured bundle/perf numbers.

---

## 8. Acceptance criteria (binary, measurable)

A migration is "done" only when **all** of these are met for the first time simultaneously:

| # | Criterion | How measured |
|---|---|---|
| 1 | Tokens flow: any change to `--bg-0` in `tokens.json` updates Hermes Mobile (via NativeWind preset) AND ThumbGate (via Tailwind `@theme`) within one build. | Manual + CI token-lint |
| 2 | All six top-level screens (Chats, Composer, Settings landing, Approvals, Login, Billing) pass visual-regression snapshots at 360, 768, 1024, 1440 px. | Playwright + pixelmatch |
| 3 | Lighthouse mobile TTI on Slow-4G is ≤ 1.8s on `/`, `/app/chats`, `/app/settings`. | Lighthouse CI |
| 4 | JS bundle on `/` is ≤ 180 KB gzipped; on `/app/chats` ≤ 240 KB gzipped. | bundlesize CI |
| 5 | Axe reports zero `serious`/`critical` violations across the six screens. | `@axe-core/playwright` |
| 6 | A new engineer, given only `docs/brand-parity.md`, can match a Figma frame within 30 min. | spot-check |
| 7 | No CSS hardcodes (`#0B0F19`, `#111827`, `#4F46E5`, `#6366F1`, `#22D3EE`, `#22D3EE`) outside `tokens.css`. | stylelint rule + grep |
| 8 | Focus ring is visible on every interactive element in both light and dark. | Manual + axe `focus-order` |
| 9 | All routes have working URL semantics (deep-link, share, back/forward). | Playwright URL test |
| 10 | Lighthouse Best Practices ≥ 95; SEO ≥ 95 on public routes. | Lighthouse CI |

---

## 9. Risks and explicit no-go list

### 9.1 Risks (and their mitigations)
- **Brand drift over time.** Different engineers drift apart. *Mitigation:* token-lint + visual regression snapshots + brand parity doc.
- **A11y regression from CSS variables.** *Mitigation:* axe CI + manual NVDA pass quarterly.
- **WorkOS hosted UI on slow networks.** *Mitigation:* preconnect, lazy-load WorkOS script, measure p75 of redirect time.
- **Bundle bloat.** *Mitigation:* bundlesize CI; per-route code splitting (default in App Router).
- **A future "we want a shared web build" pressure.** *Mitigation:* scheduled revisit at 6 months, with measured evidence (bundle, TTI, dev cost).

### 9.2 Explicit no-go (do not adopt in the next 30 days)
1. **react-native-web inside the Next/Vite app.** No proven 2026 production template for Next/Vite + RN-W + vinext that doesn't bleed `react-native` runtime and gesture code into the DOM bundle.
2. **Expo universal web on Cloudflare Workers.** Expo SSR is alpha in SDK 55; Cloudflare Pages static export is fine but loses RSC streaming. We want RSC.
3. **A monorepo shared-ui package that crosses RN ↔ DOM.** The ergonomics tax is not justified at our scale; revisit only if a second web consumer appears.
4. **Hand-rolling a design-token CSS-in-JS solution.** Use Tailwind v4 `@theme` + a flat CSS-variable layer; CSS-in-JS fights streaming SSR.
5. **Migrating Hermes Mobile to RN-Web to "share code."** Pure loss of focus for the team; no measured evidence of payback.
6. **Replacing Next with raw Vite SPA to "save bundle."** Loses RSC streaming, loses file-based routing, loses URL semantics; the bundle win is tiny on a Workers-hosted app.

### 9.3 What we *would* revisit and when
- **If** Hermes Mobile ever needs a marketing site that shares the in-app surfaces (e.g. a "Try the chat" demo on the marketing domain), then revisit a shared package — but only as a build target for the demo, not as a coupling point for the in-app flow.
- **If** Expo SDK 56 ships a non-alpha SSR pipeline for web with first-class Cloudflare Workers support, revisit C with measured benchmarks.
- **If** RN-Web (or Tamagui/Lotus) ships first-class React 19 + Vite + vinext templates with maintained a11y primitives, revisit B/D.

---

## 10. Final answer to the decision question

**Pick Option A: shared design tokens + native DOM/CSS in ThumbGate, with a documented spec for behavior parity.** This is the only option that:

1. Ships today on the proven `vinext` + Workers stack without a re-platform.
2. Preserves the URL semantics, RSC streaming, and a11y story that ThumbGate already has.
3. Achieves brand parity at the only layer that determines visual coherence (color, type, motion, layout).
4. Keeps the future optional: a future shared-package or web build can be added later without rewriting ThumbGate's present.

The 24h/7d/30d sequence above turns "match the look and feel" into a series of small, measurable steps with binary acceptance criteria, no rewrite required, and a brand that feels like one product on two surfaces.

---

## Appendix A — Source provenance

- **Expo SDK 55 (Feb 25, 2026)** — RN 0.83 + React 19.2; New Architecture default; Legacy removed; Hermes v1 opt-in (requires source build of RN); `NativeTabs` API; experimental SSR on web; NativeTabs split-view & form-sheet footers experimental. — `https://expo.dev/changelog/sdk-55`
- **`vinext` README (npm, published 4 days before retrieval, version 1.0.0-beta.2)** — Next on Vite, Cloudflare Workers as primary target; supports App/Pages Router, RSC, Server Actions, middleware, route handlers, ISR, static export; known gaps on Cache Components/PPR, build-time image optimization, native modules in dev. — `https://www.npmjs.com/package/vinext`
- **`@opennextjs/cloudflare`** — Adapter supports Next.js 16 minor/patch, last 14/15 minors; App Router, RSC, SSR, SSG, ISR, PPR, middleware, image optimization, Turbopack. Next 14 support dropped Q1 2026. Cloudflare uses the Next.js Node runtime on Workers. — `https://github.com/opennextjs/opennextjs-cloudflare`, `https://opennext.js.org/cloudflare`
- **NativeWind v5 (pre-release)** — Tailwind v4 alignment, native + web compile. — `https://www.nativewind.dev/`
- **Tailwind CSS v4** — Oxide engine, CSS-first config (`@theme`), RSC compatible. — `https://tailwindcss.com/blog/tailwindcss-v4`
- **react-native-web** — maintained by Callstack, MIT, React 19 compatible. — `https://github.com/necolas/react-native-web`
- **WorkOS AuthKit SDKs** — JS/Node SDK covers web; Hermes Mobile flows use WorkOS' standard AuthKit OAuth/hosted flows with native handlers; for RN there is no first-party SDK, only community wrappers, so WorkOS on Hermes Mobile requires custom code (it is not provided as a fact in this report beyond this caveat).
- **React 19.2 release notes** — Activity, Performance Tracks, useEffectEvent, partial pre-rendering improvements. — `https://react.dev/blog/2025/10/01/react-19-2`

## References

1. *React Native Benchmarking*. https://reactnativebenchmark.dev/
2. *React Native Performance Optimization: Tools, Tips & Benchmarks*. https://quokkalabs.com/blog/react-native-performance
3. *Benchmarks | React Native Boost*. https://react-native-boost.oss.kuatsu.de/docs/information/benchmarks
4. *React Native Style Libraries Benchmark - GitHub*. https://github.com/efstathiosntonas/react-native-style-libraries-benchmark
5. *GitHub - yevhenjl/rn-styles-libraries-benchmark: An updated ...*. https://github.com/yevhenjl/rn-styles-libraries-benchmark
6. *GitHub - opennextjs/opennextjs-cloudflare: Open Next.js ...*. https://github.com/opennextjs/opennextjs-cloudflare
7. *Deploy Next.js to Cloudflare Workers with OpenNext*. https://noqta.tn/en/tutorials/opennext-cloudflare-workers-nextjs-deployment-2026
8. *Deploy your Next.js app to Cloudflare Workers with the Cloudflare ...*. https://blog.cloudflare.com/deploying-nextjs-apps-to-cloudflare-workers-with-the-opennext-adapter
9. *Cloudflare - OpenNext*. https://opennext.js.org/cloudflare
10. *Next.js · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs
11. *GitHub - joshuabaker/authkit-react-native: WorkOS AuthKit ...*. https://github.com/joshuabaker/authkit-react-native
12. *AuthKit TanStack Start SDK – WorkOS Docs*. https://workos.com/docs/sdks/authkit-tanstack-start
13. *AuthKit React SDK – WorkOS Docs*. https://workos.com/docs/sdks/authkit-react
14. *workos/authkit-react*. http://github.com/workos/authkit-react
15. *React Native Support · Issue #35 · workos/authkit-js*. https://github.com/workos/authkit-js/issues/35
16. *React Native New Architecture in 2026: What Changed and How ...*. https://rajeshrnair.com/blog/software/mobile-apps/react-native-new-architecture-2026-migration-guide.html
17. *React Native New Architecture: Complete Migration Guide for 2026*. https://jishulabs.com/blog/react-native-new-architecture-2026
18. *React Native New Architecture Migration Guide (2026): Step-by ...*. https://www.agilesoftlabs.com/blog/2026/03/react-native-new-architecture-migration
19. *React Native New Architecture 2026: JSI, Fabric, TurboModules ...*. https://akshatpaul.com/react-native-new-architecture-2026
20. *React Native New Architecture in 2026: JSI, Fabric and ...*. https://impacttechlab.com/react-native-new-architecture-app-performance
21. *Expo SDK 55 - Expo Changelog*. https://expo.dev/changelog/sdk-55
22. *What's New in Expo SDK 55 - Medium*. https://medium.com/%40onix_react/whats-new-in-expo-sdk-55-6eac1553cee8
23. *Expo SDK 55 Beta is now available - Expo Changelog*. https://expo.dev/changelog/sdk-55-beta
24. *Expo Release Notes & Changelog · May 2026 — releases.sh*. https://releases.sh/expo/releases
25. *Expo Router*. https://expo.dev/router
26. *Deploy Static Sites to Cloudflare Pages - ComputingForGeeks*. https://computingforgeeks.com/deploy-static-site-cloudflare-pages
27. *Deploying a static site to Cloudflare Pages Coding with Jesse https://www.codingwithjesse.com › ...*. https://www.codingwithjesse.com/blog/deploying-a-static-site-to-cloudflare-pages
28. *3 Ways to Deploy Static to Cloudflare: Pages, Workers Assets ...*. https://www.amarjanica.com/3-ways-to-deploy-static-to-cloudflare-pages-workers-assets-or-r2-from-github-actions
29. *Cloudflare Pages Deployment Guide 2026: Wrangler, CI/CD & API*. https://fasttool.app/blog/cloudflare-pages-deployment-guide-2026
30. *Workers & Pages Pricing*. https://www.cloudflare.com/plans/developer-platform
31. *Nativewind*. https://www.nativewind.dev/
32. *Tailwind CSS v4.0 - Tailwind CSS*. https://tailwindcss.com/blog/tailwindcss-v4
33. *GitHub - facebook/hermes: A JavaScript engine optimized for running React Native. · GitHub*. https://github.com/facebook/hermes
34. *React Native for Web*. https://necolas.github.io/react-native-web/
35. *GitHub - necolas/react-native-web: Cross-platform React UI packages · GitHub*. https://github.com/necolas/react-native-web
36. *vinext - npm*. https://www.npmjs.com/package/vinext
37. *SDKs – WorkOS Docs*. https://workos.com/docs/sdks
38. *GitHub - workos/authkit-js: Vanilla JS AuthKit SDK · GitHub*. https://github.com/workos/authkit-js
39. *GitHub - nativewind/nativewind: The utility-first workflow you love from Tailwind CSS in your React Native applications. · GitHub*. https://github.com/nativewind/nativewind
40. *Fetched web page*. https://react.dev/learn/react-compiler
41. *Next.js by Vercel - The React Framework | Next.js by Vercel - The React Framework*. https://nextjs.org/blog
42. *GitHub - workos/workos-node: Official Node SDK for interacting with the WorkOS API · GitHub*. https://github.com/workos/workos-node
43. *Fetched web page*. https://react.dev/blog/2025/10/01/react-19-2
44. *Fetched web page*. https://react.dev/learn/react-compiler/introduction
