# RESEARCH — why `poolside-yolo` became unusable: the multimodal capability lie (July 2026)

**Date:** 2026-07-30
**Symptom reported:** "I am unable to use poolside-yolo at all."
**Status:** root-caused, fixed, and defended by tests. Upstream bug still present in the
latest shipped build; **unreported** as of this date.
**Companion doc:** [`RESEARCH-POOLSIDE-CLI-AUGUST-2026.md`](./RESEARCH-POOLSIDE-CLI-AUGUST-2026.md)
(version/auth/flag surface). This doc covers only the multimodal failure.

---

## Verdict

| Question | Answer |
|---|---|
| Is `poolside-yolo` broken? | **No.** The wrapper, both lanes, auth, mode, and the gateway were all healthy the whole time — `--doctor` was fully green and a fresh text-only run answered correctly on the first try. |
| Then why was it unusable? | **A pasted screenshot permanently bricks the session.** Not the turn — the *session*. |
| Root cause | `pool acp` advertises `promptCapabilities.image = true`, but the only models it serves (`poolside/laguna-s-2.1`, `poolside/laguna-xs-2.1`) are **text-only**. The TUI therefore accepts an image it can never send. |
| Why it is fatal rather than annoying | `pool` replays the entire conversation on every turn, so the rejected image stays in history. Every *subsequent* prompt — plain text included — dies with the same 400, forever. |
| Measured blast radius | Session `019faf19…`: image sent `2026-07-29T16:40:09`, still returning the same 400 at `2026-07-30T10:39:42`. **48 consecutive failed turns over ~18 hours.** |
| Is a newer `pool` available? | **No.** CDN `pool-latest-version.txt` = `v1.0.14`; local = `1.0.14`. Already latest. |
| Is it reported upstream? | **No.** 34 issues on `poolsideai/pool`, zero mentioning image/multimodal/vision/paste/capability. |
| Can a vision model be selected instead? | **No.** The live `session/new` response advertises exactly two models, both text-only. There is no vision option in the native lane. |
| Fix | `poolside-acp-imageguard` — an ACP proxy that corrects the capability advertisement *and* transcribes images to text before they can reach the model. |

---

## 1. How the failure actually presents

What the user sees, every turn, regardless of what they type:

```
• Error during ACP method session/prompt
  └ 400 Bad Request: This model does not support multimodal
    (image/video/audio) inputs.
```

The trap is that the message names *multimodal inputs* while the user is sending
plain text. Nothing in the UI connects the failure to a screenshot pasted hours
earlier, so the natural read is "poolside-yolo is broken" — which is why the bug
reads as total breakage rather than as an unsupported-attachment papercut.

## 2. Evidence chain

Each step was executed, not inferred.

**2.1 — The wrapper was never at fault.** `--doctor --json` reported
`ok:true, lane:native, nativeAuthed:true, modeValid:true`, and a fresh one-shot
(`poolside-yolo "Reply with exactly the word PONG"`) returned `PONG`, exit 0. Whatever
was broken was not the wrapper, the lane, or the credentials.

**2.2 — The poisoning is real and it is permanent.** From the ACP log of the affected
session (`~/Library/Application Support/poolside/pool/logs/<workspace>/<session>/acp.log.jsonl`):

- line 250274, `16:40:09` — a `session/prompt` carrying
  `{"text":"are you sure? …[Image #1]"}` **plus** `{"type":"image","mimeType":"image/png","data":"iVBORw0…"}`
- first `400 … does not support multimodal` at `16:41:50`
- subsequent prompts are **pure text** — `"how do we prevent such regressions…"`,
  `"are you sure?"`, `"continue"` — and every one of them still 400s
- last line of the file, `2026-07-30T10:39:42`, is the same 400
- 48 occurrences in that one session

**2.3 — Reproduced from scratch against the real server.** A scripted ACP client sent a
64×64 PNG to an unguarded `pool acp`, then a text-only follow-up:

```
INITIALIZE promptCapabilities = {"image":true}
PROMPT#1 ERROR: 400 … does not support multimodal (image/video/audio) inputs.
PROMPT#2 (text-only, after image) ERROR: 400 … does not support multimodal …
```

Prompt #2 contained no image and still failed. That is the poisoning, reproduced
independently of the original session.

**2.4 — The capability advertisement is the root cause.** The `initialize` handshake
from `pool acp` v1.0.14:

```json
"agentCapabilities": {
  "promptCapabilities": { "image": true },
  "_meta": { "poolside/service_mode": "provider: inference.poolside.ai", … }
}
```

while the same server's `session/new` offers only:

```json
"options": [
  { "value": "poolside/laguna-s-2.1"  },
  { "value": "poolside/laguna-xs-2.1" }
]
```

Both are text-in/text-out. Poolside's own model documentation confirms the Laguna line
has no vision. **The server promises a capability its backend cannot honour**, and the
TUI believes it. That is the whole bug.

**2.5 — Tool results are not a vector.** Worth ruling out, because it changes where a
fix belongs: `pool`'s own `read` tool refuses binary files (`"reading binary files is
not supported"`), so an image cannot enter the history via a tool result. The only way
in is a user attachment — which means a fix at the *prompt* boundary is sufficient.

## 3. What does **not** fix it

- **Waiting for an upstream fix.** `v1.0.14` is the latest shipped build (CDN check).
  Nothing to update to.
- **Switching models with `-m`.** Both advertised models are text-only.
- **`--resume` / reloading the session.** Resume replays the same poisoned history.
- **Deleting the log files.** Logs are a record; history lives in the trajectory.
- **"Just don't paste screenshots."** This is the operator-trick class of non-fix. Igor
  communicates in screenshots; a rule that must be remembered forever, whose penalty for
  one lapse is an entire lost session, is not a fix.

## 4. The fix — `poolside-acp-imageguard`

A proxy on the ACP stdio channel: `pool` TUI → **guard** → `pool acp`. Two layers,
deliberately independent.

**Layer 1 — stop lying.** Rewrite the `initialize` result so `promptCapabilities.image`
and `.audio` are `false`. A well-behaved client then declines the paste in the UI,
before anything is committed to history. This is the *nice* failure.

**Layer 2 — enforce it.** Replace any image/audio block that still arrives in a
`session/prompt` before it can reach the model. Layer 1 is a request to a client we do
not control; layer 2 is the guarantee.

The replacement is not a tombstone. By default the image is transcribed by a vision
model on the Hermes gateway (`glm-vision` → `vision-gemini` → `vision-free` →
`vision-local`) and the **description** is injected as text, so a pasted screenshot
still carries its information into a text-only session. Transcription happens out of
band — a separate one-shot call whose result is text — so the pool session never holds
an image and cannot be dragged onto a small-context vision model
(cf. the `glm-vision` 65K-context trap).

Verified end-to-end against the real server, same client, same image as §2.3:

```
[guard] corrected initialize: promptCapabilities.image/audio -> false
INITIALIZE promptCapabilities = {"image":false,"audio":false}
[guard] Image (168B) -> 144 chars via glm-vision
[assistant] Blue                       <- correct, from a text-only transcription
PROMPT#1 RESULT: stopReason=end_turn, success=true
[assistant] OK
PROMPT#2 (text-only, after image) RESULT: stopReason=end_turn, success=true
```

The model answered the question *about the image* correctly while never receiving one,
and the follow-up text turn survived. Compare directly against §2.3.

### Configuration

| Env | Default | Meaning |
|---|---|---|
| `POOLSIDE_YOLO_IMAGE_GUARD` | `on` | `off` runs unguarded (bug and all) |
| `POOLSIDE_IMAGE_GUARD` | `auto` | `auto` / `describe` / `strip` / `off` |
| `POOLSIDE_IMAGE_GUARD_URL` | `http://127.0.0.1:4010/v1` | vision gateway |
| `POOLSIDE_IMAGE_GUARD_MODELS` | `glm-vision,vision-gemini,vision-free,vision-local` | fallback chain |
| `POOLSIDE_IMAGE_GUARD_TIMEOUT` | `45000` | ms per vision attempt |

`poolside-yolo` registers the guard automatically on interactive runs and reports it in
`--doctor --json` (`imageGuard`, `imageGuardEnabled`, `imageGuardPresent`,
`imageGuardWired`). It is **not** applied to `pool exec`: that path has no
`--agent-server` flag and no way to attach an image, so injecting `-s` there would
break every one-shot run.

## 5. Recovering an already-poisoned session

There is no clean repair. The image is in the replayed history, and `--resume` replays
it. Start a new session.

`pool acp` does advertise `"poolside/rewind": true` in its capability `_meta`, which
*may* allow rewinding to a turn before the attachment. **This is unverified** — no
rewind method appears in any local ACP log, and it was not exercised here. Treat it as
a lead, not a remedy.

## 6. Lessons worth keeping

1. **A capability flag is a claim, not a fact.** `pool` advertised `image: true` and
   meant it sincerely; the *backend* could not honour it. This is the same shape as the
   2026-07-27 `--mode allow-all` bug in this very wrapper — a value that was accepted,
   looked right, and silently did the wrong thing. Both were caught only by probing the
   running system rather than reading its documentation.
2. **"Broken for me" deserves a fresh-session control before a rebuild.** The wrapper
   was green and a new session worked on the first try. Without that control, the
   obvious next move is to start rewriting healthy code.
3. **Ask what a rejected input does to *state*, not just to the turn.** A 400 on a
   pasted image is a papercut. A 400 that persists in replayed history is a destroyed
   session. The severity is entirely in the second-order effect.
4. **Negative assertions must prove the system ran.** Two tests here ("guard absent when
   opted out", "guard absent on the exec path") passed *vacuously* against a wrapper that
   was crashing before it ever spawned `pool` — bash 3.2 treats `"${arr[@]}"` on an empty
   array as unbound under `set -u`, and macOS still ships 3.2 while CI runs bash 5. The
   absence of the thing you are looking for is not evidence until you have shown the
   check could have found it.

## 7. Upstream

Not filed. Worth reporting to `poolsideai/pool` — the minimal report is: `pool acp`
returns `promptCapabilities.image: true` while serving only text-only Laguna models, and
because prompts replay full history, a single accepted image renders the session
permanently unusable rather than failing one turn. Reproduce with the ACP handshake in
§2.4 plus any image block.

The live canary in `tests/test-poolside-acp-imageguard.sh` asserts the bug is *still
present*; it goes red the day Poolside fixes it, which is the signal to retire the guard.

## Sources

- [poolside/Laguna-S-2.1 · Hugging Face](https://huggingface.co/poolside/Laguna-S-2.1)
- [Introducing Laguna S 2.1 — Poolside](https://poolside.ai/blog/introducing-laguna-s-2-1)
- [Poolside CLI reference](https://docs.poolside.ai/cli/cli-reference)
- [poolsideai/pool on GitHub](https://github.com/poolsideai/pool)
- [Laguna S 2.1 (free) — OpenRouter](https://openrouter.ai/poolside/laguna-s-2.1:free)
- Local evidence: `~/Library/Application Support/poolside/pool/logs/…/acp.log.jsonl`,
  live `initialize` / `session/new` probes against `pool acp` 1.0.14, CDN
  `pool-latest-version.txt`.
