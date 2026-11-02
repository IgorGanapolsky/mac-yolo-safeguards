# fix(hosted): honest Fly VPS labels, Together quota, pricing, /d

<!-- source: Merged PR | id: 2167 | closed: 2026-10-29T14:02:17.964Z -->

## Question

fix(hosted): honest Fly VPS labels, Together quota, pricing, /d

## Answer

Fixes
- Cloud turns no longer inherit `Igors-MacBook-Pro` / localhost Ollama as Engine
- Statusline defaults to Fenced VPS; live Gemini is named from runner `/health`
- Together `Credit limit exceeded` is quota, not a dead VPS
- `#pricing` is the $10 offer, not the capacity matrix
- `/d` → `/dashboard`
- Runner health publishes `model` + `modelHost` without the key

[View source](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/2167)

---
