---
name: scheduled-publish-preflight
description: >
  Preflight for any scheduled, unattended, or cron-fired publishing run (ThumbGate
  content engine, social fan-out, longform syndication, outreach sends) BEFORE
  drafting or posting anything. Establishes the real date, detects whether this
  session is on Igor's Mac or an ephemeral cloud container, probes publish
  capability for real, and checks today's other runs for a duplicate beat
  including UNMERGED branches and open PRs. Use this whenever a run is about to
  write a content log row, pick a persona/beat, choose a branch or campaign id,
  or record a channel as Blocked — and especially when you are tempted to reuse
  a date or a blocker reason from a previous run instead of re-deriving it.
  Pairs with the blocked-run-still-ships skill, which governs what a run must
  produce once this preflight says publishing is impossible.
---

# Scheduled publish preflight

Scheduled runs fail in a specific, boring way: they inherit stale assumptions from the
previous run and then build an entire run on top of them. Four consecutive ThumbGate runs
(2026-08-05 → 2026-08-10) burned their budget this way. Every failure below actually
happened; none of them were caught by the run that made them.

Run these four checks first. They cost about a minute together and they protect everything
downstream.

## 1. Establish the date from the clock, never from the repo

```bash
date -u +%Y-%m-%d
```

Cross-check it against the date in your system context. If they disagree, stop and say so —
do not pick one silently.

**Why this is first:** on 2026-08-10 a run read the branch `content/2026-08-06-am` and the
last log row (`2026-08-05`), inferred "today is 2026-08-06," and was wrong by four days.
That single bad inference produced a wrong campaign id, a wrong branch name, a wrong PR
title, wrong dates in every log row — and, worst, it made the run read the *wrong* morning
run in check 4, so it duplicated that day's persona and meme. A whole run had to be closed
and redone.

Repo artifacts tell you what happened last time, never what time it is now. The most recent
branch or log row is a lagging indicator, and on a run that fires late or after a gap it is
guaranteed to mislead.

## 2. Detect where you are actually executing

```bash
uname -s -m; hostname
echo "$CLAUDE_CODE_REMOTE / $CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE"
ls ~/.config/google-chrome ~/.config/chromium 2>/dev/null || echo "no browser profile"
```

Two very different worlds, and the right strategy differs completely:

| Signal | Where you are | What publishing looks like |
|---|---|---|
| `Darwin`, no `CLAUDE_CODE_REMOTE` | Igor's Mac | Browser MCP / BrowserOS and the macOS Keychain secret-store exist. Session-based publishing can work. |
| `Linux`, `CLAUDE_CODE_REMOTE=true`, `cloud_default` | Ephemeral cloud container | No logged-in browser, no Keychain, no desktop. Only env-var tokens and MCP servers with completed OAuth can publish. |

**Why this matters more than it looks:** for months, runs recorded "no browser MCP available"
as if it were a transient tool outage. It isn't — it is a permanent property of the cloud
container, and it will never resolve on its own. Naming the environment converts an
apparently mysterious recurring blocker into a one-time infrastructure decision for the
operator (move the schedule to the Mac, or provision API tokens).

A related trap: a browser existing in the container is not the same as a *logged-in* browser.
This container ships Chromium via Playwright with no profile and no cookies. Driving it to a
Google-SSO'd service lands on a sign-in wall on an unrecognized device. Never type a password
to get past one — that rule exists because credentials leaked into transcripts twice.

## 3. Probe publish capability before writing "Blocked"

Run the bundled probe:

```bash
bash .claude/skills/scheduled-publish-preflight/scripts/publish-capability-probe.sh
```

It checks, in one pass: execution environment, the macOS Keychain secret-store, social
tokens in env, `.env` files, `~/.hermes`, browser profiles, and browser binaries — then
prints a verdict per publishing route.

For Zapier, check connections rather than enabled actions, because they are different things:

- `inspect_zapier_actions` shows what is *enabled*. An app can be enabled with zero
  authorized accounts, which looks like availability and is not.
- `list_zapier_connections({selected_api})` returns the connections that actually exist.
  An empty array `[]` is the real answer.

**Why:** three runs logged "no dev.to API key configured" without ever looking for one.
That is a guess wearing the costume of a finding, and it is worse than no note at all —
the next run trusts it and re-guesses. A blocker you have not tested is not a blocker,
it is a hypothesis.

When you do record a blocker, record the *evidence and the remedy*: the exact tool call and
its result, plus the auth URL or the missing env var name. "Blocked" alone forces the next
run to redo this work; "`list_zapier_connections` → `[]`, auth at <url>" lets it skip
straight past.

Also note which single unblock has the widest blast radius. A Buffer connection covers
LinkedIn, X, Bluesky and Threads at once — worth naming explicitly so the operator fixes
one thing instead of four.

## 4. Check today's other runs — including unmerged work

```bash
git fetch origin --quiet
git branch -a | grep content/          # find today's AM/PM branches
git show origin/content/<today>-am:docs/social/hermes-mobile-content-log.tsv | grep "^<today>"
```

Then list open PRs and read the same-day one. **Content PRs frequently sit unmerged**, so
`main` alone will not show you what today's other run did — on 2026-08-10 the morning run
lived only in PR #1595 and was invisible from `main`.

Compare against the other run and confirm you differ on **persona, pain, hook, and meme**.
Overlapping on any one of them is a same-day duplicate. Record the comparison as a small
table in your output so the difference is auditable rather than asserted:

| | AM run | This run |
|---|---|---|
| Persona | … | … |
| Pain | … | … |
| Hook | … | … |
| Meme | … | … |

A genuinely good move here is to make your beat the *inverse* of the morning's rather than
merely a different topic — e.g. AM ran "nobody was watching," PM ran "someone was watching
and still missed it." Same territory, opposite claim, no cannibalization.

## Then, and only then

Draft. Anything you assert in the copy still needs its own live verification, and anything
that fails re-verification gets dropped rather than softened — see the
`blocked-run-still-ships` skill for the claim discipline and for what a run owes the
operator when publishing turns out to be impossible.
