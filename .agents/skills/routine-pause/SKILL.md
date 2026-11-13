---
name: routine-pause
description: "Pause, resume, or stop one cron line, launchd job, or watcher without opening Chrome. The simulator shutdown agent stays loaded."
---

# Routine pause

Use this when a cron job, a launchd agent, or a background watcher must stop or sit still. The Chrome hold is the switch that keeps Mac YOLO from driving Google Chrome.

`com.igor.shutdown-simulators` stays loaded. A pause does not open dashboard.stripe.com, buy.stripe.com, or checkout.stripe.com.

## What this gate does

- `pause`, `resume`, and `stop` are the only actions.
- A launchd label in the protected set is `protected_label`. Nothing is bootout'd.
- A launchd stop bootouts the job and disables the label. A pause only bootouts it. A resume enables it and bootstraps the same plist.
- A cron pause prefixes the line with `#MACYOLO-PAUSED: `. Resume removes that prefix. Stop deletes the line.
- A script stop sends SIGTERM when a pid is supplied and renames the file to `.paused-by-mac-yolo` when it sits inside the given root. A path outside that root is `script_outside_root`.
- `pause --kind chrome` writes `chrome: paused` to the state file. `MAC_YOLO_ROUTINE_PAUSE` pointing at that file makes `chromeBlocked` true, including when the file cannot be read. The revenue loop then skips Chrome.

## Commands

```bash
node tools/routine-pause.js --json pause --kind chrome --state "$HOME/.config/mac-yolo/routine-pause.json"
node tools/routine-pause.js --json stop --kind launchd --id com.example.job --plist /path/job.plist --apply
node tests/test-routine-pause.js
```

A dry run exits 0 with `applied` false. An applied pause exits 0. A refused pause exits 2. `chromeOpened` stays false.
