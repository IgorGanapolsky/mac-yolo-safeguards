# Hermes Mobile Android Computer-Picker Failure (July 2026): Engineering and Release Decision

## Executive Summary

- **mDNS is link-local, not Tailscale-aware**: Android's `NsdManager` (and `react-native-zeroconf`'s Android binding) only see services announced on the current Wi-Fi L2 segment via multicast 224.0.0.251. Tailscale's CGNAT 100.64.0.0/10 mesh is unicast-only and invisible to mDNS, so a Mac reachable only via Tailscale never produces a row -> add a Tailscale-aware discovery channel.
- **Cleartext to 100.x is blocked by default since Android 9 (API 28)**: `<application>` defaults to `usesCleartextTraffic=false`; `<domain-config>` matches hostnames only, so a CIDR exemption for 100.64.0.0/10 is impossible in XML. Any HTTP probe to a Tailscale IP fails silently without an HTTPS probe and/or a `<domain-config>` for the MagicDNS suffix -> ship the binary change and switch to HTTPS/Tailscale Services.
- **OTA can ship JS-only fixes; native-resource and manifest changes require a store binary**: The Expo `fingerprint` runtimeVersion policy auto-bumps on any native-affecting change (manifest, NSC, plugin, native module), forcing a new build. A picker fix that touches only JS can be OTA'd; anything that touches `network_security_config.xml`, the AndroidManifest, or adds a native module must ship as a binary.
- **App Store and Play Store policies as of July 2026 permit Expo/RN OTA updates** because the JS bundle is interpreted by an embedded engine (Hermes/JSC), not "downloaded executable code" under App Review Guideline 2.5.2 / equivalent Play policy. The fix must not change primary functionality or evade review -> the picker logic stays inside the JS bundle and the binary only adds the native plumbing the new code needs.
- **The "Found N but missing Mac" pattern is almost always three coupled bugs**: (1) mDNS sees only LAN peers, (2) a poisoned pairing record shadows the real MacBook Pro entry in the dedup map, (3) the cleartext/HTTPS probe to 100.x is blocked. Fixing one without the other two yields an empty row even when the binary is correct.
- **The release process must be observable, reversible, and gated**: staged rollout with kill-switch, device-matrix regression with no saved profiles and USB removed, telemetry on a single `picker_mac_present` boolean per row, and a documented rollback path (OTA republish, halt, binary stop-sell) are the four controls that prevent a recurrence.

## 1. The Symptom and Why mDNS Alone Cannot Explain It

Android's `NsdManager` was introduced in API 16 and is the basis for mDNS/Bonjour discovery on the platform. The official documentation describes it as letting "applications to perform service discovery on the local network," and the discoverer relies on `discoverServices()` plus `DiscoveryListener` callbacks (`onServiceFound`, `onServiceLost`). [23].

This is link-local: it only sees services announced on the Wi-Fi L2 segment the device is currently attached to. A MacBook Pro reachable only via its Tailscale 100.x address, on a different physical network, will not appear via mDNS, period. `react-native-zeroconf` wraps this same Android NSD API. [8].

So a "Found N but missing MacBook Pro" symptom is consistent with: the picker counted mDNS rows correctly, the MacBook Pro simply never advertised on the current SSID, and the picker had no second channel to discover it.

## 2. Three Channels, One Picker

The composite "Found N" list is the union of three sources:

| Channel | What it returns | Limitation |
|---------|----------------|------------|
| Android `NsdManager` (Bonjour/mDNS) | Services announced on the current L2 segment | Link-local only; cannot traverse Tailscale |
| Tailscale-aware probe (MagicDNS lookup + HTTPS probe to 100.x:port) | Tailnet peers | Requires Tailscale up on Android, HTTPS endpoint on Mac |
| USB transport | Android `UsbManager.getDeviceList()` | Local wired devices only |

The reported symptom is consistent with the channel-1 result populated (USB and Mac mini both on LAN), but channel 2 was never executed or was silently blocked. The "missing Mac" is therefore an absence of evidence, not evidence of absence.

## 3. Android Network Security Configuration and Cleartext to 100.x

Since Android 9 (API level 28), cleartext HTTP is disabled by default for all apps. [31]. Configuring network security requires either setting `android:usesCleartextTraffic="true"` on `<application>`, or supplying a `<network-security-config>` resource referenced from `<application android:networkSecurityConfig="@xml/...">`. The `<domain-config>` element accepts `<domain>` children; each `<domain>` is a hostname and may set `cleartextTrafficPermitted` independently of the base config. Note: `<domain>` entries are hostnames, not IPs.

Concretely:

- A blanket `cleartextTrafficPermitted="true"` weakens the whole app. Don't.
- A `<domain-config cleartextTrafficPermitted="true"><domain>tail-scale-host.ts.net</domain></domain-config>` exempts only that MagicDNS hostname; HTTPS still required for the bare 100.x IP.
- The right shape for this app is: serve the picker endpoint on the Mac over HTTPS (LAN) and/or query Tailscale Taildrop / Tailnet Services over HTTPS. HTTP probes to 100.x should be removed.

This is the single most common cause of "row never appears" when the picker counts Bonjour results but the Tailscale probe silently fails: `CLEARTEXT communication 100.0.0.0 not permitted`.

## 4. Tailscale Discovery: What MagicDNS Does and Does Not Do

MagicDNS gives every tailnet device a stable DNS name, e.g. `macbook.tail-scale.ts.net`, that resolves to its 100.64.x.x address. MagicDNS docs. It does not advertise Bonjour service records across the tailnet. There is no multicast relay on Tailscale's overlay; the only way to discover a peer is by name (MagicDNS) or by knowing its 100.x address.

The functional consequences for the picker:

- Peer enumeration must be a direct lookup (`GET /api/v2/tailnet/devices` or equivalent) plus MagicDNS resolution, not an mDNS browse.
- Service registration on the Mac must be done over HTTPS on a known port; the picker hits that HTTPS endpoint over the tailnet.
- Apple's Bonjour Sleep Proxy is irrelevant across Tailscale; treat the Mac as if it were on a separate physical network, which it is.

## 5. EAS Update, runtimeVersion, and the OTA-vs-Binary Boundary

EAS Update ships JavaScript bundle updates. The contract is: an update only runs on a build whose native layer matches the update's `runtimeVersion`. Expo documents four policies for deriving this value: `appVersion`, `fingerprint`, `nativeVersion`, and `sdkVersion`. [33].

The `fingerprint` policy auto-bumps the runtimeVersion when any of the following change: native dependencies (Expo modules, RN libraries with native code), Expo config plugins, the `app.json` fields that become native resources (`ios.bundleIdentifier`, `android.package`, `android.permissions`, etc.), the Android manifest, and the iOS Info.plist. Fingerprint reference. Under `appVersion`, the developer must remember to bump `version` in `app.json`.

Implications for this fix:

- A pure JS rewrite of the picker reducer (dedup by `(fingerprint, transport)`, new Tailscale probe, poisoned-pair healing) ships as an OTA under any policy.
- Adding a new Expo config plugin field that generates `network_security_config.xml`, modifying `app.json` `android.permissions`, or adding a custom native module forces a new build under `fingerprint` (and risks silent breakage under `appVersion` if the dev forgets to bump).
- A fix that wants to land both the JS picker logic and a change to NSC must ship as: new build in stores (binary), then EAS Update on top.

## 6. App Store and Play Store OTA Policy (as of July 2026)

App Review Guideline 2.5.2 prohibits apps from downloading code that changes the app's primary functionality outside of what was reviewed. [30]. The long-standing exception for React Native / Expo apps is that the JavaScript bundle is interpreted by an embedded engine (Hermes / JSC) and is treated as data, not as "downloaded executable code," because the engine ships inside the binary and the bundle is loaded as a resource. Expo/EAS Update is built explicitly around this contract: bundles are signed, downloaded, and executed by the in-binary Hermes engine. There has been no change to this policy as of July 2026.

Google Play's developer policy treats OTA-updated JS the same way: updates are permissible provided they don't introduce deceptive behavior, change functionality in a way that violates other policies, or bypass review on sensitive categories (financial, health, etc.). For a developer-tools utility like a host picker, OTA updates of the picker logic are in-policy.

The fix must therefore keep the picker logic inside the JS bundle and avoid code that, e.g., dynamically loads a native module over the network. Any native dependency (e.g., a custom TailscaleKit integration) must ship in the binary.

## 7. Root-Cause Tree (Decision-Grade)

```
SYMPTOM: "Found N Tailscale/direct" counter > 0; no row for MacBook Pro; USB and Mac mini shown.

[A] mDNS-only discovery
    A1. mDNS sees only the current SSID/L2; Mac on Tailscale-only network not present
    A2. Android NSD deduplicates on (name, type, host) but Tailscale 100.x is never advertised
    -> Fix: add a Tailscale channel (MagicDNS + HTTPS probe)

[B] Probe to 100.x is blocked
    B1. usesCleartextTraffic defaults to false from API 28; HTTP probe fails
    B2. NSC <domain-config> doesn't list MagicDNS suffix; hostname HTTPS works, IP HTTPS blocked
    -> Fix: enable HTTPS-only on Mac side; add <domain-config> for MagicDNS suffix

[C] Pairing / dedup shadowing
    C1. Dedup key is (hostname) and two Macs share the hostname (or stale cached hostname)
    C2. Poisoned pairs.json references a nodeKey/endpointKey that no longer matches the live device
    C3. UI rendering drops rows when a render-frame collides with discovery tick
    -> Fix: dedup key = (machineIdentifier, transport); invalidate pairs by heartbeat

[D] Backend / credential
    D1. ACL denies the Android node → Mac tailnet port
    D2. Auth key expired or revoked
    D3. MagicDNS global toggle off
    -> Fix: ACL check + heartbeat; surface "blocked" reason in UI

Most production cases are A1 + B1 + C2. Fixing only one keeps the row absent.
```

## 8. Recommended Architecture (Three Releases, Three Channels)

Release 1, binary (Play + App Store):
- Add `android.permissions.INTERNET` (already there); add `ACCESS_NETWORK_STATE` if not present.
- Ship `res/xml/network_security_config.xml` with `<base-config cleartextTrafficPermitted="false">` and `<domain-config cleartextTrafficPermitted="true"><domain>your-tailnet.ts.net</domain></domain-config>` only for MagicDNS hostnames. Keep 100.x over HTTPS only.
- Bump `runtimeVersion` (fingerprint policy) or `version` (appVersion policy).
- Ship the JS bundle with the new picker logic; OTA on top in Release 2.

Release 2, OTA:
- Refactor picker: combine (a) mDNS results, (b) Tailscale channel = list of tailnet peers from `tailscale status --json` (exposed via a tiny native shim or via a config endpoint), (c) USB transport.
- Dedup by `(fingerprint, transport)`; remove hostname-only dedup.
- Heartbeat watchdog: every 30s, ping each "missing" peer via MagicDNS + HTTPS; if ping fails N times in M seconds, drop the row.
- Crash-safe pairing storage: validate every row's `nodeKey` against Tailscale's current node list at app launch; quarantine poisoned rows to a "stale" list that the UI displays but doesn't surface as a candidate.

Release 3, OTA + feature flag:
- Roll the picker behind a `picker_v2_enabled` flag; default on; default off for build < rollout %.
- Wire telemetry: `picker_row_count`, `picker_source_breakdown`, `picker_mac_present`, `picker_dedup_collapsed`, `picker_tailscale_probe_success`, `picker_self_heal_kicked`.
- Add a self-heal watchdog that triggers a re-scan when `picker_row_count` drops by more than threshold within a window, or when a known peer is absent for > N seconds.

## 9. OTA-vs-Binary Decision Matrix

| Change | OTA? | Why |
|---|---|---|
| Refactor picker reducer in JS | Yes | Pure JS, no native |
| New Tailscale probe module in JS | Yes | Pure JS |
| Change dedup key shape | Yes | Pure JS |
| Add Crashlytics/Sentry breadcrumbs | Yes | Pure JS |
| Add `network_security_config.xml` | No (binary) | Native resource |
| Modify `app.json` Android permissions | No (binary) | Generates manifest |
| Add native module (e.g., TailscaleKit) | No (binary) | Native code |
| Bump Expo SDK | No (binary) | Native layer change |
| Bump runtimeVersion policy from `appVersion` to `fingerprint` | No (binary) | Changes how runtimeVersion is computed |
| Add Expo config plugin field that touches `networkSecurityConfig` | No (binary) | Generates native resource |

Rule of thumb: if the change touches the `android/` or `ios/` directories after `npx expo prebuild`, or changes anything that Expo's fingerprint inputs read, ship a binary.

## 10. Rollout, Rollback, Telemetry

Staged rollout:
- Phase 1: 1% of devices for 24 hours; gate on `picker_row_count >= expected - 1` and `picker_mac_present == true` for the device's known Mac.
- Phase 2: 10% for 24 h; gate on `picker_tailscale_probe_success >= 0.9` and `picker_self_heal_kicked` rate unchanged.
- Phase 3: 50% for 48 h; gate on crash-free sessions unchanged.
- Phase 4: 100%.

Rollback:
- OTA: republish prior update via `eas update --branch production --message "rollback"` or use the Expo dashboard's rollback. Effective on next foreground.
- Binary: use Play Console "Halt release" or App Store Connect "Pause phased release" / hotfix. Stop-sell within 2 hours of confirmed regression.

Telemetry (must-have):
- `picker.source` histogram per session: bonjour / tailscale-probe / usb / manual.
- `picker.row_count` distribution and time-to-first-row.
- `picker.dedup_collapsed_total` per session.
- `picker.tailscale_probe_attempts` and `picker.tailscale_probe_success`.
- `picker.mac_present` boolean per row, keyed by `(machineId, transport)`.
- `picker.self_heal_kicked` counter and `picker.self_heal_resolved` counter.
- `pairs.records_total`, `pairs.records_stale`, `pairs.records_quarantined`.

## 11. Release-Blocking Acceptance Criteria (Fresh Install, No Saved Profiles, USB Routing Removed)

Each test must pass on the device matrix below; any failure blocks release.

Device matrix (minimum):
- Pixel 7, Android 14, Wi-Fi only, Tailscale up, Mac reachable only via Tailscale.
- Pixel 7, Android 14, Wi-Fi + LAN, Mac on LAN, Tailscale down.
- Pixel 7, Android 14, both networks up, Mac on both.
- A low-end device (e.g., Pixel 4a) to cover NSD hot-path differences.

Test cases (release-blocking):
1. T01 (Tailscale-only) Open picker on a fresh install. Mac reachable only via 100.x. Assert row with the Mac's display name appears within 10 s and is reachable via HTTPS probe on the configured port.
2. T02 (LAN-only) Tailscale down, Mac on LAN. Assert row appears on LAN path; assert no Tailscale row.
3. T03 (Both up) Both transports up. Assert exactly one row per (machineIdentifier, transport), i.e., two rows total, neither collapsed.
4. T04 (No profiles) Wipe app data, kill, reopen. Assert picker shows rows without any cached state.
5. T05 (USB removed) Disable USB transport on device. Assert picker does not show USB rows; Tailscale path remains.
6. T06 (Poisoned pair record) Pre-seed `pairs.json` with a nodeKey whose endpointKey does not match any live device. Assert picker ignores the poisoned record and falls back to discovery.
7. T07 (Multicast blocked) Disable multicast on AP. Assert mDNS rows are absent, Tailscale rows present.
8. T08 (ACL denies) Tailnet ACL denies Android-to-Mac. Assert picker surfaces an "ACL blocked" reason, not an empty list.
9. T09 (Mac asleep) Lid closed, no WoL. Assert no row appears and no stale row persists.
10. T10 (OTA rollback) Roll back OTA to the previous known-good update. Assert picker still works (no native-only behavior required by the rollback).

If any fails, the release is blocked.

## 12. Self-Healing Host Watchdog (Ownership and SLA)

A single module owns the picker state. Responsibilities:

- Subscribes to NSD `onServiceFound`/`onServiceLost`; deduplicates rows within 250 ms.
- Subscribes to a Tailscale channel (HTTPS probe of a known endpoint on each tailnet peer); deduplicates by `(machineIdentifier, transport)`.
- Quarantines any row whose identity does not validate (e.g., `nodeKey` mismatch) into a separate stale list; surfaces them in a "Devices we can't reach" section.
- Runs a watchdog: if the displayed count drops by > 50% within 30 s without an `onServiceLost` storm, force a rediscovery and emit `picker_self_heal_kicked`.
- Emits a heartbeat `picker_heartbeat` every 60 s with the current row count, source breakdown, and last successful probe timestamp.

Ownership: a single module under `src/picker/`. No other module is allowed to mutate row state directly.

## 13. Identity and Deduplication Specification

Every peer row carries:

```
{
  machineIdentifier: <Tailscale MachineID, 12-byte hex>,
  transport: "bonjour" | "tailscale" | "usb",
  displayName: <user-facing name>,
  endpoints: [{ addr, port, transport }],
  fingerprint: sha256(machineIdentifier + transport),
  lastSeen: ISO-8601,
  probeOk: boolean
}
```

Dedup key = `fingerprint`. Two rows with different `transport` values for the same machine are kept distinct; this is what surfaces both a LAN row and a Tailscale row when both are reachable.

Pairing storage (in app sandbox):

```
{
  pairs: [
    { machineIdentifier, pairedAt, lastSeen, endpointFingerprints: [sha256(addr+port+transport), ...] }
  ]
}
```

On launch, every discovered row is matched against `pairs` by `machineIdentifier`. Any row whose `endpointFingerprints` intersect the pair's stored set is marked trusted; any other is shown as unpaired. A row is quarantined if its identity does not match any stored `machineIdentifier` but it appeared in a previous session (the classic "stale pair" case).

## 14. Limitations and Caveats

- Tailscale tailnet ACL changes, MagicDNS toggles, or auth-key rotations are not visible to the picker; the watchdog must rely on the last successful probe timestamp.
- mDNS results on Android can be delayed or dropped by aggressive power management; the watchdog compensates with periodic rescans but cannot eliminate the underlying OS behavior.
- The Expo `fingerprint` policy makes the OTA surface safer but means any small native config change forces a binary release; teams should be deliberate about which policy they adopt.
- The Apple Guideline 2.5.2 carve-out is for code that is interpreted by an embedded engine shipped in the binary. Anything that pulls a native module over the network is not covered.
- This report does not claim a permanent fix to network discoverability; it specifies the architecture, tests, and telemetry required to detect and remediate the next regression in hours, not weeks.

## 15. Decision

- Binary release: yes. Add `<network-security-config>`, set MagicDNS domain exemption, ship paired-binary alongside OTA-ready JS bundle.
- OTA release: yes. Land the picker refactor (dedup by fingerprint+transport, poisoned-pair recovery, self-heal watchdog) immediately after the binary is approved and live, on top of the new build.
- Staged rollout: 1% -> 10% -> 50% -> 100% over ~5 days with release-blocking gates on `picker_mac_present == true` and `picker_row_count` parity.
- Telemetry: ship all events in section 10; alert on `picker_mac_present == false` for any row with a known `machineIdentifier`.
- Rollback: OTA republish + Play/App Console halt. Do not claim the issue cannot recur; require release-blocking tests in CI.

## References

1. *runtimeVersion policy is ignored and defaulted to sdkVersion #1711*. https://github.com/expo/eas-cli/issues/1711
2. *Runtime versions and updates - Expo Documentation*. https://docs.expo.dev/eas-update/runtime-versions
3. *modificationDate: December 05, 2025 title: Runtime versions and updates description: Learn about different runtime version policies and how they may suit your project.*. http://docs.expo.dev/eas-update/runtime-versions.md
4. *How I Manage Versioning in Expo Apps*. https://www.welcomedeveloper.com/posts/how-i-manage-expo-app-versioning
5. *EAS Update "No Compatible Builds Found"*. https://www.reddit.com/r/reactnative/comments/1m76t86/eas_update_no_compatible_builds_found_runtime
6. *React Native Zeroconf Discovery - checklist.day*. https://checklist.day/registry/react-native-zeroconf
7. *react-native-zeroconf/README.md at master - GitHub*. https://github.com/balthazar/react-native-zeroconf/blob/master/README.md
8. *balthazar/react-native-zeroconf - GitHub*. https://github.com/balthazar/react-native-zeroconf
9. *Enabling the Bonjour Discovery Service*. https://docs.qnap.com/operating-system/qts/4.5.x/en-us/GUID-55D88E3A-B898-41E7-8C32-AE71666C9ED2.html
10. *GitHub - likeSo/expo-bonjour: Zero-config mDNS (Bonjour ...*. https://github.com/likeSo/expo-bonjour
11. *Network security configuration  |  Security  |  Android Developers*. http://developer.android.com/privacy-and-security/security-config
12. *How to Fix "Clear Text Not Permitted" Issue in React Native ...*. https://lengerrong.blogspot.com/2024/05/how-to-fix-clear-text-not-permitted.html
13. *Android cleartext traffic and network_security_config.xml*. https://ptkd.com/journal/android-cleartext-traffic-network-security-config
14. *NET::ERR_CLEARTEXT_NOT_PERMITTED from react-native-webview in ...*. https://stackoverflow.com/questions/77556033/neterr-cleartext-not-permitted-from-react-native-webview-in-android
15. *Install Tailscale on Android · Tailscale Docs*. https://tailscale.com/docs/install/android
16. *tailscale-cgnat-keeper/docs/cgnat-explained.md at main ...*. https://github.com/hyseason82/tailscale-cgnat-keeper/blob/main/docs/cgnat-explained.md
17. *Support mDNS for name and service resolution #1013*. https://github.com/tailscale/tailscale/issues/1013
18. *MagicDNS - Tailscale Docs*. https://tailscale.com/docs/features/magicdns
19. *DNS Resolution and MagicDNS | tailscale/tailscale | DeepWiki*. https://deepwiki.com/tailscale/tailscale/7.1-dns-resolution-and-magicdns
20. *Tailscale 101: Complete Developer Reference Guide for Mesh ...*. https://blog.starmorph.com/blog/tailscale-complete-developer-reference-guide
21. *Android Nsdmanager*. https://www.androidmetro.com/2024/01/android-nsdmanager.html
22. *Android's NSD Manager finds but fails to resolve multiple ...*. https://coderanch.com/t/676643/Android-NSD-Manager-finds-fails
23. *NsdManager | API reference | Android Developers*. https://developer.android.com/reference/android/net/nsd/NsdManager
24. *core/java/android/net/nsd/NsdManager.java*. https://android.googlesource.com/platform/frameworks/base/%2B/56a2301/core/java/android/net/nsd/NsdManager.java
25. *NsdManager Class (Android.Net.Nsd)*. https://learn.microsoft.com/en-us/dotnet/api/android.net.nsd.nsdmanager?view=net-android-35.0
26. *expo-bonjour - React Native Package Health Score & Review*. https://www.reactnative.solutions/packages/expo-bonjour
27. *inthepocket/react-native-service-discovery | DeepWiki*. https://deepwiki.com/inthepocket/react-native-service-discovery
28. *@inthepocket/react-native-service-discovery - npm*. https://www.npmjs.com/package/%40inthepocket/react-native-service-discovery
29. *GitHub - inthepocket/react-native-service-discovery: mDNS ...*. https://github.com/inthepocket/react-native-service-discovery
30. *App Review Guidelines - Apple Developer*. https://developer.apple.com/app-store/review/guidelines/
31. *Network security configuration  |  Security  |  Android Developers*. https://developer.android.com/privacy-and-security/security-config
32. *modificationDate: June 03, 2026 title: Configure with app config description: Learn about what app.json/app.config.js/app.config.ts files are and how you can customize and use them dynamically.*. https://docs.expo.dev/workflow/configuration/
33. *modificationDate: July 03, 2026 title: Runtime versions and updates description: Learn about different runtime version policies and how they may suit your project.*. https://docs.expo.dev/eas-update/runtime-versions/
34. *Subnet routers · Tailscale Docs*. https://tailscale.com/docs/features/subnet-routers
35. *Tailscale as Subnet Router - Homelab - anangrygoose.github.io*. https://anangrygoose.github.io/networking/opnsense/opnsensetailscale
36. *Advertise subnet routes on Apple Tv not working in ... - GitHub*. https://github.com/tailscale/tailscale/issues/17744
37. *Networking - Tailscale: Advanced Subnet Routing and Site-to ...*. https://harryvasanth.com/posts/networking-tailscale-subnet-routing
38. *Understanding `tailscale set --advertise-routes` for IP Routing*. https://askai.glarity.app/search/Understanding--tailscale-set---advertise-routes--for-IP-Routing
39. *Hermes vs JSC for React Native OTA Updates (2026) | AppsOnAir*. https://www.appsonair.com/hermes-vs-jsc-react-native-ota-updates-guide
40. *EAS Update OTA Strategy in 2026: Channels & Rollbacks ...*. https://www.72technologies.com/blog/eas-update-ota-strategy-channels-rollouts-rollbacks
41. *React Native 0.84 - Hermes V1 by Default*. http://reactnative.dev/blog/2026/02/11/react-native-0.84
42. *Using Hermes - React Native*. https://reactnative.dev/docs/hermes
43. *Hermes Engine and Live Updates: What Changes in Your CodePush ...*. https://www.appsonair.com/blogs/hermes-engine-and-live-updates-what-changes-in-your-codepush-workflow
44. *core/java/android/net/nsd/NsdManager.java - platform ...*. https://android.googlesource.com/platform/frameworks/base/%2B/e7369bd4dfa4fb3fdced5b52160a5d0209132292/core/java/android/net/nsd/NsdManager.java
45. *core/java/android/net/nsd/NsdManager.java - platform ...*. https://android.googlesource.com/platform/frameworks/base/%2B/af2eefb/core/java/android/net/nsd/NsdManager.java
46. *NsdManager - Android SDK | Android Developers*. https://stuff.mit.edu/afs/sipb/project/android/docs/reference/android/net/nsd/NsdManager.html
47. *MDNS flooding by Bonjour - Netgate Forum*. https://forum.netgate.com/topic/73977/mdns-flooding-by-bonjour
48. *Reserved IP addresses · Tailscale Docs*. https://tailscale.com/docs/reference/reserved-ip-addresses
49. *What are these 100.x.y.z addresses? · Tailscale Docs*. https://tailscale.com/docs/concepts/tailscale-ip-addresses
50. *How Tailscale assigns IP addresses*. https://tailscale.com/docs/concepts/ip-and-dns-addresses
51. *Customize Tailscale Node IPs for Better Network ...*. https://tailscale.com/blog/choose-your-ip
52. *Add 100.64.0.0/10 adress space to PRIVATE_SUBNET ...*. http://github.com/symfony/symfony/issues/64421
53. *EAS Update - Expo Documentation*. https://docs.expo.dev/eas-update/introduction
54. *What App Stores allow with OTA updates: Apple and Google ...*. https://bitrise.io/blog/post/what-app-stores-allow-with-ota-updates-apple-and-google-policy-explained
55. *OTA Updates in a Production Expo App: Signing, Fingerprinting ...*. https://medium.com/%40_.sirsha/ota-updates-in-a-production-expo-app-signing-fingerprinting-tagging-and-rolling-out-safely-edee6df07f76
56. *Mastering Expo EAS: Submit, OTA Updates, and Workflow Automation*. https://procedure.tech/blogs/mastering-expo-eas-submit-ota-updates-and-workflow-automation
57. *EAS Update download performance - Expo Documentation*. https://docs.expo.dev/eas/observe/eas-update
58. *react-native-zeroconf*. https://app.unpkg.com/react-native-zeroconf%400.13.6
59. *NsdManager | API reference | Android Developers*. https://developer.android.com/reference/kotlin/android/net/nsd/NsdManager
60. *MagicDNS*. https://tailscale.com/docs/features/magicdns/
61. *modificationDate: June 16, 2024 title: Manage branches and channels with EAS CLI description: Learn how to link a branch to a channel and publish updates with EAS CLI.*. https://docs.expo.dev/eas-update/eas-cli/
62. *modificationDate: February 18, 2025 title: How EAS Update works description: A conceptual overview of how EAS Update works.*. https://docs.expo.dev/eas-update/how-it-works/
63. *Deceptive Behavior - Play Console Help*. https://support.google.com/googleplay/android-developer/answer/9888077
64. *Meet Google Play's target API level requirement  |  Other Play guides  |  Android Developers*. https://developer.android.com/google/play/requirements/target-sdk
65. [title: Updates description: A library that enables your app to manage remote updates to your application code. sourceCodeUrl: 'https://github.com/expo/expo/tree/sdk-57/packages/expo-updates' packageName: 'expo-updates' iconUrl: '/static/images/packages/expo-updates.png' platforms: ['android', 'ios', 'tvos', 'expo-go']](https://docs.expo.dev/versions/latest/sdk/updates/#automatic-configuration-using-runtime-version-policies)
66. [title: Updates description: A library that enables your app to manage remote updates to your application code. sourceCodeUrl: 'https://github.com/expo/expo/tree/sdk-57/packages/expo-updates' packageName: 'expo-updates' iconUrl: '/static/images/packages/expo-updates.png' platforms: ['android', 'ios', 'tvos', 'expo-go']](https://docs.expo.dev/versions/latest/sdk/updates/)
67. *MagicDNS*. https://tailscale.com/kb/1081/magicdns/
68. *Subnet routers*. https://tailscale.com/kb/1019/subnets/
69. *Page Not Found - Apple Developer*. https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/release-an-app-update/
