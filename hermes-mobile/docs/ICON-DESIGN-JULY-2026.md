# Hermes Mobile — Icon Design Research (July 2026)

Research date: **2026-06-26**. Scope: launcher icon, Android adaptive layers, bottom-tab icons, Expo asset pipeline, operator/dev-tools branding.

---

## Executive summary

Hermes Mobile should read as a **premium operator console**, not generic AI clipart. Icons must survive **48×48 dp** (Android mdpi launcher) and **~25 pt tab bar** sizes with **high contrast on `#0B0F19`**. Use a **single cohesive mark** (Hermes **H** with cyan crossbar “core”) across launcher + Hermes tab; pair with **link+check** (Leash) and **gateway gear** (Settings). Keep all critical geometry inside Android’s **66 dp / 528 px safe zone**; never pre-round iOS corners.

---

## Platform requirements (sourced)

### iOS (Apple HIG + App Store)

| Requirement | Source |
|-------------|--------|
| App Store marketing icon **1024×1024 PNG**, square, **no transparency** | [Expo — Splash screen and app icon](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/) |
| System applies squircle mask at display time — **do not bake rounded corners** | [Expo docs](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/); [JAD Apps 2026 guidelines](https://jadapps.app/svg-tools/guides/mobile-app-icon-design-guidelines) |
| Tab bar: **filled vs outline** variants for selected/unselected; label always paired with icon | [Apple HIG — Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) |
| Prefer simple silhouettes; avoid fine detail that disappears at ~25 pt | Apple HIG (tab bars); [Icon Maker Studio — iOS vs Android](https://iconmaker.studio/blog/ios-vs-android-icon-guidelines) |

### Android (Material / adaptive icons)

| Requirement | Source |
|-------------|--------|
| Adaptive icon = **foreground + background** layers, **1024×1024** each | [Expo docs](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/) |
| Logo must fit **66×66 dp** visible mask (~**528×528 px** centered safe zone on 1024 canvas) | [Android Developers — Adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive) |
| Foreground PNG may use transparency; background via color or image | [Expo adaptiveIcon config](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/) |
| Android 13+ **themed icons**: optional **monochrome** layer for wallpaper tinting | [Expo docs](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/); [Expo SDK 54 asset templates](https://github.com/expo/expo/issues/39601) |
| Launcher baseline **48 dp** (mdpi 48 px) — design for smallest home-screen size first | [Teamz Lab — App icon sizes](https://tool.teamzlab.com/mobile/app-icon-sizes/) |

### Material 3 navigation bar (bottom tabs)

| Guideline | Source |
|-----------|--------|
| **3–5 destinations**; icon + short label | [Material 3 — Navigation bar](https://m3.material.io/components/navigation-bar/guidelines) |
| Active state: **filled / emphasized** icon; inactive: muted | Material 3 navigation bar |
| Touch targets ≥ **48 dp**; icon legibility over decoration | Material 3; Android adaptive icon 48 dp minimum |

---

## Design principles (2026 consensus)

From [JAD Apps mobile icon guide (2026)](https://jadapps.app/svg-tools/guides/mobile-app-icon-design-guidelines) and [Icon Maker Studio (2025)](https://iconmaker.studio/blog/ios-vs-android-icon-guidelines):

1. **Design for the smallest size first** (~48 px / 40 px). Gradients and hairlines turn to mud when scaled down.
2. **Figure/ground contrast ≥ ~3:1**. Hermes uses indigo `#6366F1` + cyan `#22D3EE` on `#0B0F19`.
3. **One dominant silhouette** per icon. Avoid literal robots, wings, or messenger clipart for an operator product.
4. **Square master art**; platforms mask dynamically.
5. **Vector source → raster export** at 1024; avoid upscaling blurry PNGs.

---

## Operator / dev-tools branding patterns

Reference apps in the SSH/agent/terminal space:

| Product | Branding pattern | Takeaway for Hermes |
|---------|------------------|---------------------|
| [Moshi](https://getmoshi.app/) (SSH/MOSH for agents) | Terminal-first chrome; cohesive theme including app icon | Operator tools use **terminal/console** metaphors, not mascots |
| Codex / Claude Code ecosystem | Minimal marks, dark UI, accent glow | **Glow “core”** on crossbar signals live gateway |
| SSH clients (Termius, Blink) | Key/terminal/plug silhouettes | Prefer **abstract H + link + gear** over literal keys |

**Hermes direction:** abstract **H** = Hermes gateway mark; **interlocking links + check** = Leash approvals; **6-tooth gateway gear** = Settings / gateway config. Shared **2 px stroke weight** at 22 pt tab size.

---

## Expo / React Native pipeline

### Config (`app.json`)

```json
{
  "icon": "./assets/icon.png",
  "android": {
    "adaptiveIcon": {
      "foregroundImage": "./assets/adaptive-icon.png",
      "backgroundColor": "#0B0F19"
    }
  }
}
```

Sources: [Expo docs](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/), [Expo icon guide (Mintlify)](https://expo-expo.mintlify.app/guides/app-icons).

### Source assets in this repo

| File | Role |
|------|------|
| `assets/source/icon-master.svg` | 1024 master with opaque `#0B0F19` background (iOS / legacy) |
| `assets/source/adaptive-foreground.svg` | Transparent foreground (Android adaptive) |
| `assets/source/adaptive-monochrome.svg` | Themed-icon layer (future `monochromeImage`) |
| `assets/source/hermes-h-mark.svg` | Shared H glyph for docs / reuse |

### Regenerate PNGs

```bash
cd hermes-mobile
bash scripts/generate-app-icons.sh
```

Uses `rsvg-convert` (preferred) or ImageMagick. Outputs:

- `assets/icon.png` (1024)
- `assets/adaptive-icon.png` (1024)
- `assets/favicon.png` (48)

### Native refresh

After changing launcher PNGs in a **prebuild/bare** tree:

```bash
npx expo prebuild --clean
# or EAS build — icons baked at native generation time
```

Tab bar icons are **React Native Views** in `TabBarIcon.tsx` (no `@expo/vector-icons` / Ionicons) to avoid release builds showing raw icon name strings.

---

## Hermes Mobile audit (before this refresh)

| Asset | Before |
|-------|--------|
| `assets/icon.png` | AI-generated glowing H on dark rounded square; readable but heavy glow; same file duplicated for adaptive/favicon (~819 KB each) |
| `assets/adaptive-icon.png` | Identical to `icon.png` (background baked into foreground — suboptimal for adaptive masking) |
| `assets/splash.png` | Dark splash, separate art (unchanged) |
| `TabBarIcon.tsx` | Custom Views: monitor+stand (Hermes), shield+check (Leash), 4-tooth gear (Settings) — **not aligned** with launcher H mark |
| Android `mipmap-*` | WebP launcher from prior prebuild (stale until rebuild) |
| iOS AppIcon | Not vendored in repo (Expo/EAS generates from `icon`) |
| Maestro `testID`s | Tab labels `Hermes`, `Leash`, `Settings` via `tabLabelFor()` — **unchanged** |

---

## Implementation checklist

- [x] SVG masters with 66% safe-zone H mark
- [x] `scripts/generate-app-icons.sh` pipeline
- [x] Cohesive tab icons (H / link+check / gateway gear)
- [x] Dark-mode tab bar colors (`colors.secondary` / `colors.textMuted`)
- [ ] Optional: wire `android.adaptiveIcon.monochromeImage` when targeting Android 13 themed icons
- [ ] `npx expo prebuild` or release install to refresh on-device launcher icons

---

## References

1. [Expo — Splash screen and app icon](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/)
2. [Android Developers — Adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)
3. [Material 3 — Navigation bar](https://m3.material.io/components/navigation-bar/guidelines)
4. [Apple HIG — Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
5. [JAD Apps — Mobile app icon design guidelines (2026)](https://jadapps.app/svg-tools/guides/mobile-app-icon-design-guidelines)
6. [Icon Maker Studio — iOS vs Android (2025)](https://iconmaker.studio/blog/ios-vs-android-icon-guidelines)
7. [Teamz Lab — App icon sizes](https://tool.teamzlab.com/mobile/app-icon-sizes/)
8. [Expo SDK 54 layered icon assets](https://github.com/expo/expo/issues/39601)
9. [Moshi — SSH terminal for agents](https://getmoshi.app/) (operator UX reference)
