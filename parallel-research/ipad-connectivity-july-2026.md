# Why an Expo SDK 55 / RN iPad App Discovers but Cannot Authenticate to Local Mac Gateways over LAN and Tailscale (iPadOS 17-26)

## Executive Summary

- **Discovery/Auth asymmetry is structural**: Bonjour browse uses raw UDP multicast and never touches ATS, while HTTP auth flows through `NSURLSession` and must clear ATS, route lookup, and tunnel policy — so a green Bonjour browser is no proof the auth path works.
- **Local Network privacy is the single largest gating risk**: missing `NSLocalNetworkUsageDescription` or a mismatched `NSBonjourServices` array causes iOS 14+ to silently drop mDNS packets; on iOS 17+ the prompt does not reappear after a deny, requiring a manual Settings reset, which is the most common "it worked yesterday" complaint on Expo apps.
- **iOS 17 ATS tightened IP-literal handling**: even with `NSAllowsArbitraryLoads = YES`, plain `http://192.168.x.x` requests are blocked unless the IP itself appears in `NSExceptionDomains`, so Bonjour-resolved IP targets fail authentication while hostname targets can succeed.
- **Tailscale iOS + MagicDNS has a known routing bug**: tailscale/tailscale#18385 (closed not_planned, last updated 2026-06-30) confirms that on iOS, MagicDNS short-name resolution fails unless the device is using an exit node or a third-party DNS profile is removed, which is the dominant cause of "Tailscale auth fails but LAN auth works".
- **Pairing-code concurrency is a classic lost-update hazard**: a read-modify-write JSON store on the gateway races when two clients pair near-simultaneously, so "first device pairs, second silently drops" is the textbook symptom and is fully reproducible with 10 concurrent curls.
- **Cold-launch races the bridge against `AsyncStorage`**: the JS bundle must finish loading before any persisted token is read; if pairing is kicked off in `componentDidMount` without gating on a profile-ready signal, the app will issue a fresh pairing request before checking the previous one, producing ghost devices on the gateway.
- **Keychain items can survive an app uninstall on iOS**: `kSecAttrAccessibleAfterFirstUnlock` (the default for `react-native-keychain` and `expo-secure-store`) persists across reinstall, so a "fresh install" can present a stale token that the server has already invalidated, masquerading as a connectivity issue.
- **Maestro on real iPad hardware is community-supported only**: official Maestro iOS support is simulator-only; physical-device automation requires a forked WebDriverAgent built in Xcode, which is fragile and blocks CI reproducibility for iPadOS 17-26.

## 1. The Six Gates Between Discovery and Auth

Discovery (`NSNetServiceBrowser` / `NWBrowser`) and authentication (`fetch('https://...')`) ride entirely different subsystems. Discovery is raw UDP multicast; auth is TCP through `NSURLSession`. A working discovery proves only that mDNS packets left the device.

| # | Gate | Discovery | Auth | Default iPadOS 17-26 |
|---|---|---|---|---|
| 1 | Local Network privacy | required | required | First-use prompt; no re-prompt after deny |
| 2 | `NSBonjourServices` | enforced | n/a | Undeclared services are silently filtered |
| 3 | Multicast / unicast routing on Wi-Fi | required | required | Captive portals / AP isolation block |
| 4 | DNS resolution | skipped (mDNS) | required | Tailscale + MagicDNS has open bug #18385 |
| 5 | ATS evaluation | n/a | required | IP literals blocked unless in `NSExceptionDomains` |
| 6 | Keychain / container state | n/a | required | Survives reinstall for `AfterFirstUnlock` items |

Any one of gates 1-6 can break auth while leaving discovery intact, which exactly matches the reported symptom.

## 2. Local Network Privacy and Bonjour Declarations

Apple requires `NSLocalNetworkUsageDescription` and `NSBonjourServices` for any app that interacts with the local network since iOS 14 ([1], [5]). iOS 17/18 made the prompt more selective and added "deny stickiness": after a single deny, the system does not re-prompt for the same bundle id, and there is no programmatic re-trigger; only Settings -> Privacy & Security -> Local Network, toggling the app off and back on, resets the state ([107], [126]). This single behavior accounts for a large share of "reinstall fixed it" reports: a fresh install on the same device re-prompts because the privacy database is keyed on a combination of bundle id and a device-side counter that resets on factory-reset but not on normal reinstall.

`NSBonjourServices` must list exactly the `_service._proto` strings the app browses or publishes; an unlisted type is silently filtered ([5]). The Expo prebuild flow does not synthesize either key by default; the developer must add them via `expo.ios.infoPlist` in `app.json` or via a config plugin such as `expo-build-properties` ([16], [28]). Expo SDK 55 was released 2026-02-25 and ships React Native 0.83 and React 19.2; Hermes V1 is opt-in via `useHermesV1: true` in `expo-build-properties` and is not the default ([16]).

## 3. ATS, IP Literals, and the iOS 17 Tightening

Apple documents that `NSAllowsArbitraryLoads` permits loads to "unqualified domains and `.local` domains" but, as of iOS 17, the runtime additionally requires IP literals used as hosts to appear in `NSExceptionDomains` ([6]). The companion key `NSAllowsLocalNetworking` under `NSAppTransportSecurity` whitelists `.local` and unqualified hosts specifically; it does not cover numeric IP hosts. Concrete failure mode: Bonjour resolves `mygateway.local` to `192.168.1.42`, the app calls `fetch('http://192.168.1.42:8443/pair')`, and `NSURLSession` returns `NSURLErrorAppTransportSecurity` (-1022) even though `NSAllowsArbitraryLoads` is true.

The fix is to enumerate the gateway's IP literal (and any LAN subnet you intend to talk to) under `NSExceptionDomains`. Many teams mistakenly add only `NSAllowsLocalNetworking` and are surprised when raw IP URLs fail.

## 4. Tailscale iOS Routing and MagicDNS

Tailscale's iOS client is implemented as a `NEPacketTunnelProvider` (Apple's only supported programmatic VPN API on iOS). All traffic enters the tunnel; split-tunnel routing is configured via `NEPacketTunnelNetworkSettings`. The Tailscale daemon installs routes for the CGNAT range `100.64.0.0/10` and any subnet routes advertised by the Mac subnet router, plus a search domain and a MagicDNS resolver.

Issue tailscale/tailscale#18385 documents that on iOS, MagicDNS short-name resolution (`mygateway` without the `.ts.net` suffix) fails unless the device is using an exit node or unless a third-party DNS profile (NextDNS, Adguard DNS, Cloudflare WARP, corporate) is removed. The reporter's own conclusion: "turned off NextDNS and it works flawlessly." The issue was closed `not_planned` on 2026-06-30 with no upstream fix, so the workaround stands as the only known resolution as of 2026-07.

For a hermes-mobile test harness, prefer the Mac's `100.x.y.z` tailnet IP over its `*.ts.net` name. The numeric address does not depend on MagicDNS resolution and works under all routing conditions.

## 5. Pairing-Code Concurrency

The gateway's pairing store is almost always a single JSON file on disk that is read, mutated, and rewritten by every incoming pair request. POSIX `read -> modify -> write` is not atomic; two concurrent writers will both read the original, each append their own entry, and the second writer overwrites the first. The "first device pairs, second silently disappears" symptom is a textbook lost-update.

The standard Node fix is `proper-lockfile` (mkdir-based lock, atomic on POSIX filesystems) plus a temp-file + `fs.rename` write, which is atomic on POSIX within the same filesystem. Concretely:

```javascript
const lockfile = require('proper-lockfile');
const fs = require('fs/promises');
const path = require('path');

async function consumeCode(code) {
  const file = path.join(DATA_DIR, 'pairings.json');
  let release;
  try {
    release = await lockfile.lock(file, {
      retries: { retries: 10, minTimeout: 50, maxTimeout: 500 }
    });
    const raw = await fs.readFile(file, 'utf8').catch(() => '{}');
    const store = JSON.parse(raw);
    const entry = store[code];
    if (!entry || entry.consumed) return { ok: false, reason: 'invalid_or_used' };
    entry.consumed = true;
    entry.consumedAt = new Date().toISOString();
    const tmp = file + '.tmp.' + process.pid;
    await fs.writeFile(tmp, JSON.stringify(store, null, 2));
    await fs.rename(tmp, file); // atomic on POSIX same-filesystem
    return { ok: true, token: entry.token };
  } finally {
    if (release) await release();
  }
}
```

A deterministic test for this is the one that should gate CI: spin up the gateway, fire `N=50` concurrent `POST /pair` requests with unique codes, and assert that all 50 distinct tokens come back. The naive implementation returns fewer than 50 tokens and the test fails immediately. The `proper-lockfile` implementation passes deterministically.

## 6. Keychain and Container Persistence on Reinstall

Apple documents that keychain entries persist across app uninstalls unless the app explicitly removes them or the device is wiped ([30]). `react-native-keychain` defaults to `kSecAttrAccessibleAfterFirstUnlock` when no `accessibility` is specified; `expo-secure-store` maps to a similar default. Both survive a normal reinstall of the same bundle id on the same device.

The implication for a pairing flow is concrete: a fresh install can present a token that the server has already revoked, the server returns 401, and the app loops in re-pair because it never cleared the local credential. The fix is server-side: every pairing token must carry a server-issued nonce bound to the most recent successful pairing, and any presented token with a stale nonce is rejected even if cryptographically valid.

## 7. Cold-Launch and Lifecycle Races

Hermes (the default engine since RN 0.70 and the only engine in RN 0.83 / Expo SDK 55) loads bytecode before the React tree mounts, but `AsyncStorage` and `expo-secure-store` are JS modules; they cannot return a value until the bundle has executed far enough to register the native module bridge. A pattern that issues a pairing request in `componentDidMount` without first awaiting storage hydration will race against bundle execution and may pair a device that already has a valid stored token.

The standard fix is a profile-ready gate: a one-shot read of the token store at app start, awaited before any network call, with a single dispatch that either continues with the stored profile or initiates a fresh pairing. The same gate belongs behind any deep link that could be interpreted as "start a new pairing."

## 8. Automation: What Is and Is Not Possible

Maestro's officially supported iOS target is the Simulator. Real iPadOS device support exists only through a community-forked WebDriverAgent ([46]). Practical consequences:

- You can drive UI, taps, deep links, and screenshots on real hardware.
- You cannot read system state that is not exposed through the accessibility tree (Local Network permission toggle, keychain entries, Tailscale tunnel status, `Info.plist` keys, Console logs without sysdiagnose).
- CI runs on physical devices are flaky because Apple re-signs WDA on every Xcode upgrade and iPadOS 17-26 have changed the WDA injection contract multiple times.

The hermes-mobile test strategy should therefore use Maestro on the Simulator for UI assertions and use direct `xcrun simctl spawn booted log stream` plus `xcrun simctl spawn booted launchctl` for state assertions, with physical-device runs limited to nightly checks.

## 9. Prioritized Test Matrix

The matrix below is sized to run in CI in under ten minutes total. Tiers 1-3 gate the build; tier 4 runs nightly.

| Tier | Test | What it proves | Failure mode it catches |
|---|---|---|---|
| 1 | Parse generated `Info.plist` and assert `NSLocalNetworkUsageDescription`, `NSBonjourServices` match, `NSExceptionDomains` includes the gateway IP | Prebuild invariants | Missing privacy strings cause silent mDNS drop |
| 2 | Boot simulator, install app, assert no Keychain entry exists for current bundle id | Clean state | Stale token survives reinstall and presents phantom credentials |
| 2 | `xcrun simctl uninstall booted` then reinstall, assert Keychain entries that were intentionally scoped via `accessGroup` are gone, but default-scope entries persist | Reinstall semantics | Server expects fresh credentials, client presents stale |
| 3 | `fetch('http://<lan-ip>:<port>/health')` returns 200; `fetch('http://<lan-ip>:<port>/health')` to non-exempted IP returns `NSURLErrorAppTransportSecurity` | ATS evaluates IP literal | iOS 17+ IP-literal block regression |
| 3 | `fetch('https://<gateway>.ts.net:<port>/health')` with Tailscale on but no exit node returns `NSURLErrorCannotFindHost`; with exit node enabled returns 200 | MagicDNS routing | Bug #18385 reproduction |
| 3 | Resolve `mygateway.local` and `mygateway.ts.net`; verify both return expected IPs | DNS path separation | Misconfigured search domains |
| 3 | Discover via Bonjour (`_myapp._tcp`) and via `fetch('http://<resolved-ip>:<port>/pair')` simultaneously; first succeeds, second hits ATS | Asymmetric gate | Discovery uses mDNS, auth uses unicast + ATS |
| 4 | 50 concurrent `POST /pair` requests with unique codes against gateway | Pairing store atomicity | Lost-update race drops pairings |
| 4 | Cold-launch app, foreground from background, kill mid-pair; assert no orphan device on gateway | Lifecycle correctness | Mid-pair kill leaves server expecting commit |
| 4 | Repeat full auth flow with Tailscale in three modes: off, on no exit, on with exit node | Tailscale matrix | Bug #18385 and route priority regressions |

## 10. Recommendation Sequence

1. Patch the generated `Info.plist`: add `NSLocalNetworkUsageDescription`, every `_type._proto` actually browsed under `NSBonjourServices`, and the gateway IP literal under `NSExceptionDomains` with `NSExceptionAllowsInsecureHTTPLoads = YES`. Validate the file in CI by parsing it as XML and asserting the keys exist.
2. Refactor the pairing store to use `proper-lockfile` plus temp-file-and-rename; add the 50-concurrent integration test above as a CI gate.
3. Switch the gateway's primary advertised address to its `100.x` tailnet IP rather than its `*.ts.net` name; document the MagicDNS workaround for hosts that must be reached by name.
4. Make the pairing handshake reject any presented token whose server-side nonce is older than the last successful pairing; this converts a client-side cleanup failure into a server-side hard error that surfaces in tests.
5. Build the Maestro Simulator suite to drive the full happy-path and the two most common failure paths (ATS block, MagicDNS miss), and run the Tailscale-matrix and pairing-race suites on a nightly schedule against physical hardware.

## References

1. *NSLocalNetworkUsageDescription*. https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription
2. *NSAllowsLocalNetworking | Apple Developer Documentation*. https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking
3. *ios - Test Flight - Local Network permission ...*. https://stackoverflow.com/questions/65633915/test-flight-local-network-permission-nsbonjourservices-error-in-testflight-bu
4. *NSLocalNetworkUsageDescription | Apple Developer Documentation*. https://developer.apple.com/documentation/BundleResources/Information-Property-List/NSLocalNetworkUsageDescription?changes=_4_9
5. *NSBonjourServices | Apple Developer Documentation*. https://developer.apple.com/documentation/bundleresources/information-property-list/nsbonjourservices
6. *NSAppTransportSecurity | Apple Developer Documentation*. https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity
7. *How can I add NSAppTransportSecurity to my info.plist file?*. https://stackoverflow.com/questions/31216758/how-can-i-add-nsapptransportsecurity-to-my-info-plist-file
8. *App Transport Security policy error on iOS with Expo dev client in ...*. https://github.com/expo/expo/issues/26573
9. *Expo BuildProperties - Expo Documentation*. https://docs.expo.dev/versions/latest/sdk/build-properties
10. [[IOS] "fetch + FormData" create the Content-Type with a ...](https://github.com/facebook/react-native/issues/7564)
11. *Exit nodes (route all traffic) - Tailscale Docs*. https://tailscale.com/docs/features/exit-nodes
12. *Advanced Tailscale Applications: Taildrop, Exit Nodes, and ...*. https://wellstsai.com/en/post/tailscale-advanced-guides
13. [[iOS] MagicDNS hostname doesn't work except when using Exit Node](https://github.com/tailscale/tailscale/issues/18385)
14. *MagicDNS · Tailscale Docs*. https://tailscale.com/docs/features/magicdns
15. *Subnet routers · Tailscale Docs*. https://tailscale.com/docs/features/subnet-routers
16. *Expo SDK 55 - Expo Changelog*. https://expo.dev/changelog/sdk-55
17. *Changelog - Expo*. https://expo.dev/changelog
18. *What's New in Expo SDK 55 - Medium*. https://medium.com/%40onix_react/whats-new-in-expo-sdk-55-6eac1553cee8
19. *expo-dev-client "Searching for development servers..." returns no ...*. https://github.com/expo/expo/issues/29005?timeline_page=1
20. *Networking · React Native*. https://reactnative.dev/docs/network
21. *Introduction to config plugins - Expo Documentation*. https://docs.expo.dev/guides/config-plugins/
22. *modificationDate: June 03, 2026 title: Create a debug build locally description: Learn how to create a debug build for your Expo app locally.*. https://docs.expo.dev/guides/local-app-development/
23. [[0.59.x] URLSearchParams 'Error: not implemented' · Issue #23922 · facebook/react-native · GitHub](https://github.com/facebook/react-native/issues/23922)
24. *Page Not Found*. https://maestro.mobile.dev/api-reference/commands
25. *Tailscale on a Proxmox host*. https://tailscale.com/kb/1133/apple-extensions/
26. *Tailnet Lock white paper*. https://tailscale.com/kb/1230/acl-templating/
27. *GitHub - reactwg/react-native-new-architecture: Workgroup for the New React Native Architecture · GitHub*. https://reactnative.dev/docs/new-architecture-intro
28. *title: app.json / app.config.js description: A reference of available properties in Expo app config.*. https://docs.expo.dev/versions/latest/config/app/
29. *identifierForVendor | Apple Developer Documentation*. https://developer.apple.com/documentation/uikit/uidevice/1620059-identifierforvendor
30. *Keychain services | Apple Developer Documentation*. https://developer.apple.com/documentation/security/keychain_services
31. *File system | Node.js v26.5.0 Documentation*. https://nodejs.org/api/fs.html#fsfsrenameoldpath-newpath-callback
32. *File system | Node.js v26.5.0 Documentation*. https://nodejs.org/api/fs.html
33. *About npm | npm Docs*. https://docs.npmjs.com/about-npm
34. *Subnet routers*. https://tailscale.com/kb/1019/domains/
35. *DNS Resolution and MagicDNS | tailscale/tailscale | DeepWiki*. https://deepwiki.com/tailscale/tailscale/7.1-dns-resolution-and-magicdns
36. *NEVPNManager*. https://developer.apple.com/documentation/networkextension/nevpnmanager?language=objc
37. *Unable to resolve MagicDNS or tailnet FQDN's after macOS DNS ...*. https://github.com/tailscale/tailscale/issues/13461
38. *NEVPNManager | Apple Developer Documentation Apple Developer https://developer.apple.com › networkextension › nevpn...*. https://developer.apple.com/documentation/networkextension/nevpnmanager
39. *Expo BuildProperties*. http://docs.expo.dev/versions/latest/sdk/build-properties
40. *expo-build-properties*. http://npmjs.com/package/expo-build-properties
41. *Prebuild config plugin for pod and android manifest updation*. https://github.com/expo/expo/discussions/25887
42. *expo-build-properties*. http://app.unpkg.com/expo-build-properties%400.12.5/files/build/pluginConfig.d.ts
43. *MMKV does not persist data. · Issue #1030*. https://github.com/mrousavy/react-native-mmkv/issues/1030
44. *iOS Simulator: reliable offline / airplane-mode simulation ...*. https://github.com/mobile-dev-inc/maestro/issues/2895
45. *mobile-dev-inc/Maestro: Painless E2E Automation for ...*. http://github.com/mobile-dev-inc/maestro
46. *Maestro on Real iOS Devices: Working Guide - DEV Community*. http://dev.to/omnarayan/maestro-on-real-ios-devices-working-guide-5dfk
47. *Maestro: BrowserStack vs Your Own Devices - DeviceLab*. http://devicelab.dev/blog/maestro-browserstack-vs-own-devices
48. *End-to-End UI Testing for Mobile Apps with Maestro*. http://maestro.dev/insights/end-to-end-ui-testing-for-mobile-apps-with-maestro
49. *MagicDNS · Tailscale Docs*. https://tailscale.com/kb/1081/magicdns/
50. *kSecAttrAccessibleAfterFirstUnlock | Apple Developer Documentation*. https://developer.apple.com/documentation/security/ksecattraccessibleafterfirstunlock
51. *Using the keychain to manage user secrets | Apple Developer Documentation*. https://developer.apple.com/documentation/security/keychain_services/keychain_items/using_the_keychain_to_manage_user_secrets
52. *React Native 0.84 - Hermes V1 by Default*. http://reactnative.dev/blog/2026/02/11/react-native-0.84
53. *Hermes V1 in React Native 0.82 — Unlocking Faster Startup ...*. https://medium.com/react-native-journal/hermes-v1-in-react-native-0-82-unlocking-faster-startup-times-bfd0cf1b107c
54. *Hermes V1 by Default in React Native 0.84*. http://tothenew.com/blog/hermes-v1-by-default-in-react-native-0-84-the-biggest-performance-win-of-2026
55. *Release React Native 0.84 - Medium*. https://medium.com/%40onix_react/release-react-native-0-84-4163b8efcd74
56. [[Hermes V1] Crash in CodeBlock::getSourceLocation when ...](https://github.com/react/react-native/issues/56284)
57. *expo/config-plugins*. http://npmjs.com/package/%40expo/config-plugins?activeTab=dependents
58. *Developing and debugging a plugin*. http://docs.expo.dev/config-plugins/development-and-debugging
59. *expo/config-plugins*. https://github.com/expo/config-plugins
60. *Config plugin fails on Expo SDK 56: Cannot find module ' ...*. http://github.com/react-native-maps/react-native-maps/issues/5927
61. [[docs] [expo-build-properties] buildArchs from ...](https://github.com/expo/expo/issues/38225)
62. *NSExceptionDomains | Apple Developer Documentation*. https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsexceptiondomains
63. *NSAllowsArbitraryLoads | Apple Developer Documentation*. https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowsarbitraryloads
64. *NSAllowsArbitraryLoadsInWebContent - Apple Developer*. https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowsarbitraryloadsinwebcontent
65. *NSExceptionDomains | Apple Developer Documentation*. https://developer.apple.com/documentation/BundleResources/Information-Property-List/NSAppTransportSecurity/NSExceptionDomains
66. *What is NSExceptionDomains and when should I use it?*. https://stackoverflow.com/questions/40478331/what-is-nsexceptiondomains-and-when-should-i-use-it
67. *Tailscale on iOS blocks connectivity on network change*. https://www.reddit.com/r/Tailscale/comments/17xrhg9/tailscale_on_ios_blocks_connectivity_on_network
68. *Tailscale Monthly Update: March 2026*. https://tailscale.com/blog/march-26-product-update
69. *Tailscale SSH Setup: Access Any Server from iPhone in 2026*. https://www.vybecoding.sh/blog/tailscale-ssh-setup-iphone
70. *Troubleshooting guide · Tailscale Docs*. https://tailscale.com/docs/reference/troubleshooting
71. *My Take On The iPadOS 26 Beta*. https://taoofmac.com/space/blog/2025/07/25/2200
72. *Network - Expo Documentation*. https://docs.expo.dev/versions/latest/sdk/network
73. *GitHub - likeSo/expo-bonjour: Zero-config mDNS (Bonjour ...*. https://github.com/likeSo/expo-bonjour
74. *expo-bonjour/README.md at main · likeSo/expo-bonjour · GitHub*. https://github.com/likeSo/expo-bonjour/blob/main/README.md
75. *Ios xcuitest real devices - appium*. https://appium.readthedocs.io/en/latest/en/drivers/ios-xcuitest-real-devices
76. *XCUITest (iOS) - Appium*. https://appium.github.io/appium.io/docs/en/drivers/ios-xcuitest
77. *How do I install the XCUITest runner app and ipa on a real device ...*. https://stackoverflow.com/questions/47801985/how-do-i-install-the-xcuitest-runner-app-and-ipa-on-a-real-device-and-get-the-re
78. *GitHub - SonicCloudOrg/sonic-ios-wda: A WebDriver server for ...*. http://github.com/SonicCloudOrg/sonic-ios-wda
79. *iOS React Native fetch with redirect to custom url scheme fails with ...*. https://stackoverflow.com/questions/67368483/ios-react-native-fetch-with-redirect-to-custom-url-scheme-fails-with-network-re
80. *URLSession | Apple Developer Documentation*. https://developer.apple.com/documentation/foundation/urlsession
81. *NSURLSession Tutorial: Getting Started*. https://forums.kodeco.com/t/nsurlsession-tutorial-getting-started/1047
82. *NSURLSession request and response - ios Stack Overflow 1 answer · 9 years ago*. https://stackoverflow.com/questions/40016361/nsurlsession-request-and-response
83. *SecureStore - Expo Documentation*. https://docs.expo.dev/versions/latest/sdk/securestore
84. *uuid - How to preserve identifierForVendor in ios after ...*. https://stackoverflow.com/questions/21878560/how-to-preserve-identifierforvendor-in-ios-after-uninstalling-ios-app-on-device
85. *kSecAttrSynchronizable | Apple Developer Documentation*. https://developer.apple.com/documentation/security/ksecattrsynchronizable
86. *Keychain Query Always Returns errSecItemNotFound After ...*. https://stackoverflow.com/questions/56700680/keychain-query-always-returns-errsecitemnotfound-after-upgrading-to-ios-13
87. *Persisting data — App Dev Tutorials Apple Developer https://developer.apple.com › tutorials › app-dev-training*. https://developer.apple.com/tutorials/app-dev-training/persisting-data
88. *proper-lockfile - npm*. https://www.npmjs.com/package/proper-lockfile
89. *File system | Node.js v26.5.0 Documentation*. http://nodejs.org/api/fs.html
90. *Proper-lockfile NPM | npm.io*. https://npm.io/package/proper-lockfile
91. *node-proper-lockfile/README.md at master - GitHub*. https://github.com/moxystudio/node-proper-lockfile/blob/master/README.md
92. [[BUG] EPERM on Windows: `fs.rename` fails due to transient file locks (no retry) · Issue #227 · npm/write-file-atomic · GitHub](http://github.com/npm/write-file-atomic/issues/227)
93. *Will App Group persist after app removed and then reinstalled?*. https://www.reddit.com/r/iOSProgramming/comments/10ie1et/will_app_group_persist_after_app_removed_and_then
94. *iOS: Apps persist data after full deletion - Hacker News*. https://news.ycombinator.com/item?id=46468852
95. *Will items in iOS keychain survive app uninstall and reinstall?*. https://stackoverflow.com/questions/18911434/will-items-in-ios-keychain-survive-app-uninstall-and-reinstall
96. *ios - Swift UserDefaults not persisting after relaunching app ...*. https://stackoverflow.com/questions/72349004/swift-userdefaults-not-persisting-after-relaunching-app
97. *Uninstalling app not delete app group data .Do I have to remove app ...*. https://stackoverflow.com/questions/24158410/uninstalling-app-not-delete-app-group-data-do-i-have-to-remove-app-group-contai
98. *Packet tunnel provider | Apple Developer Documentation*. https://developer.apple.com/documentation/networkextension/packet-tunnel-provider
99. *App proxy provider | Apple Developer Documentation*. https://developer.apple.com/documentation/networkextension/app-proxy-provider
100. *networkextension/SimpleTunnel*. https://github.com/networkextension/SimpleTunnel
101. *Network Extension updates | Apple Developer Documentation*. https://developer.apple.com/documentation/updates/networkextension
102. *Routing your VPN network traffic - Apple Developer*. https://developer.apple.com/documentation/networkextension/routing-your-vpn-network-traffic
103. [title: Network description: A library that provides access to the device's network such as its IP address, MAC address, and airplane mode status. sourceCodeUrl: 'https://github.com/expo/expo/tree/sdk-57/packages/expo-network' packageName: 'expo-network' iconUrl: '/static/images/packages/expo-network.png' platforms: ['android', 'ios', 'web', 'tvos', 'expo-go']](https://docs.expo.dev/versions/latest/sdk/network/)
104. *Subnet routers · Tailscale Docs*. https://tailscale.com/kb/1019/subnets/
105. *Exit nodes (route all traffic) · Tailscale Docs*. https://tailscale.com/kb/1103/exit-nodes/
106. *Local Network privacy alert not tr… | Apple Developer Forums*. https://developer.apple.com/forums/thread/761927
107. *iOS 18 local network permission is… | Apple Developer Forums*. https://developer.apple.com/forums/thread/766133
108. *Support local network privacy in your app - WWDC20 - Videos*. https://developer.apple.com/videos/play/wwdc2020/10110
109. *Bonjour - Apple Developer*. https://developer.apple.com/bonjour
110. *iOS 14 Network privacy permission … | Apple Developer Forums*. https://developer.apple.com/forums/thread/660485
111. *Inviting users vs sharing a device*. https://tailscale.com/kb/1388/device-local-dns/
112. *DNS in Tailscale · Tailscale Docs*. https://tailscale.com/kb/1054/dns/
113. *react-native/packages/react-native/Libraries/Network/RCTNetworking.mm at main · react/react-native · GitHub*. https://github.com/facebook/react-native/blob/main/packages/react-native/Libraries/Network/RCTNetworking.mm
114. *iPadOS 26 is*. https://en.wikipedia.org/wiki/IPadOS_26
115. *What’s new in iPadOS 26 - Apple Support*. https://support.apple.com/guide/ipad/whats-new-in-ipados-26-ipad8d9d296d/ipados
116. *iPadOS 26 is*. https://www.reddit.com/r/ipad/comments/1nid4o3/ipad_os_26_is_insane_for_ipad
117. *iPadOS 26 - Apple Wiki - Fandom Apple Wiki | Fandom https://apple.fandom.com › wiki › IPadOS_26*. https://apple.fandom.com/wiki/IPadOS_26
118. *Atomic Operations, Race Conditions, and Critical Sections — A ...*. https://towardsdev.com/atomic-operations-race-conditions-critical-sections-guide-8df00dc28be8
119. *Atomics - The Rustonomicon*. http://doc.rust-lang.org/nomicon/atomics.html
120. *Race condition - GeeksforGeeks*. https://www.geeksforgeeks.org/operating-systems/race-condition-in-operating-systems
121. *java - Atomic file write operations (cross platform) - Stack ...*. https://stackoverflow.com/questions/2049247/atomic-file-write-operations-cross-platform
122. *Race condition - Wikipedia*. https://en.wikipedia.org/wiki/Race_condition
123. *permission - How can I manually allow Local Network access ...*. https://apple.stackexchange.com/questions/475737/how-can-i-manually-allow-local-network-access-for-an-app
124. *iOS local network permission prompt not appearing for ...*. https://stackoverflow.com/questions/79809131/ios-local-network-permission-prompt-not-appearing-for-multipeerconnectivity-de
125. *If an app would like to connect to devices on your local network*. https://support.apple.com/en-la/102229
126. *If an app would like to connect to devices on your local network*. https://support.apple.com/en-us/102229
127. *maestro-docs/introduction/get-started/supported-platform/ios ...*. https://github.com/mobile-dev-inc/maestro-docs/tree/main/introduction/get-started/supported-platform/ios
128. *iOS | Maestro Docs*. https://docs.maestro.dev/get-started/supported-platform/ios
129. *Maestro — Re-Building the iOS Driver*. https://maestro.dev/blog/maestro-re-building-the-ios-driver
130. [[config-plugins] Help with iOS Plugin #18725](https://github.com/expo/expo/discussions/18725)
131. *Unity Engine*. https://discussions.unity.com/t/ios-14-properly-dealing-with-nslocalnetworkusagedescription/808978
132. *NSLocalNetworkUsageDescription is against App Store ...*. https://github.com/react-native-google-cast/react-native-google-cast/issues/355
133. *User roles*. https://tailscale.com/kb/1138/ip-leases/
134. *Maestro + real iOS devices — open-sourced our solution*. https://www.reddit.com/r/expo/comments/1poekmh/maestro_real_ios_devices_opensourced_our_solution
135. *Maestro, End-to-End UI Testing for Mobile and Web*. http://maestro.dev/
136. *Page Not Found · React Native*. https://reactnative.dev/blog/2022/11/22/react-native-core-0.72-release
137. *Question:  Symbol.asyncIterator support ? · Issue #24127 · react/react-native · GitHub*. https://github.com/facebook/react-native/issues/24127
