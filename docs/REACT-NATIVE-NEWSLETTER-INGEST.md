# React Native Newsletter Ingest

Periodic job that ingests **Callstack** and **Infinite Red** React Native ecosystem
updates, scores them for **Hermes Mobile** ROI, and writes local reports + RAG JSONL
outside the repo.

This is weak-supervision scoring (keyword rules + app profile gaps), not a trained
model. Pair with `agent-decision-stack.js` / ThumbGate for agentic RAG at decision time.

## Sources

| Publisher | URL | Mechanism |
|-----------|-----|-----------|
| Callstack | [callstack.com/newsletter](https://www.callstack.com/newsletter) | Index HTML → `/newsletters/*` issue pages → JSON-LD `BlogPosting` |
| Infinite Red | [shift.infinite.red/feed](https://shift.infinite.red/feed) | Red Shift RSS (official Infinite Red RN publication) |

The [Infinite Red newsletter signup page](https://infinite.red/newsletter) embeds a
Mailchimp archive script with stale samples; **Shift RSS** is the reliable Infinite Red feed.

## Run once

```sh
node tools/react-native-newsletter-ingest.js
```

With DS / Agentic RAG brief for the top item:

```sh
node tools/react-native-newsletter-ingest.js --decision-stack --json
```

Default outputs:

- `~/Library/Application Support/mac-yolo-safeguards/react-native-newsletter-ingest.json`
- `~/Library/Application Support/mac-yolo-safeguards/react-native-newsletter-ingest.md`
- `~/Library/Application Support/mac-yolo-safeguards/react-native-newsletter-rag.jsonl`
- `~/Library/Application Support/mac-yolo-safeguards/react-native-newsletter-state.json`

## Weekly LaunchAgent

Template: `com.igor.react-native-newsletter-ingest.plist` (every **7 days**, `StartInterval=604800`).

Install from repo root:

```sh
repo="$(pwd)"
home="$HOME"
node_bin="$(command -v node)"
sed "s#{{REPO}}#$repo#g; s#{{HOME}}#$home#g; s#{{NODE}}#$node_bin#g" \
  com.igor.react-native-newsletter-ingest.plist \
  > "$HOME/Library/LaunchAgents/com.igor.react-native-newsletter-ingest.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.igor.react-native-newsletter-ingest.plist"
launchctl enable "gui/$(id -u)/com.igor.react-native-newsletter-ingest"
launchctl kickstart -k "gui/$(id -u)/com.igor.react-native-newsletter-ingest"
```

Verify:

```sh
launchctl print "gui/$(id -u)/com.igor.react-native-newsletter-ingest"
tail -n 80 "$HOME/Library/Logs/react-native-newsletter-ingest.log"
cat ~/Library/Application\ Support/mac-yolo-safeguards/react-native-newsletter-ingest.md
```

Unload:

```sh
launchctl bootout "gui/$(id -u)/com.igor.react-native-newsletter-ingest"
rm -f "$HOME/Library/LaunchAgents/com.igor.react-native-newsletter-ingest.plist"
```

## ROI rules (Hermes Mobile)

The scorer checks `hermes-mobile/package.json`, `app.json`, Maestro flow count, and
Jest coverage gates, then matches newsletter text against rules such as:

- **agent-device + Maestro** — `release-preflight.sh` runs `npm run e2e:accelerated` when adb device connected (`SKIP_ACCELERATED_E2E=1` to skip)
- **Expo SDK track** — bounded SDK upgrade when Callstack flags SDK 56
- **cleartext / LAN HTTP** — `usesCleartextTraffic` + gateway URL on Android
- **Inspector / Rozenite** — devtools checklist in ship-guard
- **testing / evals** — Jest + Maestro coverage for Chat/Ops regressions

Read-only: does not bump dependencies or open PRs automatically.

## Agent workflow

After each run:

1. Read `react-native-newsletter-ingest.md` top 3 items
2. `node tools/agent-decision-stack.js --task "<#1 recommendation>" --json`
3. Ship one PR-sized change with tests; capture ThumbGate lesson with evidence

### July 2026 operator UX cadence

Pair newsletter ingest with connectivity research:

```sh
node tools/react-native-newsletter-ingest.js --limit 12 --top 8 --min-score 45 --decision-stack
node tools/agent-decision-stack.js --task "July 2026 Hermes Mobile remote operator UX" --json
```

Deep research doc: [DEEP-RESEARCH-JULY-2026-HERMES-MOBILE.md](./DEEP-RESEARCH-JULY-2026-HERMES-MOBILE.md) — updated when ingest surfaces keyboard, agent-device, SDK, or connectivity ROI items.

Current top flag (2026-06-26): **agent-device-maestro** — wire `npm run e2e:accelerated` into `scripts/release-preflight.sh` (not yet auto-shipped by ingest).
