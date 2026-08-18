---
name: blocked-run-still-ships
description: >
  What a content or outreach run must still deliver when publishing turns out to be
  impossible, and how to keep every claim honest. Use when a scheduled ThumbGate
  content run, social fan-out, or longform syndication hits a credential/OAuth/browser
  blocker; when about to log a channel as Blocked; when writing a run's PR body,
  ledger, or operator notification; when generating a meme and Higgsfield has no
  credits; or when a fact you asserted earlier fails to reconfirm on re-fetch. Reach
  for this whenever you are tempted to end a run with only blocker notes, to soften a
  claim you can no longer verify, or to invent some publishable surface just so the
  run has a URL to show. Pairs with scheduled-publish-preflight, which diagnoses
  whether publishing is possible in the first place.
---

# A blocked run still ships

Being unable to publish is not the same as having nothing to deliver. Three consecutive
ThumbGate runs (2026-08-05 pm, 08-06 am, 08-10 pm) ended with a log full of `Blocked` rows
and nothing else. Each one had done real research and real thinking; each one threw it away
and made the next run start from zero. The operator's reaction was the correct one: *"you
should never be blocked."*

The blocker was genuine. The empty-handedness was a choice.

## Ship the artifacts anyway

When the preflight says no channel can publish, the run's job changes from *publish* to
*make the next publish a paste*. That means finishing the work, not describing it:

- **The longform piece, written in full.** Not an outline, not a "draft pending" note. If
  the angle is good enough to publish it is good enough to finish.
- **The image, actually generated and actually looked at.** See below.
- **Per-channel copy, final.** LinkedIn body plus its first-comment CTA, X within 280,
  Bluesky within 300, Threads within 500, longform tags, community-post phrasing. Written
  to a frozen file so the next run cannot silently reinterpret it.
- **The blocker with its remedy** — the exact failing tool call and the auth URL or missing
  env var, so nobody re-derives it.

A run that does this converts a blocked day into a stocked shelf. A run that logs `Blocked`
and stops converts it into nothing, and guarantees the next run spends its budget
rediscovering the same wall.

Then say plainly, in the PR body and the operator notification, that nothing published.
Ledger vocabulary is load-bearing: `Published` requires a URL you fetched back and confirmed
contains the intended content. Anything else is `Blocked`, `Skipped`, or `FROZEN`. A row that
says Published without a verified URL is the single most expensive error available here,
because every later run and every performance sweep treats it as ground truth.

## Generating the image when the usual tool is out

Order of attempts, and the reasoning:

1. **Check the balance before generating.** `mcp__Higgsfield__balance`. On a free plan with
   0.5 credits, generation will fail — find that out in one cheap call, not after a failed job.
2. **Fall back to Gamma** (`mcp__Gamma__generate_image`, poll `get_image_generation_status`).
   A run once logged "meme not generated — Higgsfield credits insufficient" while Gamma sat
   connected and funded in the same session. Being blocked on one vendor is not being blocked.
3. **Never top up, upgrade, or open checkout** on any service. This is an absolute standing
   rule after an unauthorized $588 charge. Spending existing credits is fine; acquiring more
   is not, no matter how small.
4. **Look at the image before you commit it.** Read the downloaded PNG. A generated image
   routinely renders text wrong or misses the joke entirely, and neither the prompt nor the
   "completed" status tells you that — only your eyes do.
5. **Originals only.** Generate the visual; never reuse a copyrighted film/TV still or a
   trademarked meme template. Log the concept as a dedup key (e.g.
   `worn-approve-pristine-deny`) so it is not reused within 30 days.

The joke has to land on the actual pain — a runaway loop, a 3am approval, a surprise bill —
not on generic AI-hype humor. A meme that could headline any AI product is noise.

## Claim discipline

Every factual claim needs a source fetched *in the run that publishes it*, with a date. Two
specific failure modes, both of which happened:

**Re-verify, and drop what fails.** A run cited a thread's point and comment counts from an
earlier search; on re-fetch the items API returned null for points. The right move is to
delete the claim, not to hedge it into "hundreds of points." A dropped claim costs one clause;
an invented one costs the credibility that is the only asset this product has.

**Date every reference.** The same run described a four-day-old thread as "today's," purely
because it had the date wrong. Write the actual date rather than a relative word — relative
words silently rot, and "today" is a claim like any other.

Prices are the sharpest case: read them live every run, never from memory or from a previous
log row. And keep the free things clearly free — approve/deny gating is free on web and
mobile, and copy must never imply a price is required for it.

**Check that your instrument could actually see what you claim.** A run reported that
`social-publish-gate.js` "returns BLOCK but exits 0, so callers must parse stdout rather than
`$?`" — a scary-sounding finding about a safety gate, and completely false. It came from
running the gate through a pipe, where `$?` reports the last element of the pipeline (`head`)
rather than `node`. Tested without the pipe, the gate is correct: exit 1 on BLOCK, 0 on ALLOW.

```bash
node tools/social-publish-gate.js --platform X --campaign Y >/dev/null 2>&1; echo $?   # real
node tools/social-publish-gate.js ... | head -2; echo $?                               # lies
```

The general form matters more than the example: a non-JS fetch can't see rendered UI, an
empty API result isn't proof of absence, a 429 means *unverified* rather than *verified
absent*, and a piped exit code isn't the command's exit code. Before reporting a finding —
especially one that indicts a safety mechanism — ask what the tool you used was actually
capable of observing, and re-run it a second way if the answer is surprising. Findings
inherited from a subagent deserve the same treatment; a plausible one repeated into a skill
or a log becomes tomorrow's false premise.

## First make sure you are actually blocked

Before shipping a draft instead of a post, try the token route — it needs no browser and no
Keychain, so it works from a cloud container:

```bash
node tools/social-publish.js --platform devto   --title "..." --body-file draft.md
node tools/social-publish.js --platform bluesky --text "..."
```

If `DEVTO_API_KEY` or `BLUESKY_HANDLE`/`BLUESKY_APP_PASSWORD` are set, you are not blocked and
this skill does not apply. Everything below is for when they are genuinely absent.

**Why:** four consecutive runs shipped drafts under "no publish path exists." That was true of
the browser and Keychain routes and false in general, and repeating it in the ledger taught
every later run to stop looking.

## Do not manufacture a publish

There is always some surface that would technically yield a URL — spin up a microsite, post
to a channel nobody reads. Resist it. A URL with no audience, created so the run has
something to show, is theater; reporting it as a publish is worse, because it makes a
blocked week look productive and delays the infrastructure fix that would actually help.

Skipping is a legitimate outcome. Say what you did not do and why, in one line, and let the
ledger be honest. The operator can only fix a blocker they can see clearly.

## Tell the operator the thing they can act on

Scheduled runs reach a human through one notification. Lead with the decision they own, not
with a status summary:

> Nothing published — 3rd consecutive run blocked on credentials. One Buffer OAuth would
> unblock LinkedIn/X/Bluesky/Threads at once: <auth url>. Article, meme and copy are written
> and waiting in PR #NNNN.

Name the single highest-leverage unblock rather than listing every broken channel. Four
blocked channels with four auth URLs reads as four chores; one Buffer connection that fixes
all four reads as a two-minute task, and that difference decides whether it gets done.

If the run also surfaced a systemic cause — the schedule firing in a cloud container that
structurally cannot hold a browser session — say that too. It is worth more than the day's
content, because it ends the whole class of failure instead of one instance of it.
