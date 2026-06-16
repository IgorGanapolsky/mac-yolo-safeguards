# Mac YOLO Safeguards Reliability

Use this skill when Igor asks about Hermes Telegram reliability, `hermes-yolo`,
Mac YOLO guardrails, simulator runaway protection, or local model fallback
readiness in `mac-yolo-safeguards`.

## Operating Rules

- Start from verified state, not memory: run `pwd`, `git status --short --branch`,
  `yolo-health`, and `node tools/hermes-productivity-audit.js --json`.
- When Igor sends a YouTube, podcast, or media URL, do not ask which extraction
  path to use. Run `node tools/media-content-ingest.js "<url>" --json`, then
  summarize what was actually extracted and convert it into action lanes.
- When Igor says Hermes is timing out, stuck on "working", losing context, or
  replying generically, run `node tools/hermes-telegram-incident-audit.js --json`
  before answering. Report the exact slow-turn, polling-conflict, timeout,
  provider, and context-loss metrics; do not answer with generic reassurance.
- When Igor sends model/provider/reasoning material, run
  `node tools/openrouter-reasoning-plan.js --json` and map the lesson to a
  routing or cost-control change before making claims.
- For broad repo, PDF, diagram, or architecture questions, run
  `node tools/graphify-readiness.js --json` first. If Graphify is installed,
  build/query the graph before asking the model to reason over large context.
  If Graphify is missing, say so and fall back to targeted `rg` and file reads.
- Treat `terminal.cwd` as a first-class failure surface. It must point at
  `/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards` for this lane.
- Do not claim Telegram is fixed unless logs show current inbound or outbound
  delivery, with timestamps.
- Do not claim local fallback is ready unless the configured endpoint is
  reachable and advertises the configured model.
- Keep Ollama and serious serving separate:
  - Ollama is a convenience fallback.
  - vLLM/LocalAI-style OpenAI-compatible serving is the serious runtime target.
- If `hermes-yolo` crashes or exits `130`, inspect for stale cwd, interactive
  no-arg sessions, live lock files, and recent agent log interruptions.

## Proof Commands

```sh
yolo-health
node tools/hermes-productivity-audit.js --json
node tools/hermes-telegram-incident-audit.js --json
node tools/local-inference-readiness.js
node tools/media-content-ingest.js "https://example.com/media" --json
node tools/openrouter-reasoning-plan.js --effort high --json
node tools/graphify-readiness.js --json
HERMES_YOLO_NO_PREFLIGHT=1 hermes-yolo
HERMES_YOLO_NO_PREFLIGHT=1 hermes-yolo 'Reply with exactly HERMES-YOLO-PROOF-OK'
```

## Expected Healthy Baseline

- `terminal.cwd` exists and equals this repo path.
- `hermes-yolo` bare run returns `HERMES-YOLO-READY` and exits.
- `hermes-yolo` prompt mode returns the requested exact token and exits.
- Telegram gateway has one owner process.
- Telegram Bot API has zero pending updates and no current error.
- Local fallback readiness is reported honestly, even when it is not ready.
- Media links produce a structured report with `status`, `source`, `summary`,
  and `actionPlan`; blocked extraction is reported as blocked, not guessed.
- Reasoning-provider changes include a normalized `effort`, provider-native
  mappings, and a cost/risk policy.
- Knowledge-graph claims are backed by Graphify readiness/build artifacts or an
  explicit fallback path.
