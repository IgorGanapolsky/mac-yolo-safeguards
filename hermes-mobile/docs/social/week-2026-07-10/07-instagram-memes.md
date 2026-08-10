# Instagram / Memes — "the runaway simulator" (meme draft)

**Status:** Draft — rights-safe, not published. Run `node ../../../tools/social-publish-gate.js` before any live post.

**Channel:** Instagram / memes (per `docs/social/hermes-mobile-content-engine.md` § Instagram). Hero link `thumbgate.app` when posted.

---

## Meme A — the origin story (static image, caption)

**Image concept (rights-safe, own screenshot or simple graph, no third-party memes):**
A macOS `Activity Monitor` window with a single bar pegged to **307** load average and hundreds of `simulator` rows, screenshot dimmed behind text.

**Overlay text (top):** "me: it's just ONE simulator, what could go wrong"
**Overlay text (bottom):** "my Mac 5 minutes later: LOAD 307, 256 processes"

**Caption:**
> On 2026-05-26 a runaway agent loop booted iOS Simulators until my Mac hit **load average 307**. One simulator turned into 256.
> I built a guard that kills the runaway, not your work: singleton lock, hard timeouts, stuck-loop watchdog, sim-count ceiling, critical-alert escalation (it never force-quits your GUI apps).
> Free, MIT, telemetry off by default. Stop babysitting your agents.
> #DevHumor #MacOS #AIagents #Cursor #ClaudeCode

---

## Meme B (vertical Reel clip, 15s)

**Visual:** screen-recording (own footage) of the fan spinning / Activity Monitor pegging, cut to the `sim-runaway-guard.sh` firing and the sims shutting down.

**Captions (3 beats):**
1. "POV: your agent 'just needs to run a quick integration test'"
2. "…256 simulator processes, load 307"
3. "the guard quietly takes the wheel → your Mac is back. no app data lost."

**CTA:** link tree → `thumbgate.app`

---

## Rights-safety

- Screenshots and recordings are **own-product/own-machine** content — no third-party characters, no copyrighted meme templates.
- No false affiliation, no competitor trademarks in the image.
- Publish only after `node ../../../tools/social-publish-gate.js` exits 0 and `node tools/verify-public-post.js` passes for a live claim.