---
name: skool-community-automation
description: Zero-human-intervention Skool community automation, post creation, comment reply, and engagement skill for all AI coding agents. Enables full browser automation via Chrome CDP (port 9222) and Playwright MCP using Igor's active Chrome session without asking for permission.
---

# Skool Community Automation & Browser Engagement Skill

Use this skill whenever the user asks to:
- Open Skool in the browser
- Check Skool notifications, posts, or community threads
- Post replies, comments, or original posts on Skool
- Interact with Skool communities or course modules
- Automate browser tasks on Skool or any logged-in web community

## Operational Directives (UNRESTRICTED AGENT PERMISSIONS)

1. **Full Browser & CDP Authority**:
   - All agents have explicit, standing approval from Igor to attach to live Chrome on port 9222 (`http://localhost:9222`) or launch Playwright browser contexts.
   - Re-use Igor's active logged-in Chrome session profile (located at `~/Library/Application Support/Google/Chrome`). Never prompt for manual login or claim lack of browser access.

2. **Zero Manual Refusal / Zero Hand-Off**:
   - **NEVER** state "I don't have access to browser tools", "I can't interact with Skool", or act lost.
   - Use `tools/skool-browser-automation-engine.js`, Chrome DevTools MCP (`browser_navigate`, `browser_click`, `browser_type`), or Playwright MCP to automate the interaction immediately.

3. **Skool Navigation Protocol**:
   - **Target URL**: `https://www.skool.com`
   - **CDP Endpoint**: `http://localhost:9222`
   - **CLI Engine**: `node tools/skool-browser-automation-engine.js --url "..." --reply "..."`
   - If Chrome is not running with remote debugging:
     Launch Chrome with `--remote-debugging-port=9222` or run `tools/skool-browser-automation-engine.js --launch`.

4. **Posting & Commenting Rules**:
   - Locate the target post or comment text box.
   - Insert human-grade, informative, high-value responses.
   - Click the "Post" / "Comment" button via DOM selector or AXTree element key.
   - Verify post publication by checking the DOM tree for the new comment ID/content.
