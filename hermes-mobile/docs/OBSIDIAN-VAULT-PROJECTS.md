# Obsidian vault projects in Hermes Mobile

Hermes Mobile tags chat prompts with **AI-Agent-Sync** project lanes so operators and agents know which repo/workspace a mobile turn targets.

## Architecture

Gateway `:8642` has **no filesystem read API** (verified via `/v1/capabilities`, 2026-07-05). Live catalog delivery uses the existing **pair server** on `:8765`:

```text
~/Documents/AI-Agent-Sync/Projects/README.md
        │
        ▼
node tools/hermes-vault-projects-sync.js
        │
        ▼
~/Library/Application Support/mac-yolo-safeguards/hermes-mobile-pair/vault-projects.json
        │
        ▼
http://<computer-lan-ip>:8765/vault-projects.json  ← Hermes Mobile fetch
```

`tools/hermes-mobile-pair.js` refreshes the catalog when pairing starts and serves `/vault-projects.json` beside `/pair.json`.

## Mobile behavior

| Surface | Behavior |
| --- | --- |
| Header project row | Shows active project + handoff one-liner; opens picker |
| Composer chip | `VaultProjectPickerChip` — quick project tag affordance |
| Project modal | Lists vault-sourced lanes + custom workspace path |
| System prompt | `buildMobileChatSystemPrompt` adds workspace, vault slug, handoff summary |
| Persistence | `activeProjectByComputer[profileId]` in AsyncStorage (`chatProjects`) |

## Operator refresh

After adding a vault project or handoff:

```bash
node tools/hermes-vault-projects-sync.js --vault ~/Documents/AI-Agent-Sync
node tools/hermes-mobile-pair.js --no-adb
```

## Future gateway API

If Hermes gateway adds `/api/mobile/vault-projects` (or session resource reads), point `fetchVaultProjectCatalog` there first and keep the pair-server path as fallback for USB/LAN discovery.
