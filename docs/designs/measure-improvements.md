# Measure improvements: local history of the HUD numbers

Igor, 2026-11-13: "why can't we use mac yolo safeguards to help us measure improvements???" Brief:
`.herdr-briefs/measure-improvements-2026-11-13.md`.

## Goal
Keep the numbers the HUD shows, every 10 minutes, on this Mac only. Let anyone ask "did change X help?" and get a
before/after table with sample counts. A performance or cost change should ship with that table.

## Choice: Node tool, not Swift
The HUD computes its numbers inside `macos/MacYoloSafeguardsApp.swift` (identical copy `macos/MacYoloTranslucentHud.swift`),
and wiring a headless snapshot into the app would mean editing both copies while another PR (2368) edits the same files.
So the snapshot is a Node tool that runs the same commands and the same counting rules:

| HUD number | Swift source | Node source |
| --- | --- | --- |
| tokens, calls, new/cached | `tallyAgentTokens` (id dedupe, synthetic skipped) | `tallyTokens` in `tools/mac-yolo-measure.js` |
| secrets count | `tools/mac-yolo-secret-scan.js scan --since-days 30` | same command |
| network up/down, top uploader | `nettop -P -d -t external -L 2 -s 2` | same command, `parseNettop` |
| CPU, GPU, RAM, load | Mach calls | `top -l 1`, `ioreg IOAccelerator`, `memory_pressure`, `os.loadavg` (approximation of the same values) |

Known gap: CPU/GPU/RAM come from command output, not the app's own Mach calls, so they can differ by a few points
from what the HUD shows at the same second.

## Files
- `tools/mac-yolo-measure.js` (new): `snapshot`, `mark`, `markers`, `compare`. Exports the functions the tests use.
- `tools/mac-yolo-model-prices.js` (new): price table with source link and the date checked. Unlisted model = "unpriced".
- `bin/mac-yolo-measure` (new): wrapper.
- `tools/mac-yolo-mcp-server.js` (edit): adds `measure_compare` and `measure_mark`; `bin/mac-yolo-mcp` launches it unchanged.
- `tools/install-metrics-launchagent.sh` (new): installs `com.igor.macyolo.metrics` (every 600 s).
- `tests/test-mac-yolo-measure.js` (new): runs under the existing `tests/test-*.js` CI glob.

## Data
- `~/.mac-yolo-safeguards/metrics.jsonl`: one JSON line per snapshot; lines older than 30 days are dropped on each write.
- `~/.mac-yolo-safeguards/markers.jsonl`: markers, kept apart so retention never deletes them.
- Nothing leaves the Mac. The secrets count is a number only.

## Cost
Claude logs carry no price, so cost = tokens by kind (input, output, cache write, cache read) times the price table per model.
OMP logs its own cost; that is used as recorded. A model missing from the table is listed under `unpriced` and adds nothing,
so the dollar figure is a floor whenever `unpriced` is not empty. Prices were fetched on 2026-11-13 from
https://platform.claude.com/docs/en/about-claude/pricing; Haiku rows are left out because the fetched page text did not
name them unambiguously.

## Compare
`compare --around "<marker>" [--window 60]` uses equal windows (minutes) before and after the marker; `--before "A..B" --after "C..D"`
takes explicit local 12-hour ranges. Each side averages its samples. Fewer than 3 samples on a side prints "Not enough data".
Averages of trailing-window totals (tokens over 2h) lag a change by up to the window length; read the 10-minute rows first.

## Not in this PR
HUD line "vs. last week" (needs Swift edits on files PR 2368 touches, and 3 days of data first).

## Verification
`node tests/test-mac-yolo-measure.js`; real snapshots from the LaunchAgent; `bin/mac-yolo-measure compare --around "herdr watchdog on"`.
