# Chrome background CPU harden

Implements the MakeUseOf 2026-07-14 playbook — *disable browser background processes to cut CPU* — as a durable, fleet-wide policy for mac-yolo-safeguards.

Source: [I disabled my browser's background processes and cut CPU usage in half](https://www.makeuseof.com/i-disabled-my-browsers-background-processes-and-cut-cpu-usage-in-half/)

## What we set (Chrome enterprise policies via `defaults`)

| Policy | Value | Why |
|---|---|---|
| `BackgroundModeEnabled` | `false` | Stop Chrome from staying alive after all windows close |
| `PreloadPages` | `1` (Standard) | Avoid Extended speculative preloading that burns CPU/RAM |
| `HighEfficiencyModeEnabled` | `true` | Memory Saver / efficiency for idle tabs |

Domains managed when the app is installed (or already has defaults):

- `com.google.Chrome`
- `com.google.Chrome.canary`
- `com.google.Chrome.beta`
- `com.google.Chrome.dev`
- `org.chromium.Chromium`

## Hard rules (kit law)

- **Never** auto-kill primary Google Chrome, Cursor, or other GUI apps.
- Hermes CDP (`com.hermes.chrome-cdp`, `~/.hermes/chrome-cdp-profile`) is **not** deleted.
- Secondary-browser reclaim under memory pressure remains the only browser *quit* path (Canary/Beta/Dev), already in `sim-runaway-guard.sh`.

## Commands

```bash
# Status (both Macs)
bash scripts/chrome-background-cpu-harden.sh --status --json

# Apply policies
bash scripts/chrome-background-cpu-harden.sh --install

# Wired into install + yolo-health
./install.sh
yolo-health
```

Restart Chrome once after `--install` so the UI matches the policy.

## Manual leftovers (not automated)

The article also suggests reviewing extensions (`chrome://extensions`) and Chrome Task Manager (`Shift+Esc`). Those are operator taste — this kit only enforces the durable policy toggles.

## Related

- [sim-runaway-guard.sh](../sim-runaway-guard.sh) — secondary browser reclaim under pressure
- [README.md](../README.md) — never auto-kill primary browsers
