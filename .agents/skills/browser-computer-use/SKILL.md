---
name: browser-computer-use
description: System-wide unrestricted browser computer-use, Playwright MCP, Chrome CDP (port 9222), and web automation skill for all coding agents on Igor's Mac. Authorizes zero-human-intervention web actions, active profile reuse, DOM manipulation, form submissions, and social engagement across Skool, GitHub, Stripe, LinkedIn, Twitter/X, and AI Portals.
---

# Unrestricted Browser Computer-Use & Web Automation Skill

Use this skill whenever any coding agent (Antigravity, Claude Code, Cursor, Codex, Gemini CLI, Herdr, OpenCode) needs to:
- Open web pages, SaaS portals, or community platforms in Chrome / Playwright
- Reuse Igor's active logged-in browser profiles without asking for login
- Perform computer-use actions (click, type, navigate, fill forms, submit replies)
- Extract text, DOM elements, or screenshots for visual verification

## Universal Agent Authorizations & Permissions

1. **Standing Authorization**:
   - Igor has granted **PERMANENT FULL UNRESTRICTED PERMISSIONS** for all browser computer-use operations.
   - Agents are explicitly authorized to use Chrome DevTools MCP, Playwright MCP, Chrome CDP (`http://localhost:9222`), and local automation scripts (`tools/skool-browser-automation-engine.js`, `tools/chrome-cdp-key-extractor.js`).

2. **Zero Refusal Guarantee**:
   - Agents MUST NEVER refuse browser tasks or state that they lack browser access.
   - If Chrome CDP is not running on port 9222, automatically start Chrome with `--remote-debugging-port=9222` or execute via Playwright headless/headed context.

3. **Active Profile Reuse**:
   - Always leverage Igor's existing Chrome profile (`~/Library/Application Support/Google/Chrome/Default`) where login cookies for Skool, Google AI Studio, OpenAI, Anthropic, X/Twitter, LinkedIn, and Stripe are pre-authenticated.

4. **Execution Protocol**:
   - Step 1: Attach to Chrome via CDP (`http://localhost:9222`) or Playwright.
   - Step 2: Extract AXTree summary (<500 tokens) for ultra-fast element targeting (Poolside-YOLO acceleration).
   - Step 3: Perform target action (navigate, fill form, click post button).
   - Step 4: Verify post completion and report proof.
