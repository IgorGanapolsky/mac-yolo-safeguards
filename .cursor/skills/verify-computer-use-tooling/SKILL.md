---
name: verify-computer-use-tooling
description: >
  One-shot readiness check for agentic browser/Computer-Use automation.
  Confirms which Computer-Use SDKs are installed vs missing, the live
  vision API beta header, and the local CDP Chrome state. Use BEFORE
  claiming a browser-automation path is wired.
safety: read-only checks only (no browser writes, no sends).
---

# verify-computer-use-tooling

Run every time you plan to drive a browser with a vision model (Anthropic
Computer Use, OpenAI Operator, Browser-use). Do NOT trust earlier notes.

## Commands (run together)

```bash
echo "=== Node ==="
node -e "try{console.log('playwright',require('playwright/package.json').version)}catch(e){console.log('playwright: MISSING')}"

echo "=== Python ==="
for L in playwright browser_use anthropic openai; do
  python3 -c "import $L,sys;print('$L OK',getattr($L,'__version__','?'))" \
    2>/dev/null || echo "$L: MISSING"
done

echo "=== Vision API keys (masked) ==="
test -n "$ANTHROPIC_API_KEY" \
  && echo "ANTHROPIC_API_KEY set ${ANTHROPIC_API_KEY:0:6}****" \
  || echo "ANTHROPIC_API_KEY: UNSET  <- gate for Anthropic Computer Use"
test -n "$OPENAI_API_KEY" \
  && echo "OPENAI_API_KEY set ${OPENAI_API_KEY:0:6}****" \
  || echo "OPENAI_API_KEY: UNSET  <- gate for OpenAI Operator"

echo "=== Dedicated CDP Chrome (port 9222, NOT interactive Chrome) ==="
curl -sf --max-time 4 http://127.0.0.1:9222/json/version \
  && echo "CDP reachable" \
  || echo "CDP NOT reachable (no dedicated Chrome)"
```

## Truth table (August 2026)

| Layer | Status | Notes |
|-------|--------|-------|
| Playwright | deterministic automation | v1.62.1 locally (Node). NOT a vision engine. |
| `browser_web_enable_vision` flag | **does not exist** | Unverified claim; ignore. Vision is external. |
| Anthropic Computer Use | `computer-use-2025-11-24` beta | tool type `computer_20251124` + `text_editor_20250728` + `bash_20250124`. Requires `ANTHROPIC_API_KEY`. |
| Browser-use v1.0 | stable (Python+Playwright+vision) | 21K★. `pip install browser-use`. |
| OpenAI Operator API | GA (Apr 16 2026) = "Codex Background Computer Use" | Requires OpenAI SDK/key. |

## Local verdict (recorded 2026-08-07; updated 2026-08-08)

- Playwright 1.62.1 present ✓ (Node)
- browser-use 0.13.7 INSTALLED+VERIFIED ✓ (.venv-cdp; drives CDP :9222, no tab-enumeration hang;
  `BrowserSession(cdp_url="http://127.0.0.1:9222")` constructs + navigates an isolated `data:` page OK)
- browser-use v1.0 vs 0.13.7: installed latest stable resolved to 0.13.7 — API uses
  `BrowserSession`/`browser_use.browser`, NOT v1.0 `Browser`/`BrowserConfig`. Adapt imports.
- anthropic SDK present via browser-use extras; ANTHROPIC_API_KEY UNSET in env ✓ (missing)
- openai SDK NOT installed (not on critical path)
- CDP Chrome 151 on :9222 reachable ✓ (Stripe+Reddit sess live)

Gate before any browser-automation side effect: provide `ANTHROPIC_API_KEY` (Keychain missing,
see source-computer-use-api-key skill). The CDP runtime layer is ALREADY wired without it
(deterministic only); vision calls are the only blocked step.
