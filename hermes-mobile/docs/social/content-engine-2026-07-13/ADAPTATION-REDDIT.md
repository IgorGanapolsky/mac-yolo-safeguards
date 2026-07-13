# ADAPTATION — Reddit r/cursor (GitHub only)

**Subreddit:** r/cursor  
**Rules:** disclose builder; limitations-first; GitHub hermes-mobile tree ONLY; no Play/pricing/Leash/vote CTA; single sub.

## Title

Turns out "Auto-Run in Sandbox" silently ignores your Command Allowlist (acknowledged by staff), and the docs literally say the allowlist is "not a security boundary" — so what's your actual boundary?

## Body

I switched to Auto-review recently and, because it runs way more tool calls without asking me, I finally sat down and read the safety docs properly instead of trusting the settings UI. Three things I didn't expect:

**1. The docs disclaim the allowlist outright.** From Cursor's LLM safety and controls page, verbatim:

> "The allowlist is best-effort, not a security boundary. Determined agents or prompt injection might bypass it."

Credit where due — that's an unusually honest sentence for vendor docs. But it means the control most of us configured first is officially advisory.

**2. Sandbox mode doesn't layer on top of the allowlist — it replaces it, silently.** There's a forum thread ("Command Allowlist is silently ignored when Auto-Run in Sandbox is enabled") where a user found that with Auto-Run in Sandbox on, commands execute with no allowlist check at all. A Cursor team member replied that this is a known issue: sandbox intentionally swaps per-command approval for filesystem/network restrictions, and the UI is misleading about it. Suggested workaround was the Legacy Terminal Tool. That reply was from February — if this has changed since, genuinely happy to be corrected, but I couldn't find a fix announcement.

**3. In Auto-review, everything that clears the allowlist/sandbox goes to an LLM classifier** that decides allow vs. block based on safety and intent-match. So the judgment call on the riskiest 5% of commands is itself a model.

To be fair to the design: fs + network restrictions are arguably a *stronger* boundary than string-matching command names, and the docs saying so beats pretending otherwise. My problem isn't the architecture, it's that the settings screen reads like defense-in-depth while the runtime behavior is either/or — I thought I had two layers and I had one.

So, actual question for people running Auto-review daily: **what do you treat as the real boundary?** The sandbox restrictions? The "require approval for destructive commands" toggle? Git hygiene (worktrees, no push creds in the env)? Something out-of-band entirely?

Disclosure so this isn't stealth-promo: this rabbit hole started because I build a phone-side approval gate for coding agents (approve/deny cards for risky tool calls before they execute). Honest limitation: it only gates agents routed through its own gateway — it does **not** hook Cursor's runner natively today, so it doesn't solve this for Cursor users; posting because the "which layer am I actually trusting" question stopped being theoretical for me. Code's here if you're curious: https://github.com/IgorGanapolsky/mac-yolo-safeguards/tree/main/hermes-mobile
