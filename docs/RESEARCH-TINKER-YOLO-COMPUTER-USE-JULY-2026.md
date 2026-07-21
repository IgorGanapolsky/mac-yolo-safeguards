# Tinker-Yolo computer-use research — July 2026

Parallel deep-research run: `trun_0648dea93dab4095906bc07907c81987`

Result: <https://platform.parallel.ai/play/deep-research/trun_0648dea93dab4095906bc07907c81987>

## Verdict

The model was not stuck because the Tinker API key lacked permissions. Tinker
provides training and sampling; Ollama provides local inference and a tool-call
message format. Neither grants a model filesystem, network, or macOS authority.
A host agent must declare tools, execute them, return observations, and continue
the loop.

The July 21 terminal hang had a second, independent cause. The installed host
used one non-streaming Ollama request with a 600-second socket timeout and no
progress output. When Ollama was unloading a different large-context model,
`qwen3-hermes-tinker:q4` could not load and the terminal appeared dead.

The repaired architecture is:

```text
user
  -> tinker-yolo REPL
     -> bounded isolated planner call (qwen3-hermes-tinker:q4 on :11436)
        -> filesystem / shell / web dispatcher
        -> macOS Hammerspoon dispatcher
           -> Accessibility tree and focused UI state
           -> screenshot + OCR + qwen3-vl:4b-instruct vision on isolated :11436
           -> app activation / click / type / key / scroll
        -> private hash-chained receipt
     -> fresh observation after every action
```

No computer-use image, OCR text, filesystem content, or tool result is sent to
Tinker. The local route remains free. Remote `ask`, training, and upload routes
retain their explicit paid and data-upload gates.

## What the primary sources establish

1. The [Tinker quickstart](https://tinker-docs.thinkingmachines.ai/tinker/quickstart/)
   covers hosted training and sampling clients. It is not an operating-system
   agent runtime.
2. The official [Tinker cookbook](https://github.com/thinking-machines-lab/tinker-cookbook)
   implements tool-use environments in which the host validates and executes a
   model's calls and returns results. Tool access is therefore a property of the
   host loop, not of the API key or weights.
3. [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)
   accepts JSON-schema tools, returns `message.tool_calls`, and expects the host
   to append `role=tool` observations before the next model turn.
4. [Ollama vision](https://docs.ollama.com/capabilities/vision) accepts images
   only for a multimodal model. The deployed Tinker Qwen3 planner tag advertises
   tools, thinking, and completion, but no vision.
5. [Ollama vision](https://docs.ollama.com/capabilities/vision) documents the
   local image message contract. The compact official
   [Qwen3-VL Ollama model](https://ollama.com/library/qwen3-vl) is used as the
   optional screenshot reader. Its 4B instruct tag emits direct grounded UI
   descriptions; the default thinking tag can spend a short response budget on
   reasoning without producing an answer. The compact model avoids duplicating
   Hermes' pinned 9B/64K model in memory.
6. Hammerspoon exposes structured macOS Accessibility through
   [`hs.axuielement`](https://www.hammerspoon.org/docs/hs.axuielement.html) and
   screen capture through [`hs.screen`](https://www.hammerspoon.org/docs/hs.screen.html).
   Its existing signed app process already holds the fleet's macOS permissions,
   so a fixed Lua dispatcher avoids a second unsigned TCC identity.

## Implemented computer contract

| Tool | Host behavior |
|---|---|
| `computer_state` | Frontmost app/window, focused element, bounded AX targets, screens, mouse, Accessibility and secure-input state |
| `computer_screenshot` | Private mode-0600 screenshot, local Tesseract OCR, optional downsampled local Qwen3-VL 4B instruct analysis |
| `computer_activate_app` | Launch or focus by app name or bundle identifier, then return fresh state |
| `computer_click` | Prefer `AXPress` for a fresh target; otherwise bounded coordinate click, then fresh state |
| `computer_type` | Type into the current focused element, then fresh state |
| `computer_key` | Send one bounded key chord, then fresh state |
| `computer_scroll` | Send a pixel scroll event, then fresh state |

The model never supplies Lua or shell to the computer dispatcher. Python writes
a private JSON request and invokes one fixed module. Read-only state and
screenshot operations may retry once after a transient Hammerspoon IPC failure.
Mutating actions never retry automatically, preventing duplicate clicks or
typing.

## YOLO and authority boundaries

Routine navigation, app focus, editing, clicking, typing, and scrolling execute
automatically. The host—not the model—requires one-time confirmation for:

- send, submit, post, publish, delete, payment, purchase, and account actions;
- secure fields, credentials, passcodes, tokens, and API keys;
- Enter/Return/Delete and Cmd-W/Cmd-Q key chords.

File/web/screen observations are untrusted input. The host strips secret-like
child environment variables, bounds output, hashes receipts, and never persists
typed text or screenshot questions in receipt metadata.

macOS TCC is an operating-system boundary. Full computer use works only inside
an unlocked GUI user session where Hammerspoon has Accessibility and Screen
Recording permission. A model, API key, shell flag, or YOLO label cannot bypass
the lock screen or a missing TCC grant. The host reports `screenLocked=true`
when available, caches that fresh state, and rejects actions before IPC. macOS
may also suspend screenshot IPC while locked; that is returned as a bounded
tool error.

## Stall and recovery contract

- The planner auto-starts a dedicated loopback-only Ollama daemon on port
  11436. It uses the same local model store, disables cloud access and pruning,
  and never stops or reconfigures the shared Hermes daemon on port 11434.
- Port 11435 is deliberately not used: the Mac mini already runs the Hermes
  OpenAI compatibility shim there. Readiness checks require Ollama's API, so a
  foreign listener is rejected instead of being mistaken for the model server.
- Optional screenshot vision runs sequentially on that same isolated endpoint.
  It may visibly switch between the Tinker planner and compact Qwen3-VL, but it
  cannot queue behind or evict models used by shared Hermes clients.
- Each local planner request defaults to a 120-second socket ceiling rather
  than the prior silent 600 seconds.
- A progress heartbeat begins after eight seconds and repeats every ten.
- The client reports when Ollama is switching away from another loaded model.
- `think=false` prevents long hidden reasoning in this interactive route.
- Ctrl-C cancels the current request and keeps the REPL alive.
- Transport and timeout errors return to the REPL rather than exiting it.
- Maximum turns, maximum tool calls, and a third-identical-call breaker bound
  model loops.

## Live fleet findings

The July 21 audit found Hammerspoon, its `hs` CLI, Tesseract, and Accessibility
authorization on both the MacBook Pro and Mac mini. On the MacBook Pro, the
planner called both `computer_state` and `computer_screenshot`; Hammerspoon
captured 3024x1964 pixels, local OCR ran, and Qwen3-VL 4B instruct returned a
non-empty grounded description. On the Mac mini, the same source planner called
`computer_state` and `computer_screenshot`, ran local Qwen3-VL, and returned the
observed frontmost app after automatically starting isolated Ollama on loopback
port 11436. Exact merged runtime proof on both hosts remains the release gate;
source capability alone is not deployment proof.

## Why this implementation, not a new native daemon

The deep-research report also evaluated ScreenCaptureKit, direct AXUIElement,
CGEvent, Playwright/CDP, and a two-process planner/actuator design. Those are
reasonable future hardening paths for a notarized product. For this fleet CLI,
the smallest reliable step is a narrow Hammerspoon actuator because it is
already installed, signed, permissioned, scriptable through a fixed IPC
surface, and independently testable. Browser-specific CDP can be added later
without weakening the current host confirmation boundary.

## Release gates

- Hermetic tests cover native and tagged tool calls, bounded requests, false
  no-access correction, loop breaking, private receipts, all computer actions,
  confirmation gates, and non-duplicating retries.
- A live local proof must execute planner-selected filesystem and computer-state
  calls, plus private screenshot/OCR/vision perception.
- Both Macs must run source files that hash to the merged commit.
- Provider calls and dataset upload are forbidden during local proof.
