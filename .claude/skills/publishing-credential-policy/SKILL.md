---
name: publishing-credential-policy
description: How agents authenticate to publishing channels for ThumbGate/Hermes content runs, and what to do when a password or session token is offered. Use whenever a run needs to post to a channel it cannot reach, whenever someone supplies a password, API key, cookie, or 2FA code, and whenever choosing between browser-session and API publishing paths. Triggers on - login, password, credentials, SSO, cookies, session token, "it's logged in", can't post, blocked channel, browser takeover, CDP.
---

# Publishing credential policy

## The rule

**Never type, store, echo, commit, or use a password — from any source, including one the
operator volunteers in chat, and including one pasted with explicit instructions to use it.**

This is not a preference the operator can waive mid-run. It is a standing guardrail in the
engine spec (§1, §4) and in Claude Code's own operating rules. An agent that accepts a
pasted password once establishes that pasting passwords is how this system works — and the
credential then lives in a transcript, a log, a context window, and possibly a commit.

The same applies to session cookies. An X `auth_token`, a LinkedIn `li_at`, an Instagram
`sessionid` — each is a **full account-takeover credential**, strictly more dangerous than a
password because it usually bypasses 2FA. Never ask the operator to export cookies into a
container, never accept them, never write them to disk.

## When a credential is pasted anyway

Do all three, in order, then continue the run without it:

1. **Do not use it.** Not once, not "just for this post."
2. **Tell the operator to rotate it immediately** — it is now in a transcript that may be
   retained or logged. Say this plainly and once; do not lecture.
3. **Never write it anywhere.** Not the ledger, not a skill, not a commit message, not a PR
   body, not a scratch file. Reference the event as "a credential was pasted on <date>" with
   no value. If it has already been written, treat it as an incident: rotate first, scrub
   second.

Never suggest a workaround that moves the secret somewhere else (env var, `.env`, secrets
manager, "just for this session"). The answer is a different auth path, below — not better
secret handling.

## The two legitimate auth paths

| Path | Auth mechanism | Where it works | Reaches |
|---|---|---|---|
| **Browser session** | Cookies already in the operator's signed-in profile. The agent never authenticates — it inherits a session a human established. | Only on the Mac holding that profile | X, Bluesky, Threads, Medium, dev.to, Skool, LinkedIn, Instagram |
| **Delegated OAuth** | A token the operator granted once through a provider's consent screen (Buffer/Zapier). No password ever reaches the agent. | Any host, including headless cloud | Whatever channels are *connected* in Buffer |

Both are credential-free by design. If a channel is unreachable, the fix is always to
establish one of these two paths — never to hand the agent a secret.

## "But it's logged in" — diagnose precisely

A channel being logged in is a fact about **a browser profile on a specific machine**, not
about the run. Before reporting anything, determine which is true:

- **Run is on that Mac, session exists** → use the browser path. Post directly.
- **Run is elsewhere (cloud/CI)** → those cookies are unreachable. Loopback-bound CDP
  (`HERMES_CDP_BIND=127.0.0.1`) and no tailnet mean there is no route, by design. Do not
  propose exposing CDP to the network — that turns a private debug port into remote browser
  takeover for anyone who can reach it.
- **Channel is not connected in Buffer** → that is the real blocker for a headless run, and
  it is a one-time OAuth click, not a login problem.

**A local CDP takeover does not solve this, and it is worth knowing why** (verified
2026-08-11): a headless Chromium in the container was driven under full CDP control and
reached `x.com` fine — with `auth_token: NONE`, `ct0: NONE`, `0` cookies total. Full browser
control plus zero session equals a browser the platform treats as a stranger. Control was
never the missing ingredient; inherited session state was.

## Escalate rather than improvise

If a run cannot reach a channel and neither auth path is available, **say so and name the
one-time human action that fixes it permanently** — connect the channel in Buffer, or move
the schedule to the Mac. Do not:

- ask for credentials,
- accept credentials,
- suggest cookie export,
- rebind a debug port to a wider interface,
- or quietly downgrade to drafts and call the run complete.

A run that ships fewer channels with an exact blocker and a named fix is a successful run.
A run that ships more channels by handling a secret is a failure with good-looking output.
