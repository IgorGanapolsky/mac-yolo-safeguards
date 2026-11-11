# macyolosafeguards.io funnel fixes

Audit date: 2026-11-10. This file is the change list for the live page at https://macyolosafeguards.io/.

The page's HTML is not in this repo, and it isn't in any other repo this audit could reach. Apply these edits wherever the site is deployed from, then move that source into `site/macyolosafeguards/` here so later fixes can go through PRs.

Items marked **[Igor]** need a decision or a dashboard change only the owner can make.

## Canonical offer names

Use exactly these names everywhere: the landing page, the Stripe and Gumroad product titles, `llms.txt`, and the README.

| Name | Price | Checkout | Where it lives |
|---|---|---|---|
| Mac YOLO Safeguards (free) | $0 | GitHub release DMG, Homebrew | GitHub |
| Mac YOLO Pro Guard | $19/month | `https://buy.stripe.com/cNi6oH1M81eSg4pdKz3sJ10` | Stripe |
| Agent Safeguards Playbook | $9.99 once | `https://iganapolsky.gumroad.com/l/odrkon` | Gumroad |
| Corporate-Expense Reliability Kit | $49 once | `https://iganapolsky.gumroad.com/l/vcrho` | Gumroad |
| Agent Reliability Diagnostic | $499 once | `https://buy.stripe.com/dRmeVd9eA4r4aK5gWL3sJ0Y` | Stripe |
| AI Agent Hardening Sprint | $1,500 once | `https://buy.stripe.com/4gM28r1M8g9M3hD0XN3sI38` | Stripe |

These match the product names in `tools/mac-yolo-stripe-provisioner.js`.

## 1. Make the checkout pages match the page (highest impact)

On 2026-11-10 the two Gumroad listings showed different names and a different brand from the landing page. **[Igor]** Rename them in the Gumroad dashboard:

| Listing | Title today | New title |
|---|---|---|
| `/l/vcrho` ($49) | ThumbGate Complete Production Rule-Pack & DPO/AKV Harness Kit (40 PreToolUse Gates + Multi-Agent Configs) | Mac YOLO Safeguards: Corporate-Expense Reliability Kit |
| `/l/odrkon` ($9.99) | The 2026 AI Agent Infrastructure & Cost Playbook (Laguna 2.1 DFlash + AKV Cache Engineering + PreToolUse Firewalls) | Mac YOLO Safeguards: Agent Safeguards Playbook |

Suggested first line of each Gumroad description:

- Kit: "LaunchAgent templates, the MCP guard server, pre-run gates and audit receipts for a team of Macs running AI coding agents. One-time $49."
- Playbook: "Step-by-step runbook for stopping runaway AI agents on your Mac: kill switches, timeouts and token budgets. One-time $9.99."

Also open the three Stripe links and confirm that each product name matches the table above. This audit couldn't load Stripe pages.

## 2. One main offer in the hero

The hero has five buttons today. Replace them with one paid button, one free button, and the Homebrew line under them.

```html
<h1>Stop Claude Code, Cursor and stuck MCP servers from freezing your Mac.</h1>
<p class="sub">
  A free menu-bar app that spots runaway AI agents and leftover MCP processes and shuts them down
  before your Mac runs out of memory. Apple-notarized. Telemetry off by default.
</p>
<div class="cta-row">
  <a class="btn primary" href="https://buy.stripe.com/cNi6oH1M81eSg4pdKz3sJ10">Get Pro Guard: $19/month</a>
  <a class="btn secondary" href="/go/dmg">Download free for Mac</a>
</div>
<p class="cta-note">Cancel any time. Free version stays free.</p>
<code>brew install --cask igorganapolsky/tap/mac-yolo-safeguards</code>
```

Move the $49 kit, the roaster and the critique box below the fold. Keep the four "path" cards, but point their buttons at `#pricing` so there is one place where people compare prices.

## 3. One name for the $499 offer

The page uses three names and two lengths for this offer: "Triage Sprint" (20 min), "Reliability Diagnostic" (48h trace), and "Live 20-Min Architecture Triage". Use this everywhere:

> **Agent Reliability Diagnostic ($499).** A 20-minute live call about one failure, then a written root-cause readout with prevention rules within 48 hours. No installation.

Fix the path card, the pricing row and `llms.txt`.

## 4. Say clearly what free includes and what Pro adds

Today the free download is described as the "HUD & reaper", and the Pro row lists "HUD + Reaper + MCP Guard" as what you pay for. Replace the Pro row with a two-column table:

| | Free | Pro Guard ($19/month) |
|---|---|---|
| Menu-bar memory and swap HUD | ✓ | ✓ |
| Stuck-process reaper (manual) | ✓ | ✓ |
| AI cache and log cleaner | ✓ | ✓ |
| MCP Guard: automatic shutdown of stuck MCP servers | | ✓ |
| _[Igor: second Pro-only feature]_ | | ✓ |

**[Igor]** The only Pro-only feature the current page names is "MCP Guard". Fill in anything else Pro really unlocks (for example, priority support), and move any row the free DMG already ships into both columns. Don't list a Pro feature that doesn't exist yet.

## 5. Trust signals and policy links

Add a short trust strip under the hero:

```html
<ul class="trust">
  <li>Apple-notarized (Team ID 9GMM26JC5X)</li>
  <li>Open source, MIT license: <a href="https://github.com/IgorGanapolsky/mac-yolo-safeguards">GitHub</a>
      <img alt="GitHub stars" src="https://img.shields.io/github/stars/IgorGanapolsky/mac-yolo-safeguards?style=flat"></li>
  <li>Telemetry off by default</li>
  <li>Built after a real incident: <a href="https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/docs/CASE-STUDY.md">load average 307 case study</a></li>
</ul>
```

Add to the footer: Refund policy, Privacy, Terms, Contact. Drafts are in `docs/legal/`. **[Igor]** Review them before publishing.

Add one line under each paid button: "Cancel any time. Refund within _[N]_ days, no questions asked." **[Igor]** Pick N (14 is common for developer tools) and use the same number in `docs/legal/REFUND-POLICY.md`.

When there are real quotes from users, add up to three under the trust strip. Don't add placeholder testimonials.

## 6. Plainer copy

Swap insider terms on the page for plain ones:

| Today | Plain version |
|---|---|
| Zombie MCP servers | Stuck MCP servers left running after an agent quits |
| exit code 3 protected | Won't touch sessions you marked as protected |
| EARS spec | (remove from the landing page) |
| PreToolUse Firewalls / DPO/AKV Harness | Pre-run safety checks |
| 13-Category Clean AI Waste | Clears 13 kinds of AI cache and log files |
| Runtime Circuit Breaker | Stops runaway processes automatically |

## 7. Fix `llms.txt`

Replace the live `/llms.txt` with `docs/landing/macyolosafeguards-llms.txt`. It removes the "$10/mo token budget gates" line (no tier costs $10/month on this site; that is ThumbGate's price) and the "5-Pillar Smart Care engine" name, and uses the canonical names and the single $499 description.

## 8. Smaller fixes

- Add a `/pricing` path that redirects to `/#pricing`. It returns an error today.
- Remove the empty code block between the roaster and the critique section, or fill it.
- After the edits, click every buy link once and confirm the product name and price.

## Context

- Repo telemetry in `tools/mac-yolo-release-cd-engine.js` records 11,462 visitors, 13 checkout starts in 24 hours, and 4 of 8 people who started the $499 checkout leaving from the Stripe cancel page.
- PR #2149 ("WebMCP landing tools") was a spec for the thumbgate.app landing page only. Nothing WebMCP-related shipped to macyolosafeguards.io.
