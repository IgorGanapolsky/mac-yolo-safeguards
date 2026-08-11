---
name: content-engine-capability-gate
description: Mandatory capability gate for any ThumbGate/Hermes content-engine run. Use BEFORE drafting or publishing any post, on every scheduled or manual content run, to determine which channels this host can actually publish to. Triggers on - content engine, ThumbGate promo, post everywhere, scheduled content run, publish to LinkedIn/X/Bluesky/Threads/Medium/dev.to, morning run, PM run, fan-out.
---

# Content-engine capability gate

**Run this before writing a single word of content. Not after. Not "if something fails."**

## The incident this prevents

2026-08-11 AM run. The scheduled engine fired inside a **remote Linux container**, not on
Igor's Mac. The engine spec assumes a signed-in Chrome reachable via `claude-in-chrome`
(deviceId `86cd84ae-9b4c-43d2-983c-4d66cb5d2cb7`). In that container there was no Chrome,
no BrowserOS, no Comet, no cookie jar, and no browser MCP tool at all.

The agent discovered this **one channel at a time, mid-run**, after the content was already
written. Result: 1 of 9 channels published, eight "Blocked" rows, and a run report that read
like a series of excuses. A second pass recovered LinkedIn (bringing it to 2 of 9) only
because a human pushed back.

The bug was never the missing browser. **The bug was starting a run without knowing what it
could reach.** A run that knows it can reach two channels writes for two channels and ships
two. A run that assumes nine and discovers two writes nine and ships one.

## Step 1 — Detect, don't assume

```bash
# First inspect Buffer's actually-connected channels via the Zapier MCP
# (inspect_zapier_actions -> buffer_add_to_queue -> enum channelId),
# then pass them in. An ENABLED app with ZERO connections is NOT a channel.
BUFFER_CHANNELS="LinkedIn,Instagram" ./scripts/content-engine-preflight.sh
```

- **exit 0** → stdout is your publish set. Write for exactly those channels.
- **exit 10** → zero channels reachable. **Abort the run.** Do not produce drafts.
  Report the capability gap to the operator and stop. A run that ships nothing but
  drafts has burned a slot and produced no distribution.

## Step 2 — The two host paths, and what each can actually do

| Host | Detect | Publishes via | Reaches |
|---|---|---|---|
| **Mac with signed-in browser** | `uname -s` = Darwin **and** a non-empty `Cookies` file under Chrome/BrowserOS/Comet | `claude-in-chrome` MCP against the live session | Everything: LinkedIn, X, Bluesky, Threads, Medium, dev.to, Skool |
| **Headless cloud container** | anything else | Zapier MCP → Buffer only | Only Buffer's *connected* channels |

## Step 3 — Rules that are not negotiable

1. **A browser binary is not a capability.** Chromium ships in the cloud container. It has
   an empty cookie jar. Driving it reaches a login wall, and typing credentials into that
   wall is a hard ban — from the engine spec and from Claude Code's own guardrails. So the
   capability test is **for authenticated session state**, never for an executable.
   "Chromium exists" is not a reason to claim a channel is reachable.

2. **An enabled Zapier app with 0 connections is a login wall with extra steps.** On
   2026-08-11 both Bluesky and Threads were *enabled* and reachable-looking, and both had
   zero connected accounts. OAuth needs a human. Count connections, not apps.

3. **Never guess an account identity.** If a publisher exposes two plausible accounts
   (Buffer did — two LinkedIn profiles), resolve it from evidence: grep the repo for the
   vanity URL, check which one prior published posts came from. If evidence does not settle
   it, log Blocked and ask. A wrong-account post is worse than no post. On 2026-08-11 the
   correct profile (`igor-ganapolsky-859317343`) was confirmed by 5 repo citations naming it
   as Igor's; the other appeared nowhere.

4. **"Sent" is not "published."** Buffer returns `status: sent` before the network call
   resolves. A post is Published only when it has a `service_update_id` **and** its public
   URL was fetched back and matched. LinkedIn on 2026-08-11 returned `sent` with no
   `service_update_id` for ~20 seconds. Without both, the row is Blocked.

5. **Never spend money.** No credits, no upgrades, no payment methods, no checkout — on
   Zapier, Higgsfield, Gamma, or anything else. Blocked-and-move-on beats a purchase.

## Step 4 — Report the gap as a fix, not an excuse

When channels are unreachable, the run report must name **the change that would make them
reachable next time**, addressed to the operator:

- Blocked because the host has no signed-in browser → *"run this schedule on the Mac, or
  connect these channels to Buffer so the cloud path reaches them."*
- Blocked because a Zapier app has 0 connections → *"connect X in Buffer/Zapier; it needs a
  one-time OAuth a human has to click."*
- Ambiguous account → *"disconnect the unused duplicate profile; it will re-trigger this
  every run."*

A "Blocked" row with an exact blocker and a named fix is honest engineering output.
A "Blocked" row that just says the thing didn't work is not.
