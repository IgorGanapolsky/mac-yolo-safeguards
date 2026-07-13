# Hermes Mobile — July 2026 standards gap backlog

**Created:** 2026-07-13  
**Branch at audit:** `fix/silent-run-status-notifications`  
**Purpose:** Prioritized engineering backlog to close the gap between “strong Expo stack” and “best-in-class AI companion mobile app.”  
**Not a ship claim.** Continuous E2E at write time: `e2e=skipped` (no USB Android).

> **Public Issues note (2026-07-13):** GitHub issues #190–#201 were opened then closed (`not planned`) — internal agent backlog must not use the public Issues board. This markdown file + `plan.md` remain the engineering source of truth.

**GitHub epic (operate the backlog here):** [#190 Epic: Hermes Mobile July 2026 standards gap backlog](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/190)

| Gap ID | GitHub | Priority |
|--------|--------|----------|
| Epic | [#190](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/190) | — |
| G-01 | [#191](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/191) | P0 |
| G-02 | [#192](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/192) | P0 |
| G-03 | [#193](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/193) | P0 |
| G-04 | [#194](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/194) | P0 |
| G-05 | [#195](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/195) | P0 |
| Auth/identity (pre-existing) | [#132](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/132) | P0 |
| Leash glance copy (pre-existing) | [#139](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/139) | P0 |
| G-10 | [#196](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/196) | P1 |
| G-11 | [#197](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/197) | P1 |
| G-12 | [#198](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/198) | P1 |
| G-13 | [#199](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/199) | P1 |
| G-14 | [#200](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/200) | P1 |
| Notifications + G-15 subset | [#141](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/141) | P1 |
| Project cwd (pre-existing) | [#138](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/138) | P1 |
| G-20–G-23 umbrella | [#201](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/201) | P2 |

**Label taxonomy:** `priority:p0|p1|p2|p3` · `area:hermes-mobile|gateway|ci|security|a11y|perf` · `effort:S|M|L|XL` · `status:ready|in-progress|blocked|review` · `handoff:claude|replit|cursor` · `epic` · `tech-debt`

**Related:** [REAL-USER-READINESS.md](./REAL-USER-READINESS.md), [PERFORMANCE.md](./PERFORMANCE.md), [PREVENT-RECURRENCE-JULY-2026.md](./PREVENT-RECURRENCE-JULY-2026.md), [ARCHITECTURE.md](../ARCHITECTURE.md)

---

## 0. Scorecard (evidence baseline)

| Layer | Score | Evidence |
|------|-------|----------|
| Expo / RN platform | **8/10** | Expo 55.0.27, RN 0.83.6, React 19.2, New Arch + Hermes + edge-to-edge, React Compiler, expo-doctor 19/19, `release:check` ok |
| Release / OTA / size | **8/10** | EAS Updates, R8 minify+shrink, arm64-only, bundle ~1.9 MB HBC, privacy manifests, `allowBackup: false` |
| Chat runtime primitives | **7/10** | FlashList 2, `use-context-selector`, lazy tabs; ChatScreen still god-object |
| Observability | **7/10** | Sentry + PostHog + opt-out; no TTI/FPS artifacts |
| Security | **6/10** | SecureStore for secrets; global `usesCleartextTraffic: true` |
| Architecture | **4/10** | ChatScreen ~6625 L / 60 useState / 46 useEffect; GatewayContext ~2905 L / ~86 API fields |
| Accessibility | **4/10** | ~90 a11y props vs ~213 pressables; labels in ~25/87 TSX files |
| Real-user product | **5–6/10** | Android Play public; iOS not public; onboarding still Mac+relay/operator-shaped |
| Device proof today | **n/a** | `docs/proofs/continuous/latest.json` → `e2e: skipped` |

**Overall product bar vs ChatGPT/Claude-class companions: ~6/10.**  
**Overall Expo engineering checklist: ~8/10.**

---

## 1. Priority framework

| Pri | Definition | When to pull |
|-----|------------|--------------|
| **P0** | Real-user blocked, security wrong-default, or ship honesty broken | Now / next merge train |
| **P1** | High leverage quality: maintainability, core UX reliability, measured perf | Next 1–2 sprints |
| **P2** | Modern defaults (storage, images, a11y completeness) | After P0/P1 stabilize |
| **P3** | Nice-to-have platform alignment (expo-router, full redesign) | Only if deep-link/nav surface forces it |

**Effort:** S ≤1 day · M 2–4 days · L 1–2 weeks · XL multi-week  
**Risk:** Low / Med / High to production behavior

**Multi-agent rule:** Claim files in repo-root `plan.md` §1+§2 before editing. `ChatScreen.tsx` and `GatewayContext.tsx` are historically high-contention — never dual-own.

---

## 2. Priority backlog

### P0 — Real users, honesty, security defaults

#### G-01 · Restore continuous device E2E truth
| | |
|--|--|
| **Problem** | Agents cannot claim chat UX verified; `latest.json` is `e2e=skipped`. |
| **Evidence** | `docs/proofs/continuous/latest.json` (2026-07-13): `unit=pass`, `e2e=skipped`, detail no USB Android. |
| **Target** | Continuous subset green on physical Android (or honest “device absent” without ship theater). |
| **Effort / Risk** | S / Low |
| **Files** | `scripts/run-continuous-e2e.sh`, device install path, no app logic required if device present |
| **AC** | 1. USB device in `adb devices`. 2. `npm run e2e:continuous:once` exits 0. 3. `latest.json` has `e2e: "pass"`, `unit: "pass"`, `updatedAt` within 24h. 4. Log covers `.maestro/ship-guard.yaml` + `.maestro/chat-send-persistence.yaml`. |
| **Verify** | `cat docs/proofs/continuous/latest.json` · `npm run e2e:continuous:status` |

#### G-02 · Scope Android cleartext (LAN only, not global)
| | |
|--|--|
| **Problem** | `usesCleartextTraffic: true` is a global production weak default. LAN pair needs HTTP; Play/cloud must stay HTTPS-only. |
| **Evidence** | `app.json` → `expo-build-properties.android.usesCleartextTraffic: true`; discovery uses `http://{host}:{port}/pair.json`. |
| **Target** | Network security config: cleartext only for RFC1918 / link-local / loopback; deny cleartext to public hosts. |
| **Effort / Risk** | M / Med (pair regressions) |
| **Files** | `app.json` / config plugin, optional `android/app/src/main/res/xml/network_security_config.xml`, `src/services/gatewayDiscovery.ts`, tests for URL policy |
| **AC** | 1. Production build cannot fetch `http://example.com` (fails). 2. LAN `http://192.168.x.x:8787/pair.json` still works on same Wi‑Fi. 3. HTTPS gateway + relay paths unchanged. 4. Unit tests for host classification (private vs public). 5. `npm run release:check` still ok. |
| **Verify** | `npm test -- --testPathPattern='gatewayUrlPolicy\|gatewayDiscovery\|networkSecurity'` · device pair QR/LAN once |

#### G-03 · Stranger day-1 path without adb (Android)
| | |
|--|--|
| **Problem** | Product is dogfood-shaped; real users need install → pair → send without USB/dev unlock. |
| **Evidence** | `REAL-USER-READINESS.md`: onboarding **Partial**; relay/QR requires Mac Hermes; cellular needs tunnel/Tailscale. |
| **Target** | Documented + Maestro-proven path: Play install (or Firebase link) → Connect Mac gate → pair code/QR → one successful send. |
| **Effort / Risk** | L / Med |
| **Files** | `ConnectMacGate.tsx`, `FreshUserOnboardingCard.tsx`, `ChatConnectionPanel.tsx`, `.maestro/*`, copy utils — **not** chat send guts unless broken |
| **AC** | 1. Cold start without profiles shows single primary CTA + numbered steps (existing contract). 2. New Maestro flow `stranger-pair-send.yaml` (or extend ship-guard) with **no** `developerLeashUnlock`, no adb reverse dependency in assertions. 3. Unit: `freshUserOnboarding` + connection panel jargon-free. 4. Written day-1 path linked from Firebase/Play release notes (agent-owned doc update). |
| **Verify** | `npm test -- --testPathPattern='freshUser\|ChatConnectionPanel\|ConnectMacGate'` · Maestro stranger flow on release APK |

#### G-04 · iOS public readiness track (separate from Android)
| | |
|--|--|
| **Problem** | “Best similar apps” are dual-platform; iOS not searchable/public. |
| **Evidence** | REAL-USER-READINESS: iOS not public / ASC path incomplete. |
| **Target** | TestFlight external or App Store live with same stranger-pair story; no operator secrets in review notes. |
| **Effort / Risk** | L / High (store process) |
| **Files** | EAS `production` iOS, ASC scripts, review notes guards (existing) |
| **AC** | 1. `bash scripts/agent-pre-asc-edit.sh` before any ASC edit. 2. `verify-asc-listing` / review-notes guard green. 3. TestFlight build installable by non-Igor Apple ID. 4. No gateway URL/API key in review notes. |
| **Verify** | Existing ASC verify JSON under `docs/proofs/asc-*` · store skill `verify-app-store-publish-state` |

#### G-05 · Kill residual ship theater on `e2e=skipped`
| | |
|--|--|
| **Problem** | Recurrence class: “fixed on device” when continuous E2E skipped/fail. |
| **Evidence** | PREVENT-RECURRENCE #7–#8; current `latest.json` skipped. |
| **Target** | CI/agent gate: release/ship scripts refuse “device verified” language when e2e ≠ pass (or emit explicit UNVERIFIED). |
| **Effort / Risk** | S / Low |
| **Files** | `scripts/verify-continuous-e2e.sh`, optional `tools/agent-decision-stack.js` consumer, docs only if needed |
| **AC** | 1. Script exits non-zero (or JSON `deviceVerified: false`) when `e2e` is skip/fail. 2. Documented in AGENTS verification ladder (already partial). 3. Unit/contract test if script is Node-tested. |
| **Verify** | `npm run e2e:continuous:status` with synthetic skipped JSON fixture |

---

### P1 — Architecture, reliability, measured quality

#### G-10 · Carve ChatScreen into feature modules (no behavior change first)
| | |
|--|--|
| **Problem** | 6625-line screen with 60 `useState` / 59 `useCallback` / 46 `useEffect` is unreviewable and multi-agent conflict magnet. |
| **Evidence** | `wc -l src/screens/ChatScreen.tsx` → 6625; hook counts from AST scan 2026-07-13. |
| **Target** | Phase extract pure hooks/components; ChatScreen becomes composition shell ≤~1500 lines first milestone. |
| **Effort / Risk** | XL / High (if mixed with features) — **behavior-neutral only** |
| **Suggested extract order** | 1) keyboard/composer dock (`resolveEffectiveKeyboardInset` already exported) 2) session list / threads modal 3) send + stream ownership 4) scroll policy 5) connection overlays |
| **Files** | New: `src/screens/chat/*` or `src/features/chat/*`; shrink `ChatScreen.tsx`; move tests with modules |
| **AC** | 1. **Zero intentional behavior change** in phase 1. 2. Full `npm test` green; ChatScreen suite count ≥ pre-split. 3. Each extract has focused tests (existing pure helpers stay exported). 4. `ChatScreen.tsx` line count ≤ 2500 after phase 1, ≤ 1500 after phase 2. 5. Continuous E2E pass on device when available. 6. No new barrel `index.ts` re-exports (PERFORMANCE.md). |
| **Verify** | `npm test -- --watchman=false` · `wc -l src/screens/ChatScreen.tsx` · Maestro continuous |

#### G-11 · Split GatewayContext by domain (connection / approvals / chat-sync / profiles)
| | |
|--|--|
| **Problem** | Single provider ~2905 L, ~86 public fields; any consumer of `useGateway()` re-renders broadly. |
| **Evidence** | `GatewayContextValue` fields; ChatScreen still hits `useGateway` 8×; selectors exist but incomplete. |
| **Target** | Domain providers or split contexts; hot paths use `useGatewayConnection` / Approvals / ChatSync only. |
| **Effort / Risk** | XL / High |
| **Files** | `src/context/GatewayContext.tsx` → e.g. `GatewayConnectionProvider`, `GatewayApprovalsProvider`, …; `useGatewaySelector.ts`; App.tsx providers |
| **AC** | 1. `useGateway()` remaining call sites ≤ 5 (provider, deep link, tab badge only) — grep budget. 2. ChatScreen/Settings/Approvals use focused hooks. 3. Existing GatewayContext tests migrated; no flaky timer tests. 4. Heal + profile scan + approvals still covered by unit. 5. Full Jest green. |
| **Verify** | `rg -n "useGateway\\(" src --glob '!**/__tests__/**'` · `npm test -- --testPathPattern=GatewayContext` |

#### G-12 · Chat send / stream ownership isolation
| | |
|--|--|
| **Problem** | Send recovery, session-removed, WS vs HTTP stream dual-write live inside ChatScreen — highest bug density historically. |
| **Evidence** | ChatScreen comments at send/retry/removed-session paths; large `ChatScreen.test.tsx` (~2423 L). |
| **Target** | `useChatSendController` (or service) with pure state machine + tests independent of React tree. |
| **Effort / Risk** | L / Med |
| **Files** | New utils/hooks under `src/features/chat/`; ChatScreen wiring only |
| **AC** | 1. State machine unit tests for: success stream, empty stream recovery, session removed + one retry, offline fail copy, stop mid-stream. 2. No duplicate user bubbles on retry (existing contract preserved). 3. Maestro `chat-send-persistence` green. |
| **Verify** | Focused Jest + continuous E2E |

#### G-13 · Measured performance budget (prove FlashList work)
| | |
|--|--|
| **Problem** | PERFORMANCE.md implements primitives but no TTI/FPS artifacts; cannot claim “best.” |
| **Evidence** | No `docs/proofs/perf/`; Flashlight only install hint. |
| **Target** | One checked-in or gitignored-with-summary perf report per release train. |
| **Effort / Risk** | M / Low |
| **Files** | `docs/proofs/perf/README.md` + latest summary JSON; scripts wrapping Flashlight or Reassure |
| **AC** | 1. Cold start → Chat → open thread ≥50 msgs → scroll while streaming measured once on release APK. 2. Artifact path recorded (JSON or markdown with device model, app version, metrics). 3. Bundle still under budget: `npm run analyze:bundle`. 4. Reassure/chat message display perf tests still pass if present. |
| **Verify** | `npm run analyze:bundle` · `npm run test:perf` · artifact exists |

#### G-14 · Accessibility gate on primary chat loop
| | |
|--|--|
| **Problem** | ~213 pressables vs ~90 a11y annotations; VoiceOver/TalkBack not first-class. |
| **Evidence** | ripgrep counts 2026-07-13 on `src/components` + `src/screens`. |
| **Target** | Every interactive control on Chat / Connect Mac / Leash approve-deny has `accessibilityRole` + `accessibilityLabel` (and state where toggled). |
| **Effort / Risk** | M / Low |
| **Files** | ChatInputBar, ChatScreenHeader, RunProgressBanner, ConnectMacGate, Gate/Hermes approval cards, RecentChatsList, composer errors |
| **AC** | 1. Checklist unit test: critical `testID`s map to non-empty `accessibilityLabel` (RTL). 2. Maestro: assert accessibility text for Send / Stop / Attach where supported. 3. No unlabeled icon-only buttons on Chat composer. 4. DynamicType/large text: composer + header do not clip critical actions (screenshot or Maestro). |
| **Verify** | New `src/__tests__/chatAccessibility.test.tsx` · continuous E2E |

#### G-15 · Notification + silent status contract (in flight)
| | |
|--|--|
| **Problem** | Run status heads-up noise; branch `fix/silent-run-status-notifications` addresses LOW channel + interval. |
| **Evidence** | `hermesNotifications.ts` CHANNEL_STATUS_V2, `RUN_STATUS_MIN_INTERVAL_MS`; commit `43ae0b33`. |
| **Target** | Merge with unit + policy tests; never DEFAULT/HIGH for live status. |
| **Effort / Risk** | S / Low (if already done) |
| **AC** | 1. Unit: `androidStatusChannelImportance` is LOW/MIN. 2. Status updates rate-limited. 3. Approval notifications still HIGH-capable. 4. No regression in `smartNotificationPolicy` tests. |
| **Verify** | `npm test -- --testPathPattern='hermesNotifications\|smartNotification\|notificationPreferences'` |

---

### P2 — Modern storage, media, dependency hygiene

#### G-20 · MMKV (or expo-sqlite) for hot non-secret storage
| | |
|--|--|
| **Problem** | AsyncStorage for settings, sessions, prompts — fine at small scale, slow under concurrent chat+heal. |
| **Evidence** | `src/services/storage.ts` fully AsyncStorage; secrets correctly on SecureStore. |
| **Target** | Storage facade: SecureStore secrets unchanged; hot keys on MMKV with migration. |
| **Effort / Risk** | M / Med (migration bugs) |
| **AC** | 1. Facade with interface; unit tests mock backend. 2. One-time migrate AsyncStorage → MMKV on boot. 3. Settings + last session + dismissed ids survive upgrade. 4. No secrets in MMKV. 5. Jest green without native MMKV by mock. |
| **Verify** | `npm test -- --testPathPattern=storage` · device cold start retains profiles |

#### G-21 · `expo-image` for any remote/local image surfaces
| | |
|--|--|
| **Problem** | Missing modern image pipeline (cache, blurhash, memory). |
| **Evidence** | `expo-image` not in package.json; only `expo-image-picker`. |
| **Target** | Use `expo-image` for attachments/thumbnails if/when shown in bubbles; skip if no image UI. |
| **Effort / Risk** | S / Low |
| **AC** | 1. If attachment previews exist, they use `expo-image`. 2. Expo SDK pin via `npx expo install expo-image`. 3. No duplicate full-size decode in list cells. |
| **Verify** | expo-doctor · list scroll with attachments |

#### G-22 · Remove stale Proguard keep rules for unused native deps
| | |
|--|--|
| **Problem** | Proguard keeps reanimated/gesture-handler while packages are not direct deps — noise and false confidence. |
| **Evidence** | `app.json` extraProguardRules mention reanimated/gesturehandler; `package.json` lacks both. |
| **Target** | Either add real deps if needed or delete dead keep rules. |
| **Effort / Risk** | S / Low |
| **AC** | 1. Proguard rules match actual native modules. 2. Release APK still runs pair + chat. |
| **Verify** | Release install · `npm run verify:apk` if applicable |

#### G-23 · Expand selector adoption before full context split
| | |
|--|--|
| **Problem** | Selectors exist; ChatScreen still bulk-subscribes. |
| **Evidence** | `useGateway(` count in ChatScreen: 8 |
| **Target** | Intermediate win: ChatScreen uses only connection + runProgress + approvals slices. |
| **Effort / Risk** | M / Med |
| **AC** | 1. ChatScreen does not call bare `useGateway()`. 2. Render counters in tests or Reassure show fewer parent re-renders on health tick (optional but preferred). 3. Full Jest green. |
| **Verify** | `rg "useGateway\\(" src/screens/ChatScreen.tsx` → 0 |

---

### P3 — Optional platform alignment (do not prioritize over P0/P1)

#### G-30 · expo-router migration
| | |
|--|--|
| **Problem** | Expo default is file-based routing; app uses React Navigation 6 tabs manually. |
| **When** | Only if deep-link matrix grows (many routes) or Nav 6 becomes unmaintained. |
| **AC** | All `hermes://` routes preserved; Maestro navigation flows green; no dual navigation trees mid-migration. |
| **Effort** | XL — **defer** |

#### G-31 · React Navigation 7 bump without expo-router
| | |
|--|--|
| **When** | If staying on RN nav; follow Expo SDK compatible set only (`npx expo install`). |
| **AC** | expo-doctor clean; tab persistence; deep links. |

#### G-32 · TanStack Query for session/message server state
| | |
|--|--|
| **When** | After G-12 send controller extract — not before. |
| **AC** | Cache invalidation on stream complete; offline stale-while-revalidate policy documented. |

#### G-33 · Design-system / motion (Reanimated)
| | |
|--|--|
| **When** | Product wants premium motion; not required for reliability. |
| **AC** | Reanimated only if used; New Arch compatible; no dead Proguard. |

---

## 3. Product gaps (not pure RN standards)

These are **similar-app** gaps, not Expo checklist items:

| ID | Gap | AC (product) |
|----|-----|----------------|
| P-01 | Hosted / always-on relay SLA for strangers | Document uptime owner; stranger pair works off-Igor-laptop for 24h smoke |
| P-02 | Cellular one-tap Tailscale/tunnel | Saved Mac works on cellular without pasting URL when tailnet probe succeeds |
| P-03 | IAP sandbox proof on physical device | Play license tester purchase → Leash unlock → thumbs capture once |
| P-04 | Free-tier value clarity | First launch explains Chat free / Leash Pro without jargon |
| P-05 | Remote push for approvals when app killed | Optional: Expo push + gateway webhook — only if product prioritizes “Telegram replacement” while killed |

---

## 4. Suggested sequencing (12-week shape)

```text
Week 0–1   G-01 E2E truth · G-05 ship-theater gate · G-15 notifications merge
Week 1–2   G-02 cleartext scope · G-14 a11y chat loop · G-23 selector adoption
Week 2–5   G-10 ChatScreen extract phase 1–2 (behavior-neutral)
Week 4–7   G-12 send controller · G-11 context split (after or interleaved carefully)
Week 3–6   G-03 stranger day-1 Maestro · P-02/P-03 product
Week 6–8   G-13 perf artifacts · G-20 MMKV · G-21 expo-image if needed
Week 8–12  G-04 iOS public · P-01 relay SLA · only then G-30/G-32 if still wanted
```

**Hard constraint:** Never open G-10 and G-11 on the same agent week with two owners.

---

## 5. Verification ladder (every gap PR)

| Layer | Command / artifact |
|-------|-------------------|
| Unit | `npm test -- --no-coverage --watchman=false` |
| Release safety | `npm run test:release-safety` |
| Types | `npm run typecheck` |
| Doctor | `npm run doctor:expo` |
| Release config | `npm run release:check` |
| Continuous E2E | `latest.json` e2e=pass **or** explicit UNVERIFIED |
| Full suite (optional) | `npm run e2e:simulator` / device full-suite when runtimes exist |
| Perf (when G-13) | `docs/proofs/perf/*` + `npm run analyze:bundle` |

---

## 6. Explicit non-goals (avoid scope thrash)

- Do **not** rewrite UI in a new design system while extracting ChatScreen.
- Do **not** migrate to expo-router mid-send-bugfix.
- Do **not** enable more cleartext domains to “make tests pass.”
- Do **not** claim best-in-class until G-01 + G-03 + G-13 + G-14 have green evidence.
- Do **not** touch Expo SDK pins outside deliberate SDK upgrade (`npx expo install --fix`).

---

## 7. Definition of “July 2026 best for Hermes”

Hermes is not ChatGPT. The right bar is **best local-agent phone companion**:

1. **Stranger** installs from store, pairs Mac in minutes, sends first message.  
2. **Cellular** works via Tailscale/relay without USB.  
3. **Leash** approvals are glanceable and quiet when not actionable.  
4. **Architecture** allows two agents to ship without colliding on 6k-line files.  
5. **Proof** is continuous E2E + unit + occasional perf artifact — not vibes.

When G-01…G-05, G-10…G-14, and P-02/P-03 are done, re-score this doc. Target: platform 9/10, product 8/10, architecture 7.5/10.

---

## 8. Audit evidence appendix (2026-07-13)

```text
expo 55.0.27 · react-native 0.83.6 · react 19.2.0
newArchEnabled=true · hermesEnabled=true · edgeToEdgeEnabled=true
reactCompiler experiment + babel-plugin-react-compiler target 19
@shopify/flash-list 2.0.2 · @react-navigation/native 6.1.18
expo-doctor: 19/19 passed
release:check: ok
ChatScreen.tsx 6625 · GatewayContext.tsx 2905 · SettingsScreen 1436
ChatScreen hooks: useState 60 · useCallback 59 · useMemo 47 · useEffect 46
GatewayContextValue public fields: ~86
a11y prop lines ~90 · pressable/onPress lines ~213 · TSX with labels ~25/87
Missing deps: expo-router, react-native-mmkv, expo-image, reanimated, gesture-handler, tanstack-query
latest.json e2e=skipped (no USB Android)
```
