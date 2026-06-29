# Live Vault Canonical Pointer

Date: 2026-06-29 Monday EDT

## Canonical Model

- One live Obsidian coordination vault: `/Users/igorganapolsky/Documents/AI-Agent-Sync`
- Live vault remote: `https://github.com/IgorGanapolsky/AI-Agent-Sync.git`
- One compiled brain snapshot: `/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/Compiled-Vaults/compiled-vault-brain-2026-06-29`
- Compiled snapshot remote: `https://github.com/IgorGanapolsky/mac-yolo-safeguards.git`

## Routing Rule

All project agents should write durable cross-agent state into the live vault. Generated compiled brain material belongs in the canonical compiled snapshot under `mac-yolo-safeguards`, not inside individual project repositories.

## Local Pointer

The live vault has a local `Compiled-Vaults/compiled-vault-brain-2026-06-29` pointer to this canonical compiled snapshot so Obsidian and local agents can traverse both layers from one vault.
