# Hermes Mobile iPad connectivity — July 2026 research

Date: 2026-07-27
Parallel deep-research run: `trun_c427d833548b455094b9e80dc03ac0a3`
Run URL: <https://platform.parallel.ai/play/deep-research/trun_c427d833548b455094b9e80dc03ac0a3>
Raw output: [`../parallel-research/ipad-connectivity-july-2026.md`](../parallel-research/ipad-connectivity-july-2026.md)

## Verdict

Hermes Mobile's repeated iPad failure was not one generic "iOS networking" problem.
Physical-device testing isolated two deterministic application-state bugs:

1. Selecting a paired computer persisted its URL and key but left
   `connectionMode=relay`, so the direct Hermes gateway was not the selected runtime.
2. A LAN/Tailscale discovery scan could finish after an explicit selection and save
   its older `activeProfileId=null` snapshot over the user's selection. The immediate
   connection could work, but relaunch lost the Mac identity and selected route.

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

Hermes uses plain HTTP on private LAN and Tailscale IP addresses. Apple's current
documentation says iOS/iPadOS 17 no longer allows IP-address connections by default
and can accept individual IP/CIDR entries in `NSExceptionDomains`. Hermes cannot
enumerate those exceptions at build time because users enter arbitrary LAN and
Tailscale addresses. Apple also documents that `NSAllowsLocalNetworking` covers
IPv4/IPv6 addresses and recommends pairing it with the broad key for older-OS
compatibility. The app's generated and checked-in native iOS settings therefore use:

- `NSAllowsLocalNetworking=true`
- `NSAllowsArbitraryLoads=true`

On newer OS versions the fine-grained local exception takes precedence over the
broad key; on older versions the broad key remains the compatibility path.

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

Observed sequence:

1. Clean Release install displayed both expected iOS permission prompts.
2. Empty manual address submission produced the exact validation error and remained
   recoverable (`HermesEmptyAddress.xcresult`: 1 test, 0 failures).
3. Discovery found real Macs and manual numeric Tailscale pairing reached a connected
   chat state.
4. On the failing relaunch, the app data container retained both Mac profiles and
   probe hosts but persisted `"activeProfileId": null`.
5. The UI consequently showed generic `Your computer. Connected` rather than the
   selected Mac name and route.

This proves transport reachability and authorization were available while product
selection state was being lost.

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

## Verification contract

A release claim requires all of these separate surfaces:

1. focused regression tests for relay/direct mode, pairing, persistence, and scan race;
2. full Jest and TypeScript checks;
3. signed Release build and strict code-sign validation;
4. clean physical iPad uninstall/install;
5. fresh-user permission and validation edge cases;
6. numeric Tailscale connection, process relaunch persistence, LAN route switch, and
   a second relaunch;
7. simulator Maestro regression;
8. required GitHub CI and merged-main evidence.

The raw research artifact is retained for provenance, but claims in it are not treated
as verified unless reconciled above with a primary source or physical-device result.
