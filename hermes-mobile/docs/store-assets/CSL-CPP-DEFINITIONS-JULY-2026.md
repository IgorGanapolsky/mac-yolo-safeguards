# Hermes Mobile CSL and CPP definitions — July 2026

Machine-readable sources:

- `csl-definitions-20260715.json`
- `cpp-definitions-20260715.json`

These definitions target the paid Hermes Mobile product and replace the stale free-package and subscription-era variants.

## Google Play

The target is `com.iganapolsky.hermesmobile.paid`. Google supports search-keyword-targeted Custom Store Listings in Play Console, but the Android Publisher API does not expose creation or keyword-targeting methods. The JSON therefore provides exact, validated Console inputs without pretending they have been published by an API.

Create three listings from the default paid listing:

1. Remote AI control
2. AI coding operator
3. Local multi-platform agent

Keep the default icon and six screenshots. Change only the name, short description, target keyword bundle, and first screenshot caption defined in the JSON. Do not add prices, rankings, competitor trademarks, or a free-download claim.

## Apple

The three draft pages are created and verified through the App Store Connect API. Creation is intentionally not embedded in a permanent script: Apple's page-create endpoint requires an atomic compound document and this is a one-time provider operation, while ongoing truth is read back from App Store Connect. The drafts are not submitted for review by this artifact.

Apple currently validates custom-page keyword relationships against the live version 1.3 keyword universe even when version 1.4 is selected as the page template. The immediately assignable clusters are:

- Remote: `remote`, `desktop`, `tailscale`, `wifi`
- Coding: `coding`, `devtools`, `operator`, `approve`
- Local/platform: `gateway`, `safety`, `pair`, `usb`, `phone`, `mobile`

After version 1.4 becomes live, migrate to the non-overlapping `nextKeywordIds` stored in the JSON:

- Remote: `remote`, `desktop`, `control`, `computer`
- Coding: `coding`, `assistant`, `developer`
- Local/platform: `local`, `selfhosted`, `linux`, `windows`

Apple promotional text is conversion copy, not an organic ranking field. The keyword relationships and intent-specific screenshots are the discoverability surfaces.

## Verification

`src/__tests__/storeGrowthSurfacesContract.test.ts` enforces:

- paid Play package only
- Google name and short-description limits
- no stale subscription/free-download/trademark claims
- three unique search-intent clusters per store
- immediately assigned Apple keyword IDs are present in the live keyword universe
- post-1.4 Apple keyword IDs are present in the staged default keyword field
- no duplicated Apple keyword ownership across pages
- promotional text stays within Apple's limit
