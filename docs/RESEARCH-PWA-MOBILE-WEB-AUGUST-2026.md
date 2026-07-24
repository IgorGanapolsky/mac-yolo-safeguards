# August 2026 PWA Playbook for ThumbGate Hermes Web

A decision-grade checklist for shipping a dark dashboard mobile web app that installs, scrolls without overlap, and feels native on iOS 26 and Android 15. Evidence drawn from MDN, web.dev, Chrome, Apple HIG, and current React libraries.

## Executive Summary

- **App-Shell Model Is Non-Negotiable**: The shell (chrome + tab bar + composer + nav) must be cached and painted before route content per the web.dev architecture pattern. Hermes Web should split: (1) static shell HTML/CSS/JS cached by the service worker, (2) dynamic content fetched per route -> improves LCP, removes flash-of-empty-shell on cold load.
- **100dvh Replaces 100vh**: Dynamic viewport units are Baseline (2023+); use `height: 100dvh` for the app root, not `100vh`, because `100vh` includes collapsed toolbars and forces re-layout when chrome shows/hides [17].
- **viewport-fit=cover + env(safe-area-inset-*)**: Set `viewport-fit=cover` in the viewport meta to opt into the full screen including the notch and home indicator; consume `env(safe-area-inset-top|right|bottom|left)` on any edge that meets the bezel (status bar, tab bar, composer) [37], [36].
- **Fixed Composer Must Adapt to Keyboard via VisualViewport**: Watch `window.visualViewport.height` and `resize` events to translate the composer above the on-screen keyboard; do not rely on `position: fixed` alone because iOS Safari pushes content when inputs focus [13].
- **iOS 26 Safari Fixed-Positioning Regression**: A 2025-2026 iOS bug breaks sticky/fixed layouts at the bottom edge. The community workaround is `overflow: hidden` on the body or containing scroller [15]. Plan for this in Hermes Web's CSS reset.
- **PWA Manifest 2026 Requires `id`**: Chrome now demands `id`, `start_url`, `short_name`/`name`, at least one 192 and 512 icon (maskable preferred), a registered service worker with a `fetch` handler, and HTTPS for the install prompt to fire [24], [25].
- **display_override Enables Modern Display Modes**: Prefer `display_override: ["window-controls-overlay", "standalone", "minimal-ui"]` over plain `display: standalone` so the app negotiates the best available mode without dropping chrome unexpectedly [22].
- **View Transitions Are Baseline 2025**: Use `document.startViewTransition()` (or React 19's `<ViewTransition>`) for route changes so the tab bar can persist visually across navigation without a hard cut [57].
- **Virtualized Chat List + Fixed Composer Pattern**: Render the message list inside a flex-1 scroll container above a sticky composer; use react-virtuoso's `followIfAtBottom` to auto-scroll on new messages without jank react-virtuoso.
- **Dark Dashboard Specifics**: Set `theme_color` and `background_color` to dark values in both the manifest and the `<meta name="theme-color">` tag so the splash and status bar blend with the chrome rather than flashing white [24].
- **Apple HIG Compliance**: Tab bars should use SF Symbols-style icons with single-word labels and respect safe areas [100], [98].
- **CLS-Free Composer Mount**: Reserve composer height with `padding-bottom` on the scroll container rather than mounting/unmounting on focus, otherwise fixed elements cause layout shift on every interaction web.dev CLS.

## 1. App-Shell Layout With Fixed Tab Bar

The app-shell model keeps the chrome (top bar, tab bar, composer) in cached HTML/CSS/JS while per-route content streams in. Hermes Web's shell should be one CSS grid:

```
.app { height: 100dvh; display: grid;
       grid-template-rows: env(safe-area-inset-top) auto 1fr auto env(safe-area-inset-bottom);
       grid-template-areas: "status" "header" "main" "tabbar" "home-indicator"; }
```

Rules:
- Root fills with `100dvh`, not `100vh`, because the dynamic viewport unit accounts for Safari's collapsing address bar [17].
- Status row uses `env(safe-area-inset-top)`; home indicator row uses `env(safe-area-inset-bottom)`; tab bar height reserves extra padding for the home indicator in standalone mode [98].
- The middle (`1fr`) is the route outlet and only scroll container; everything else is fixed/grid-locked so route scroll never causes the chrome to reflow.
- Cache the shell with the service worker using a `cacheFirst` strategy for `/`, `/shell.css`, and `/shell.js`; load routes with `staleWhileRevalidate` so navigation is instant offline-first [1].

## 2. Chat + Composer Without Overlap

The single highest-risk interaction in a chat dashboard is the soft keyboard. iOS Safari does not reflow fixed elements when the keyboard opens; it pushes the whole document up. The fix combines three layers:

| Layer | Mechanism | Source |
|-------|-----------|--------|
| Keyboard detection | `window.visualViewport.height` + `resize` event | [48] |
| Composer translation | Set `--vv-height: var(--visualViewport-height)` on `:root`; composer uses `bottom: calc(env(safe-area-inset-bottom) + var(--keyboard-up-offset))` | [49] |
| Body scroll lock | On focus, set `body { overflow: hidden }` so Safari cannot scroll the page; restore on blur | [13] |

Practical pattern for Hermes Web:
- Use react-virtuoso's `MessageList` for the thread; pass `followIfAtBottom` and `initialTopMostItemIndex` so streaming replies stay pinned without jank react-virtuoso.
- Reserve the composer height as `padding-bottom` on the virtualizer's scroll container; do not toggle fixed/sticky on focus, otherwise the document reflows and CLS rises web.dev CLS.
- iOS 26 regression safety net: add `body { overflow: hidden }` and let the inner scroller own scroll; this works around the fixed-position bottom bug [15].

## 3. CSS Patterns: 100dvh, Safe-Area, Overflow

Anchor rules that should appear in Hermes Web's global stylesheet:

```css
html, body { height: 100dvh; overflow: hidden; overscroll-behavior: none;
             background: var(--bg); color: var(--fg);
             color-scheme: dark light; }

.viewport-meta <meta name="viewport"
                      content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">

.scroll-area { height: calc(100dvh - var(--header-h) - var(--tabbar-h) - var(--composer-h)
                            - env(safe-area-inset-top) - env(safe-area-inset-bottom));
               overflow-y: auto; overscroll-behavior: contain;
               -webkit-overflow-scrolling: touch; }
```

Why each token matters:
- `100dvh` is the only height unit that updates when Safari chrome shows/hides; `100vh` lies about height and forces re-layout [17].
- `viewport-fit=cover` is required for `env(safe-area-inset-*)` to return non-zero values; without it, the variables are `0` even on a notched device [37].
- `overscroll-behavior: contain` prevents pull-to-refresh and scroll chaining that yanks the chrome on Android PWA in standalone mode [36].
- `interactive-widget=resizes-content` shrinks the visual viewport when the keyboard opens, letting `100dvh` re-measure correctly instead of letting fixed content get clipped.

Section isolation (perf): wrap long lists in `content-visibility: auto` with a `contain-intrinsic-size` so off-viewport routes skip render cost [1].

## 4. PWA Install/Manifest Essentials 2026

Hermes Web's `manifest.webmanifest` must include:

| Field | Value (Hermes Web) | Required? | Notes |
|-------|--------------------|-----------|-------|
| `name` | "Hermes Web" | required (or short_name) | Long name for install dialog |
| `short_name` | "Hermes" | required if not name | Used under home-screen icon |
| `id` | "/dashboard" | required since 2024 | Stable across origin moves [24] |
| `start_url` | "/?source=pwa" | required | Excludes tracking params on launch |
| `scope` | "/" | recommended | Define explicitly; don't rely on fallback [45] |
| `display` | "standalone" | recommended | Hides URL bar |
| `display_override` | ["window-controls-overlay","standalone","minimal-ui"] | optional | Negotiates advanced modes without falling off a cliff [22] |
| `theme_color` | "#0b0f17" | optional but strongly recommended | Dark dashboard primary tint |
| `background_color` | "#0b0f17" | optional | Splash background; match theme |
| `icons` | 192, 512, maskable 512 | required | Maskable required for adaptive icons on Android |
| `orientation` | "portrait" | optional | Lock for dashboard consistency |

Service worker requirements: must register with a `fetch` handler, even if it just calls `fetch(event.request)`. HTTPS is required (localhost is exempt) [25].

iOS-specific meta tags (still required because Safari ignores the manifest for "Add to Home Screen" affordance):
```
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Hermes">
<link rel="apple-touch-icon" href="/icons/apple-512.png">
```
[34].

## 5. Anti-Patterns Checklist

| Anti-pattern | Why it hurts Hermes Web | Fix |
|--------------|------------------------|-----|
| `height: 100vh` on body | Lays out against largest viewport; resizes jarringly when Safari chrome shows/hides | `height: 100dvh` [17] |
| Missing `viewport-fit=cover` | `env(safe-area-inset-*)` returns 0; composer sits behind home indicator on iOS 26 | Add `viewport-fit=cover` to viewport meta [37] |
| No `body { overflow: hidden }` on chat screen | iOS scrolls page on input focus, then composer is hidden under keyboard | Lock body scroll on focus; restore on blur [13] |
| Tab bar with 5+ items | Apple HIG recommends 3-5; exceeding breaks target sizing | Cap at 5 with "More" overflow [100] |
| `theme-color` mismatch | White flash on launch in dark dashboard | Set manifest `theme_color` + `background_color` to dashboard chrome color [24] |
| Hard route cuts | Jarring swap from one route to another | Use View Transitions for cross-route navigation [57] |
| Render all chat messages | Jank past ~200 messages, poor INP | Virtualize with react-virtuoso MessageList react-virtuoso |
| Manifest without `id` | Install prompt suppressed on Chrome 2024+ | Set `id` field explicitly [24] |
| Synchronous service worker registration on every render | Blocks main thread; tanks INP | Register once in app boot; do not re-register per route [1] |
| `beforeinstallprompt` without save guard | Fires once; if not cached, prompt is lost | Capture event into state; call `prompt()` only when user opts in [25] |

## Synthesis

Hermes Web sits at the intersection of three patterns that must be designed together, not in isolation:

1. **Shell vs content separation** (web.dev architecture) dictates the grid: chrome is one layout layer; routes stream into a single scroll container. This avoids the most common mobile-web bug where the tab bar and composer shift as content reflows.

2. **Dynamic viewport measurement** (`100dvh`, `viewport-fit=cover`, `env(safe-area-inset-*)`) is the only safe way to fill the screen and respect device bezels on iOS 26 and Android 15. Treating any of these tokens as optional leads to composers hidden behind home indicators or tab bars overlapped by Safari chrome.

3. **Keyboard-aware composition** (VisualViewport + react-virtuoso) decouples input UX from layout reflow. Listening to the visual viewport lets Hermes Web translate the composer above the on-screen keyboard instead of letting iOS scroll the page, eliminating the focus-jump bug that plagues most React chat demos.

Where these three meet is the installable, native-feeling PWA: a shell that is cached for instant load, a viewport that never lies about its size, and a composer that adapts to the keyboard without touching the document's scroll position. Implementing them as a single coherent stack - rather than bolting each on independently - is what distinguishes a production mobile web app from a responsive web page.

## References

1. *Architecture - web.dev*. https://web.dev/learn/pwa/architecture
2. *Server-side rendering & the app shell model - Stack Overflow*. https://stackoverflow.com/questions/42971457/server-side-rendering-the-app-shell-model
3. *Understanding Rendering in Web Apps: SPA vs MPA*. https://dev.to/snickdx/understanding-rendering-in-web-apps-spa-vs-mpa-49ef
4. *Jake Archibald (@jaffathecake) / Posts / X*. https://x.com/jaffathecake?lang=en
5. *PWA Mobile Testing Checklist 2026: Offline, Installable ...*. https://mobileviewer.github.io/pwa-mobile-testing-checklist-2026
6. *Keyboard - React Native Chat Messaging Docs*. https://getstream.io/chat/docs/sdk/react-native/guides/keyboard
7. *Handle keyboard actions | Jetpack Compose*. https://developer.android.com/develop/ui/compose/touch-input/keyboard-input/commands
8. *GitHub - kirillzyusko/react-native-keyboard-controller: ⌨️ Keyboard manager which works in identical way on both iOS and Android*. http://github.com/kirillzyusko/react-native-keyboard-controller
9. *Bottom Tabs Navigator - React Navigation*. https://reactnavigation.org/docs/bottom-tab-navigator
10. *GitHub - kesha-antonov/react-native-chat: The most complete chat UI for React Native & Web - streaming AI messages, emoji reactions, replies, quick replies, and full customization. TypeScript-first, Expo-ready. · GitHub*. http://github.com/kesha-antonov/react-native-chat
11. *javascript - How to prevent iOS keyboard from pushing the ...*. https://stackoverflow.com/questions/38619762/how-to-prevent-ios-keyboard-from-pushing-the-view-off-screen-with-css-or-js
12. *How to Fix Gap Between Modal Bottom Sheet and Soft Keyboard ...*. https://www.w3tutorials.net/blog/i-get-a-gap-between-my-modal-bottom-sheet-and-soft-keyboard-i-m-using-jetpack-compose-for-ui-is-there-any-solution-for-this-as-i-can-t-find-any
13. *iOS PWA Keyboard Fix - GitHub*. https://github.com/Crscristi28/ios-pwa-keyboard-fix
14. *How to 'polyfill' `interactive-widget=resizes-content` for meta ...*. https://stackoverflow.com/questions/78844736/how-to-polyfill-interactive-widget-resizes-content-for-meta-viewport-tag-on
15. *iOS 26 Safari - Web layouts are breaking due to fixed/sticky position ...*. https://stackoverflow.com/questions/79753701/ios-26-safari-web-layouts-are-breaking-due-to-fixed-sticky-position-elements-g
16. *PWA safe area using env (safe-area-inset-bottom) - Ask us ...*. https://community.weweb.io/t/pwa-safe-area-using-env-safe-area-inset-bottom/17206
17. *CSS dvh, svh, lvh: Mobile Viewport Height Fix*. https://modern-css.com/mobile-viewport-height-without-100vh-hack
18. *<meta name="viewport"> HTML attribute value - HTML | MDN*. http://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport
19. *http://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env*. http://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env
20. *Using safe-area-inset to build mobile-safe layouts - Polypane*. https://polypane.app/blog/using-safe-area-inset-to-build-mobile-safe-layouts
21. *Display Override | PWA Bundle*. https://pwa.spomky-labs.com/experimental-features/non-standard-parameters/display-override
22. *display_override - Web app manifest | MDN*. https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display_override
23. *Chrome & PWA updates 2026: new features every web app builder ...*. https://saastostore.com/blog/chrome-pwa-updates-2026
24. *Web application manifest - Progressive web apps | MDN*. https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest
25. *Making PWAs installable - Progressive web apps | MDN*. https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
26. *web-vitals@5.3.0*. http://jsdocs.io/package/web-vitals
27. *Understand Web Vitals - Dash0*. https://www.dash0.com/docs/dash0/monitoring/websites/understand-web-vitals
28. *Core Web Vitals 2026: Complete Optimization Checklist*. https://leadsuitenow.com/blog/core-web-vitals-optimization-guide
29. *CLS Demo - Cumulative Layout Shift | WebVitals*. https://webvitals.com/cls
30. *Core Web Vitals Checker*. https://speedvitals.com/tools/core-web-vitals-checker
31. *Human Interface Guidelines*. http://developer.apple.com/design/human-interface-guidelines
32. *How to Add Safari to Your Home Screen: 6 Easy Ways wikiHow https://www.wikihow.com › ... › Smartphones › IPhone*. https://www.wikihow.com/Add-Safari-to-Home-Screen
33. *Supported Meta Tags - Safari HTML Reference*. https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html
34. *Configuring Web Applications - Apple Developer*. https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
35. *apple-itunes-app · Meta Tag - zhead*. https://zhead.dev/meta/apple-itunes-app
36. *env() CSS function - CSS | MDN*. https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env
37. *<meta name="viewport"> HTML attribute value - HTML | MDN*. https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport
38. *Supercharge Web Performance with content-visibility: A Deep ...*. https://medium.com/%40ademyalcin27/supercharge-web-performance-with-content-visibility-a-deep-dive-into-the-game-changing-css-3a90e22d698f
39. *Content Visibility - WebPerf Snippets - nucliweb*. https://webperf-snippets.nucliweb.net/Loading/Content-Visibility
40. *CSS content-visibility Reference & Tester — Performance ...*. https://puredevtools.tools/css-content-visibility
41. *"content-visibility" is a very impressive CSS property that ...*. https://www.reddit.com/r/webdev/comments/kq0nl2/contentvisibility_is_a_very_impressive_css
42. *CSS Containment Module Level 3*. http://w3.org/TR/css-contain-3
43. *Setting "start_url" and scope in "manifest.json" for a React ...*. https://stackoverflow.com/questions/75683989/setting-start-url-and-scope-in-manifest-json-for-a-react-pwa
44. *Scope | 1.4.x | PWA Bundle*. https://pwa.spomky-labs.com/1.4.x/the-manifest/application-information/scope
45. *scope - Web app manifest | MDN - MDN Web Docs*. https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/scope
46. *Manifest missing id : r/Nuvio*. https://www.reddit.com/r/Nuvio/comments/1te0a9n/manifest_missing_id
47. *Manifest file format | Chrome for Developers*. https://developer.chrome.com/docs/extensions/reference/manifest
48. *VisualViewport - Web APIs | MDN - MDN Web Docs*. https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
49. *Modal | React Aria - Adobe*. https://react-aria.adobe.com/Modal
50. *KeyboardAvoidingView*. https://reactnative.dev/docs/keyboardavoidingview
51. *iOS keyboard covers inputs when using useDialog/useModalOverlay*. https://github.com/adobe/react-spectrum/issues/5926
52. *Virtual Keyboard Bevy Engine https://bevy.org › examples › ui-user-interface › virtual-...*. https://bevy.org/examples/ui-user-interface/virtual-keyboard
53. *View Transition API - Web APIs | MDN - MDN Web Docs*. https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API
54. *View Transitions API and CSS Scroll-Driven Animations: The ...*. https://www.frontendhorizon.com/blog/view-transitions-api-and-css-scroll-driven-animations-the-browser-wins-of-2026
55. *Chrome 147 enables concurrent and nested view transitions ...*. https://developer.chrome.com/blog/element-scoped-view-transitions
56. *Transition between routes in react-router-dom v6.3*. https://stackoverflow.com/questions/71808023/transition-between-routes-in-react-router-dom-v6-3
57. *View transitions for single page applications - web.dev*. https://web.dev/learn/css/view-transitions-spas
58. *Keeping things fresh with stale-while-revalidate*. https://web.dev/articles/stale-while-revalidate
59. *Stale While Revalidate Strategy | Offline Support Caching ...*. https://www.swiftorial.com/swiftlessons/progressive-web-apps/offline-support-caching/stale-while-revalidate-strategy
60. *Offline data - web.dev*. https://web.dev/learn/pwa/offline-data
61. *Stale-While-Revalidate, Done Right | by Bhagya Rana | Medium*. http://medium.com/%40bhagyarana80/stale-while-revalidate-done-right-1674de0053ca
62. *UX Patterns: Stale-While-Revalidate - InfoQ*. http://infoq.com/news/2020/11/ux-stale-while-revalidate
63. *React Virtuoso*. http://virtuoso.dev/
64. *GitHub - gluebi/react-virtuoso-message-list: The most ...*. https://github.com/gluebi/react-virtuoso-message-list
65. *How to override css prefers-color-scheme setting - Stack Overflow*. https://stackoverflow.com/questions/56300132/how-to-override-css-prefers-color-scheme-setting
66. *petyosi/react-virtuoso: The most powerful virtual list ...*. http://github.com/petyosi/react-virtuoso
67. *React memo is good actually*. https://timtech.blog/posts/react-memo-is-good-actually
68. *safe-area-inset-bottom not working on ios 15 safari - Stack Overflow*. https://stackoverflow.com/questions/73355967/safe-area-inset-bottom-not-working-on-ios-15-safari
69. *Safari 26.0 Release Notes | Apple Developer Documentation*. https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes
70. *Safari problem after official iOS 26 upda… - Apple Community*. https://discussions.apple.com/thread/256136680
71. *Bottom TabBar not adapted to safe-area on iOS PWA ... - GitHub*. https://github.com/lobehub/lobehub/issues/10454
72. *Fix iOS PWA safe area handling for dynamic island and bottom ...*. https://github.com/Latitudes-Dev/shuvcode/issues/244
73. *apple-mobile-web-app-status-bar-style on iPhone 11 Stack Overflow 1 answer · 6 years ago*. https://stackoverflow.com/questions/61109717/apple-mobile-web-app-status-bar-style-on-iphone-11
74. *apple-mobile-web-app-status-bar-style in ios 10 - Stack Overflow*. https://stackoverflow.com/questions/39749015/apple-mobile-web-app-status-bar-style-in-ios-10
75. *Changing The iOS Status Bar Of Your Progressive Web App - Medium*. https://medium.com/appscope/changing-the-ios-status-bar-of-your-progressive-web-app-9fc8fbe8e6ab
76. *Complete guide to customizing the mobile status bar in a website or ...*. https://intercom.help/progressier/en/articles/10574799-complete-guide-to-customizing-the-mobile-status-bar-in-a-website-or-pwa
77. *Color splash png Vectors - Download Free High-Quality ... Magnific https://www.magnific.com › ...*. https://www.magnific.com/vectors/color-splash-png
78. *PWA Push Notifications on iOS in 2026: What Really Works*. https://webscraft.org/blog/pwa-pushspovischennya-na-ios-u-2026-scho-realno-pratsyuye?lang=en
79. *PWA 2026 Guide: Master Offline-First & Push Notifications*. https://www.kocakyazilim.com/en/blog/pwa-2026-guide-master-offline-first-push-notifications
80. *http://producthunt.com/products/truepush*. http://producthunt.com/products/truepush
81. *PWA beforeinstallprompt Uncaught (in promise) DOMException*. https://stackoverflow.com/questions/56236591/pwa-beforeinstallprompt-uncaught-in-promise-domexception
82. *PWA Install Criteria Checklist — Manifest, Icons, HTTPS, and ...*. https://pwaicos.com/guides/pwa-install-criteria-checklist
83. *Revisiting Chrome's installability criteria*. https://developer.chrome.com/blog/update-install-criteria
84. *The beforeinstallprompt event does not fire in my Blazor ...*. https://issues.chromium.org/issues/432416170
85. *react-virtuoso/README.md at main · petyosi/react-virtuoso*. https://github.com/petyosi/react-virtuoso/blob/master/README.md
86. *Scrolling jumps when List rendered with largely varied height items*. https://github.com/petyosi/react-virtuoso/issues/131
87. *How to create sticky headers on scroll with react*. https://stackoverflow.com/questions/62970456/how-to-create-sticky-headers-on-scroll-with-react
88. *Sticky Scroll*. https://ui-layouts.com/components/sticky-scroll
89. *Interaction to Next Paint (INP) - web.dev*. https://web.dev/articles/inp
90. *Interaction to Next Paint (INP): A Practical Guide for 2026*. https://parachutedesign.ca/blog/interaction-to-next-paint-inp
91. *Interaction to Next Paint (INP) Is Now a Core Web Vitals ...*. http://rebelmouse.com/inp-core-web-vitals
92. *Interaction to Next Paint (INP) Guide by Quattr*. http://quattr.com/core-web-vitals/what-is-interaction-to-next-paint
93. *Interaction to Next Paint - Catchpoint*. https://www.catchpoint.com/core-web-vitals/interaction-to-next-paint
94. *View Transitions API (single-document) | Can I use... Support tables ...*. https://caniuse.com/view-transitions
95. *<ViewTransition> – React*. https://react.dev/reference/react/ViewTransition
96. *Cross-document view transitions for multi-page applications*. https://developer.chrome.com/docs/web-platform/view-transitions/cross-document
97. *iOS Tab Bar: A Complete UX and Design Guide for 2026*. https://uiuxdesigning.com/ios-tab-bar
98. *Layout | Apple Developer Documentation*. https://developer.apple.com/design/human-interface-guidelines/layout
99. *Tab bars | Apple Developer Documentation*. https://ma-kobol-public-prod.apple.com/design/human-interface-guidelines/tab-bars
100. *Tab bars | Apple Developer Documentation*. https://developer.apple.com/design/human-interface-guidelines/tab-bars
101. *Sidebars | Apple Developer Documentation*. https://developer.apple.com/design/human-interface-guidelines/sidebars

## Update — 2026-07-24

Re-verified against current MDN, Chrome, and package-registry sources, and checked against the actual ThumbGate/Hermes Web codebase in this repo.

### Still correct, re-confirmed
- **`100dvh`**: real and shippable — support since Chrome 108, Safari 15.4, Firefox 101 (caniuse). Calling it "Baseline 2023+" is close enough directionally; formal Baseline "widely available" status (30 months after last-engine ship) lands closer to mid-2025, but by July 2026 it is unambiguously safe to use everywhere. No correction needed to the recommendation itself.
- **`viewport-fit=cover` + `env(safe-area-inset-*)`**: still the correct, current mechanism; unchanged.
- **iOS 26 Safari fixed/sticky-position bug**: confirmed real and still open as of July 2026 — multiple independent reports (Apple Developer Forums threads #800798 and #801028, Apple Community threads, a live Mastodon GitHub issue #36144) describe the same failure: fixed/sticky elements anchored near the bottom edge get clipped or fail to track the viewport when Safari's floating toolbar hides/shows. The doc's workaround guidance (body scroll-lock + inner scroller owning scroll) is the right approach and matches what other sites are shipping as a stopgap.
- **View Transitions API**: broad support confirmed (Chrome/Edge 111+, Safari 18+, Opera 97+), ~88% global reach per caniuse. One nuance: Firefox only enabled it by default at v144, very recently — so calling it flatly "Baseline 2025" slightly overstates cross-engine maturity. Treat it as a progressive enhancement (feature-detect `document.startViewTransition`), not an assumed-present API, until Firefox's rollout ages further.
- **WorkOS-unrelated CSS mechanics** (`overscroll-behavior: contain`, `content-visibility: auto`, `interactive-widget=resizes-content`): unchanged, still current.

### Corrections (doc overstated or mis-cited)
1. **Manifest `id` is NOT required for the install prompt.** Both MDN's manifest-`id` reference and Chrome's own "Revisiting Chrome's installability criteria" post confirm: if `id` is omitted, the browser falls back to `start_url` and the app is still installable. The doc's Executive Summary and §4 state Chrome "demands `id`... for the install prompt to fire" — that's wrong; `id` is recommended (it stabilizes app identity across `start_url` changes) but not a gate.
2. **The service-worker requirement was relaxed, not tightened.** Chrome removed the requirement for a service worker with a `fetch` handler as an installability gate back in Chrome 108 (mobile) / 112 (desktop). The doc's §4 line "must register with a `fetch` handler... for the install prompt to fire" is stale — a service worker is no longer required at all for the base install criteria (though still needed for offline caching, which is a real and separate reason to have one).
3. **`react-virtuoso`'s `followIfAtBottom` does not exist.** Verified against npm/virtuoso.dev: the chat-specific `MessageList` component with built-in auto-scroll/streaming support lives in **`@virtuoso.dev/message-list`**, a *separate, commercial* package — it is not bundled in the free/MIT `react-virtuoso` the doc cites throughout. The free `react-virtuoso` `<Virtuoso>` component's auto-scroll-on-new-item prop is named **`followOutput`**, not `followIfAtBottom`. Action: either budget for `@virtuoso.dev/message-list` if the polished chat-list API is wanted, or use `react-virtuoso` + `followOutput` and accept building the "stick to bottom unless user scrolled up" logic manually.

### Codebase gap check (this is the big finding)
Neither app in this repo currently implements the playbook. There are **two** distinct web surfaces and it matters which one "ThumbGate Hermes Web" refers to going forward:

- **`apps/hermes-control-plane`** — the real production app at `thumbgate.app` (Next 16.2 + vinext + Cloudflare Workers, per `docs/RESEARCH-THUMBGATE-HERMES-MOBILE-WEB-JULY-2026.md`'s Option A decision). This is almost certainly what "Hermes Web" means going forward, and it has **zero PWA scaffolding**: no `manifest.webmanifest`, no service worker, no icons, no `<meta name="viewport">` and no Next `viewport` export anywhere in `app/layout.tsx` (worth double-checking Next 16's default viewport injection before assuming a bare page is safe). Its `app/globals.css` uses `100vh` in three places (lines 5, 13, 40) and has **no** `env(safe-area-inset-*)` usage anywhere. It does have a real fixed bottom tab bar (`.mobile-web-tabs`, `position:fixed; bottom:0; height:72px`, `app/globals.css:180`) that reserves **no** safe-area padding — exactly the element the doc's own iOS-26 citation warns will misbehave on notched devices once Safari's toolbar animates.
- **`apps/hermes-dashboard`** — an older, separate, plain-JS "Hermes Threads" desktop-first dashboard (`@hermes-mobile/dashboard`, no React/Next). It *does* ship a `manifest.webmanifest`, but it is non-compliant with even the still-required install criteria: `"icons": []` (empty — fails the 192/512 requirement that Chrome/MDN still enforce), no `id`, no `display_override`, no service worker at all. Its CSS uses `100vh` (not `100dvh`) and only one `env(safe-area-inset-bottom)` use (composer padding).

**Net effect:** this playbook is a from-scratch build plan, not a retrofit checklist — flag that explicitly so whoever picks it up doesn't assume any of §1–§4 is already wired into either app. Recommended next step before writing code: confirm with Igor which app is the intended PWA target (most likely `hermes-control-plane`/thumbgate.app given the Option-A architecture decision), then apply §1–§4 there as new work, and either retire or intentionally scope `hermes-dashboard`'s partial/broken manifest.
