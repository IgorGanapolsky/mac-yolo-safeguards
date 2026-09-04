---
name: qwen-yolo
description: Launch official Qwen Code CLI in full YOLO mode using the same DashScope credentials as Qwen Coder Mac app. Use when the user names qwen-yolo, Qwen Code terminal, or wants YOLO Qwen coding in the shell.
metadata:
  version: "1.0.0"
  requires:
    bins: ["qwen-yolo", "qwen"]
---

# qwen-yolo

Wraps `@qwen-code/qwen-code` (same stack as **Qwen Coder** Mac app) with `--yolo`.

## Preflight

```bash
qwen-yolo --doctor
```

Expect: Qwen Code CLI OK, `approvalMode: yolo`, DASHSCOPE key present.

## Usage

```bash
qwen-yolo                              # interactive TUI, full YOLO
qwen-yolo -z "Inspect and fix …"       # headless one-shot YOLO
qwen-yolo --model qwen3-coder-flash -p "…"
qwen-yolo --infer -p "…"               # legacy completion fallback (MLX/Ollama)
qwen-yolo --safe -p "…"                # approval prompts for this run
```

## Auth

`DASHSCOPE_API_KEY` from (in order): process env → `~/.qwen/.env` (Mac app) → Keychain → `~/.hermes/.env`.

Never print the key. Never paste it into chat.

## Notes

- `tools.approvalMode` in `~/.qwen/settings.json` is forced to `yolo` on launch.
- Zero-spend marker `~/.hermes/NO_PAID_SPEND` → exit 73 (use `--infer --local`).
- Alias: `qy` → `qwen-yolo` (zshrc).
