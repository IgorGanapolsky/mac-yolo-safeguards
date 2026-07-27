# Hermes Mobile iPad connectivity — July 2026 research

Date: 2026-07-27
Parallel deep-research run: `trun_c427d833548b455094b9e80dc03ac0a3`
Run URL: <https://platform.parallel.ai/play/deep-research/trun_c427d833548b455094b9e80dc03ac0a3>
Raw output: [`../parallel-research/ipad-connectivity-july-2026.md`](../parallel-research/ipad-connectivity-july-2026.md)

## Verdict

Hermes Mobile's repeated iPad failure was not one generic "iOS networking" problem.
Physical-device testing and review isolated interacting transport, server, and
application-state defects:

1. The generated iPad transport-security policy did not authorize the exact private,
   Tailscale CGNAT, Tailscale IPv6, and MagicDNS destinations used by the product.
2. The pair server generated its QR synchronously through `npx` on `/pair.json`;
   that could exceed the watchdog deadline and put its LaunchAgent into a restart loop.
3. Selecting a paired computer persisted its URL and key but left
   `connectionMode=relay`, so the direct Hermes gateway was not the selected runtime.
4. A LAN/Tailscale discovery scan could finish after an explicit selection and save
   its older `activeProfileId=null` snapshot over the user's selection. The immediate
   connection could work, but relaunch lost the Mac identity and selected route.
5. Same-Mac LAN/Tailscale deduplication, bootstrap, and stale ref publication could
   replace an explicitly selected route or combine one Mac's route with another Mac's
   credential.
6. Off Wi-Fi, a saved LAN route could consume the full health timeout before trying
   its available same-machine Tailscale fallback.

The July 2026 platform research supports the native network configuration already
chosen by the fix, while rejecting several over-broad claims in the raw research.

## Primary-source platform findings

### Local Network privacy

- Apple requires `NSLocalNetworkUsageDescription` when an app directly accesses
  local-network hosts. Hermes probes HTTP endpoints on the LAN, so the permission
  declaration and an in-app purpose string are required.
- Apple's TN3179 treats direct unicast, multicast, broadcast, and Bonjour access as
  local-network privacy surfaces. Hermes must handle denial or delayed permission
  without hanging discovery indefinitely.
- `NSBonjourServices` is only needed when the app advertises or browses Bonjour
  service types. Current Hermes discovery probes explicit LAN/Tailscale HTTP hosts;
  it does not browse a Bonjour service, so adding speculative Bonjour declarations
  would be incorrect.

Sources:

- <https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription>
- <https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy>
- <https://developer.apple.com/documentation/dnssd>

### App Transport Security

Hermes uses plain HTTP on private LAN and Tailscale addresses. The signed application
verified on iPadOS 17.7.6 uses `NSAllowsLocalNetworking=true` plus explicit transport
exceptions for RFC1918 LAN ranges, Tailscale's `100.64.0.0/10` CGNAT range,
Tailscale's `fd7a:115c:a1e0::/48` IPv6 range, and `ts.net` including subdomains.
It deliberately does **not** enable `NSAllowsArbitraryLoads`.

The embedded `Info.plist` from physical Run 9 was extracted after signing and matched
that bounded policy. Numeric Tailscale and LAN pairing endpoints both returned HTTP
200 before the clean-install test, and the installed app connected through both
routes. That physical result is the product oracle for this configuration.

Source:

- <https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking>
- <https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsexceptiondomains>

### Tailscale

Numeric `100.x` endpoints avoid dependence on MagicDNS and are the strongest route
for this app's pairing flow. Tailscale issue #18385 reports MagicDNS failures on one
iOS 26.2 / Tailscale 1.92.3 setup, but it is a single closed report and does not
establish a general iPad failure. The tested device runs iPadOS 17.7.6, and direct
numeric Tailscale pairing reached the Mac successfully.

Source:

- <https://github.com/tailscale/tailscale/issues/18385>

### Physical iOS automation

Maestro's `cli-2.6.0` source contains an iOS XCTest runner and packaged
`driver-iphoneos` resources, so "Maestro supports only simulators" is not accurate.
On this host, the released CLI's packaged-driver setup/transport was unreliable.
The same exact-tag XCTest runner source was built, signed, installed, and executed
directly against the attached iPad, providing a real device oracle without claiming
the local CLI transport worked.

Sources:

- <https://github.com/mobile-dev-inc/Maestro/tree/cli-2.6.0/maestro-ios-xctest-runner>
- <https://github.com/mobile-dev-inc/Maestro/tree/cli-2.6.0/maestro-ios-driver/src/main/resources>
- <https://github.com/mobile-dev-inc/Maestro/blob/main/CHANGELOG.md>

## Physical-device evidence that drove the fix

Device:

- iPad 6th generation, model A1954 / iPad7,6
- iPadOS 17.7.6
- CoreDevice ID `05E261A2-8EC4-5A2B-B752-F5632510D5B1`

Final clean-install sequence:

1. Signed Release build `c5558af64a8192ab66a98be16f577889d7e612257c32bc57a628b89f7e1df8ae`
   was uninstalled, then installed into a new application container.
2. Clean Release launch displayed both expected iOS permission prompts.
3. Empty manual address submission produced the exact validation error and remained
   recoverable (`HermesEmptyAddress.xcresult`: 1 test, 0 failures).
4. Discovery found real Macs without auto-activating one, and manual numeric Tailscale
   pairing reached a connected chat state.
5. A cold relaunch preserved the active Tailscale route.
6. Explicit switching to the same Mac over LAN connected, and a cold relaunch
   preserved LAN rather than reverting to the catalog-canonical Tailscale URL.
7. Switching back to Tailscale remained atomic, and a second cold relaunch preserved
   both the selected route and its credential.

`HermesPhysicalFreshInstallRun9.xcresult` passed 1/1 test with 0 failures. Run 6 is
retained as the negative control: it passed the early journey but failed LAN cold
relaunch before the route-persistence fix.

## Implemented reliability rules

- Explicit computer selection always switches `connectionMode` to `gateway`.
- Explicit verified selection persistently dismisses the first-run connect gate.
- Background scans merge discoveries into the newest in-memory profile state and
  cannot replace the latest `activeProfileId`.
- A stale LAN match cannot persist over a newer non-loopback user selection.
- Discovery remains catalog-only until the user selects a computer.
- LAN scanning is bounded; a denied or large local network cannot spin forever.
- iOS discovery excludes USB/loopback routes that are Android-only implementation
  details.
- Direct pairing exchanges fresh pairing material and does not depend on a stale
  saved credential.
- Pair-server JSON responses never invoke QR tooling; QR generation is pinned locally
  and occurs outside the watchdog-sensitive response path.
- Bootstrap preserves a saved route only when its selected profile identity matches
  the active profile, and expired-code recovery requires that exact profile's key.
- On cellular, a private-LAN primary yields immediately to same-machine Tailscale
  fallback ordering instead of consuming the 15-second direct health timeout.

## Verification contract

A release claim requires all of these separate surfaces:

1. focused regression tests for relay/direct mode, pairing, persistence, and scan race;
2. full Jest and TypeScript checks;
3. signed Release build and strict code-sign validation;
4. clean physical iPad uninstall/install;
5. fresh-user permission and validation edge cases;
6. numeric Tailscale connection, process relaunch persistence, LAN route switch, and
   a second relaunch;
7. simulator and Android-emulator Maestro regressions;
8. required GitHub CI, fresh review of the final head, and merged-main evidence.

The raw research artifact is retained for provenance, but claims in it are not treated
as verified unless reconciled above with a primary source or physical-device result.
