# Hermes Mobile discovery, Tailscale, and OTA release decision — July 2026

Date: 2026-07-15

Parallel deep-research run: `trun_d3be5e813aa9497099ba89e4785d067b`

Raw result: `parallel-research/hermes-discovery-ota-july-2026.md` and `.json`

## Decision

The July 15 failure was not proof that either Mac was unreachable on Tailscale. Both Macs answered Hermes `/health` over their tailnet addresses. The release-blocking defect was identity and presentation in the phone picker:

1. discovery counted reachable URL candidates rather than unique computers;
2. poisoned pairing metadata allowed a MacBook LAN address to be associated with the Mac mini Tailscale record;
3. hostname/IP merging could collapse the MacBook Pro into the mini;
4. the physical phone was still running a release installed before the picker fix merged.

The correct product invariant is:

> The chooser renders one computer row per verified machine identity, exposes the best currently reachable route, reports a unique-computer count, and never allows one machine's LAN metadata to overwrite another machine's Tailscale identity.

The immediate JavaScript fix is OTA-eligible only for installed builds with the same Expo `runtimeVersion`. The Android network-security configuration is native and therefore requires a new store binary. A merged PR, an EAS update, and a corrected binary installed on a phone are three different proof surfaces.

## What the research established

### 1. mDNS is local-network discovery, not tailnet discovery

Android `NsdManager` discovers services on the local network. Tailscale MagicDNS maps known tailnet device names to Tailscale IP addresses; it does not relay Bonjour/mDNS advertisements between networks. Hermes therefore needs two independent discovery paths:

- local candidates from LAN/Bonjour and USB;
- direct probes of known Tailscale `100.64.0.0/10` or MagicDNS hosts obtained from secretless pairing/discovery metadata.

This matches the existing Hermes design. Adding a Tailscale native module or querying the Tailscale control-plane API from the mobile app is not required for the present defect and would add credentials and native release risk.

Primary sources: [Android NsdManager](https://developer.android.com/reference/android/net/nsd/NsdManager), [Tailscale MagicDNS](https://tailscale.com/docs/features/magicdns), [Tailscale IP addresses](https://tailscale.com/docs/concepts/tailscale-ip-addresses).

### 2. Android cleartext policy is a native binary boundary

Android Network Security Configuration is compiled into the APK/AAB. Android XML cannot express a CIDR allowlist for private LAN plus Tailscale `100.64.0.0/10` addresses. Hermes currently solves that constraint by:

- generating a native Network Security Configuration that permits cleartext transport;
- rejecting public `http://` gateway URLs in JavaScript;
- allowing only loopback, emulator, RFC1918, `.local`, `*.ts.net`, and Tailscale CGNAT hosts through the product URL policy.

That is narrower at the application layer, but not at Android's transport layer. Moving the Mac gateway to authenticated HTTPS would permit a stricter native base policy and remains the preferred hardening direction. It is not a prerequisite for fixing the missing-computer row.

The raw research incorrectly proposed a hostname-only XML exemption as sufficient for bare `100.x` HTTP. It is not: Network Security Configuration domain entries are hostname based, not CIDR based. The existing Hermes native configuration is therefore deliberate, test-covered, and must be present in the shipped binary.

Primary source: [Android Network Security Configuration](https://developer.android.com/privacy-and-security/security-config).

### 3. Expo EAS Update cannot repair an incompatible native runtime

EAS Update delivers JavaScript and assets to builds whose `runtimeVersion` matches the update. Hermes currently uses the `appVersion` runtime policy. Therefore:

- picker counting, deduplication, poisoned-profile healing, copy, and telemetry can be OTA changes;
- Android manifests, Network Security Configuration, Expo config plugins, native dependencies, and an Expo SDK upgrade require a new binary;
- a `1.0` runtime update does not fix an installed `1.1` runtime, and vice versa;
- changing from `appVersion` to `fingerprint` is itself a deliberate native release-train change, not an OTA escape hatch.

Recommendation: adopt Expo's `fingerprint` runtime policy in the next binary so native-affecting changes automatically produce a different runtime. Until then, CI must verify a build-to-update compatibility matrix before publication.

Primary sources: [Expo runtime versions](https://docs.expo.dev/eas-update/runtime-versions/), [How EAS Update works](https://docs.expo.dev/eas-update/how-it-works/), [Expo Updates API](https://docs.expo.dev/versions/latest/sdk/updates/).

### 4. Store policy does not make every enhancement OTA-safe

Expo documents EAS Update as an over-the-air delivery system for non-native pieces of an app. Store-policy compliance is still contextual: an OTA must not evade review, introduce disallowed behavior, or materially transform the reviewed app. The safe Hermes rule is operational rather than rhetorical:

- bug fixes and bounded UI/JavaScript enhancements may use OTA when the runtime matches;
- native changes always use a store binary;
- material product changes go through store review even if technically expressible in JavaScript;
- every production update retains rollback and telemetry.

This report does not claim a blanket Apple or Google exception for arbitrary downloaded code. Primary policy: [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Google Play deceptive behavior policy](https://support.google.com/googleplay/android-developer/answer/9888077).

## Corrected picker model

The raw research recommended one row per `(machine, transport)`. That would recreate the confusing alias explosion shown by “Found 6.” Hermes should instead use this model:

```text
machine identity
  display name
  verified hostname
  endpoints[] = USB, LAN, Tailscale
  preferred reachable endpoint = USB only when explicitly connected;
                                 otherwise Tailscale for away-from-home durability;
                                 otherwise LAN
  last successful probe per endpoint
```

The picker displays one row per machine. Transport is status/metadata on that row, not a second machine. USB may remain a visually explicit wired shortcut, but it must not increase the “computers found” count.

Identity precedence:

1. stable authenticated Hermes machine identifier when available;
2. verified live `/health` hostname plus independent endpoint evidence;
3. saved profile ID only when it does not conflict with live identity;
4. never merge two rows solely because one record's `localIp` equals another endpoint.

For a Tailscale payload, RFC1918 `localIp` is display metadata only and must not participate in cross-machine identity merging. A stale or poisoned pair record is quarantined or repaired after a live probe; it cannot shadow a newly discovered computer.

## OTA versus binary matrix

| Change | EAS OTA | New binary | Reason |
|---|---:|---:|---|
| Unique-machine count | Yes, compatible runtime only | No | JavaScript |
| Dedupe and poisoned-profile healing | Yes, compatible runtime only | No | JavaScript/storage logic |
| Picker UX and honest progress copy | Yes, compatible runtime only | No | JavaScript/assets |
| JS telemetry and feature flag | Yes, compatible runtime only | No | Existing native SDK |
| Network Security Configuration | No | Yes | Android resource/manifest |
| New native discovery/Tailscale module | No | Yes | Native code |
| Expo SDK/native dependency change | No | Yes | Native runtime |
| `runtimeVersion` policy migration | No | Yes | Establishes a new native compatibility contract |

## Release-blocking acceptance contract

Hermes Mobile must not enter production until all of these are proven on a release build:

1. Fresh install or cleared app data: no saved Mac profiles, no owner-only bootstrap, no development unlock.
2. USB discovery absent: no `adb reverse`, no cable-derived route, no USB watchdog repopulating routes during the test.
3. Tailscale-only: MacBook Pro and Mac mini are independently reachable over their own tailnet endpoints.
4. Picker result: exactly two unique computers are counted and rendered; the MacBook Pro is not merged into the mini.
5. Route truth: each row labels the actual selected route; a Tailscale route says it works away from home only after a successful live probe.
6. Authentication truth: selecting either Mac completes an authenticated Hermes request; a reachable `/health` alone is not sufficient.
7. Poisoned metadata regression: a mini record containing the MacBook LAN address cannot collapse the two machines.
8. Runtime truth: the installed build's runtime is compatible with the selected EAS update; otherwise release a new binary.
9. Restart/reconnect: kill and relaunch the app, sleep/wake or restart one host service, and verify bounded self-heal without lying “Connected” UI.
10. Rollback: retain a known-good update and verify the production channel can be rolled back without requiring native behavior absent from that build.

The minimum physical matrix is the current Samsung production phone plus one clean Android emulator/API-level lane in CI. Pixel-only recommendations from the raw report are not evidence for Samsung behavior.

## Telemetry and ownership

One discovery owner must emit a single scan receipt:

```text
scan_id
candidate_count_by_source
unique_machine_count
aliases_collapsed
identity_conflicts_quarantined
probe_result_by_endpoint (without secrets)
time_to_first_machine_ms
time_to_complete_ms
selected_machine_id_hash
selected_transport
```

Alerts should target invariants, not raw volume:

- known paired machine absent after a completed scan;
- candidate count greater than zero but unique machine count zero;
- identity conflict or cross-host local-IP collision;
- repeated authentication `401` after a successful health probe;
- self-heal exhausted after its bounded retry window.

Host watchdogs own host availability and key/pair-record repair. The mobile discovery owner owns scan, identity, presentation, and bounded retry. Neither can promise that Tailscale, the phone VPN, the Mac power state, or the network will never fail. The durable promise is that failures become observable, bounded, self-healing where possible, and honestly presented.

## Rollout decision

1. Ship the corrected binary containing the native cleartext configuration and the picker identity fix.
2. Run the fresh-user/no-USB acceptance contract on the exact candidate binary.
3. Roll out in stages with unique-machine, authentication, crash-free, and reconnect telemetry.
4. Use EAS OTA for compatible JavaScript bug fixes and bounded enhancements after runtime compatibility is proven.
5. Require a new store binary for every native/config/runtime change and for any installed population whose runtime cannot receive the fix.

No “fixed forever” claim is permitted. Release readiness means the exact candidate binary passes the above contract and has a tested rollback path.
