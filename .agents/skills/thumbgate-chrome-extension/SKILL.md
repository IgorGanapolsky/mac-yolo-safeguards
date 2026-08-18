---
name: thumbgate-chrome-extension
description: ThumbGate Manifest V3 Chrome Extension Suite. Provides in-browser pre-action web interdiction, floating 👍/👎 memory capture on ChatGPT/Claude, and Chrome Web Store packaging.
---

# ThumbGate Chrome Extension Skill

Implements the official Manifest V3 Chrome Extension for ThumbGate (thumbgate.app):
1. **Web Action Interdiction**: Intercepts destructive buttons (Stripe payments, AWS instance termination, GitHub repo deletion) before DOM events fire.
2. **Floating Memory Capture HUD**: Injects 1-click 👍/👎 capture onto ChatGPT, Claude, and Gemini web UIs.
3. **Budget & Pacing HUD**: Real-time monthly spend pacing overlay in the popup.
4. **Automated Packaging**: Builds `dist/thumbgate-chrome-extension.zip` for instant Chrome Web Store publishing.

## Global System Commands

- **`bin/thumbgate-extension --doctor`**: Health-checks extension assets and manifest integrity.
- **`bin/thumbgate-extension --package`**: Compiles and outputs `dist/thumbgate-chrome-extension.zip`.

## Verification

```bash
# Doctor Status Check
bin/thumbgate-extension --doctor

# Run Automated Test Suite
node tests/test-thumbgate-chrome-extension.js

# Build Release ZIP Bundle
bin/thumbgate-extension --package
```
