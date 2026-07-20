# Play Console zero actions — 2026-07-20

Target: paid package `com.iganapolsky.hermesmobile.paid` release `paid-15` showed **4 actions recommended**. Free package shares the same Expo config / plugins.

## Root causes → fixes

| Play recommendation | Root cause | Fix |
|---|---|---|
| Deprecated APIs for edge-to-edge | `styles.xml` set `android:statusBarColor` / `navigationBarColor`; RN `<StatusBar>` calls `Window.set/getStatusBarColor` | Plugin strips theme colors; remove RN `StatusBar` from `App.tsx`; `android.edgeToEdgeEnabled: true` |
| Screen support (orientation / resizability) | `orientation: "portrait"` → `MainActivity android:screenOrientation="portrait"`; ML Kit barcode activity PORTRAIT | `orientation: "default"`; plugin deletes MainActivity orientation + sets `resizeableActivity=true`; override ML Kit activity |
| Bitmap image optimization | Splash / notification PNGs in `res/drawable-*` | Plugin converts non-mipmap PNGs → WebP via `cwebp`; keep `enablePngCrunchInReleaseBuilds` |
| R8 optimization | Need minify + fullMode present in release AAB | Already `enableMinifyInReleaseBuilds` + shrink; plugin forces `android.enableR8.fullMode=true` in gradle.properties |

## Evidence gate

- Contract: `src/__tests__/playConsoleAndroidHardeningContract.test.ts`
- Ship: paid AAB `versionCode` **> 15**, then Console Production shows **0 actions recommended** (or honest remainder with file:line)

## Coord

Do not yank an in-review release. Upload a new production release that supersedes `paid-15`.
