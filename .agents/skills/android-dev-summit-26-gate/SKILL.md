---
name: android-dev-summit-26-gate
description: "Review an agent diff the way Android Dev Summit '26 describes Change Review: block an emulator boot for a UI preview, keep Lightbuild off the production app, and refuse vendor speed figures as our results."
---

# Android Dev Summit change review

Use this before treating an agent change as finished when the work is a UI preview, a Hermes Mobile ship script, a memory fix, or a store submission.

Google's 29 Oct 2026 Android Studio note and their tools write-up describe four habits: any agent can do the work, a change review runs before commit, a UI check uses a preview or a real device, and a memory fix is rechecked with a measurement. Their preview, skill, and LeakCanary timing figures stay theirs.

## What this gate does

- A preview task needs the Hermes ship skill on disk and either a connected device or a named preview command.
- `emulator -avd` and `xcrun simctl boot` are blocked in the command, the diff, and the preview flag. A ship task may run one of the existing Hermes ship scripts, and that command has to be the script itself.
- A review with no diff is blocked.
- A Lightbuild line under `hermes-mobile` is blocked. Production stays on the current build.
- An XR emulator install is blocked.
- An empty diff is not an approval.
- "Fixed the leak" or "fewer tokens" needs a measurement string and a recheck.
- A Play or App Store submit needs a policy check flag.
- Copy that says we are 77% faster, or that we used 3x fewer tokens, is blocked.

## Commands

```bash
node tools/android-dev-summit-26-gate.js
node tools/android-dev-summit-26-gate.js --review --task "check the hermes-mobile preview" --diff "spacing" --preview "npm test"
node tests/test-android-dev-summit-26-gate.js
```

The status command lists devices and simulators that are already booted. It does not start one.
