# Grok Build open-source fleet integration

**Source:** [Grok Build is Now Open Source](https://x.ai/news/grok-build-open-source) (2026-07-15) · [github.com/xai-org/grok-build](https://github.com/xai-org/grok-build)

This repo integrates the **high-ROI** parts of open-source Grok Build across
the MacBook Pro and Mac mini:

1. **Local inference routes** in `~/.grok/config.toml` (Ollama + LiteLLM loopback)
2. **PreToolUse safety hooks** aligned with `grok-yolo` deny rules + AGENTS.md hard stops
3. **SessionStart receipts** (prompt-free) proving local endpoints were reachable
4. **Source audit helper** for grepping the public harness when the agent misbehaves

It does **not**:

- change the default cloud model (`grok-build` / `grok-4.5` stays primary)
- copy OAuth tokens or API keys between Macs
- replace Hermes routing, ThumbGate, or zero-spend mode
- enable external contributions to xAI (upstream does not accept PRs)

## Why this is high ROI

| Before | After |
|--------|--------|
| Grok TUI only knew cloud models | `/model ollama-hermes-64k` and LiteLLM local routes on every Mac |
| No `~/.grok/hooks` | Managed PreToolUse denies for `rm -rf`, force-push, secret paths |
| Fork secondary always cloud | `fork_secondary_model = "ollama-hermes-fast"` (local $0) |
| Harness opacity | Optional local clone + `grok-build-fleet --audit <query>` |

## Install (both Macs)

From the repo root on the MacBook Pro (SSH alias `hermes-mini` must work):

```bash
bash scripts/install-grok-build-fleet.sh
# optional: also clone the open-source tree for offline audit
bash scripts/install-grok-build-fleet.sh --clone-source
```

Local only:

```bash
bash scripts/install-grok-build-fleet.sh --no-remote
```

## Commands

```bash
# Fleet doctor (secret-safe JSON)
grok-build-fleet --doctor --json
# or
node tools/grok-build-fleet.js --doctor --json

# Re-merge managed config + hooks (idempotent)
node tools/grok-build-fleet.js --install

# Grep a local clone of xai-org/grok-build
node tools/grok-build-fleet.js --clone-source
node tools/grok-build-fleet.js --audit "PreToolUse"
```

Interactive Grok after install:

```bash
grok -m ollama-hermes-64k -p "Reply with exactly: LOCAL_GROK_OK"
# or inside TUI:
# /model ollama-hermes-64k
```

## Managed config block

The installer writes a marked block into `~/.grok/config.toml`:

```toml
# BEGIN grok-build-fleet managed (do not edit by hand)
...
# END grok-build-fleet managed
```

Re-install replaces **only** that block. Non-managed settings (`[ui] yolo`, marketplace, etc.) are preserved. A backup is written to `~/.grok/config.toml.bak-grok-build-fleet` on each install.

### Models registered

| Config id | Endpoint | Typical model |
|-----------|----------|----------------|
| `ollama-hermes-64k` | `http://127.0.0.1:11434/v1` | `qwen3.5:9b-hermes-64k` |
| `ollama-hermes-fast` | `http://127.0.0.1:11434/v1` | `qwen2.5:3b-hermes-64k` |
| `litellm-hermes-local` | `http://127.0.0.1:4010/v1` | `hermes-local` |

If a preferred Ollama tag is missing, the installer falls back to documented aliases present on both Macs.

## Safety hooks

Installed to `~/.grok/hooks/grok-build-fleet.json` with scripts under
`~/.grok/hooks/grok-build-fleet/`.

**PreToolUse** (blocking) denies:

- `rm -rf` / recursive force deletes
- `git push --force`, `git reset --hard`, `git clean -fd`
- `security …` keychain mutation/export
- paths under `~/.ssh` / `~/.gnupg`
- destructive SQL / `mkfs` / raw `dd`
- `Read` of `.env*` and `auth.json`

Deny events append a prompt-free line to
`~/.hermes/receipts/grok-build-fleet/denies.jsonl` (mode 0600).

**SessionStart** (passive) writes
`~/.hermes/receipts/grok-build-fleet/session-start-latest.json` with ollama/litellm reachability only.

## Relationship to other harnesses

| Component | Role |
|-----------|------|
| `grok-yolo` | Standalone always-approve Grok 4.5 with CLI deny rules |
| `hermes-yolo` | Hermes entry; may route to Grok or local Ollama |
| **grok-build-fleet** | TUI config + hooks for open-source local-first path |
| zero-spend gate | Host-level block of paid CLIs when `~/.hermes/NO_PAID_SPEND` exists |
| 9Router | Explicit local OpenAI gateway on `:20128` (not default) |

When zero-spend is active, prefer `ollama-hermes-64k` for interactive Grok work
instead of cloud `grok-build`.

## Verification

```bash
node tests/test-grok-build-fleet.js
bash scripts/install-grok-build-fleet.sh
node tools/grok-build-fleet.js --doctor --json   # ready:true on each host
```

Acceptance:

- both Macs report `ready: true` with ≥1 local model `ok`
- `~/.grok/config.toml` contains exactly one managed block
- `~/.grok/hooks/grok-build-fleet.json` present
- PreToolUse hook returns `deny` for `git push --force`
- no API keys or tokens written to receipts or tracked files

## Open-source note

Upstream marks external contributions as not accepted. Use the public tree for
**read / fork / local audit** only. Fleet integration lives in this repo so both
Macs stay identical without depending on upstream merges.
