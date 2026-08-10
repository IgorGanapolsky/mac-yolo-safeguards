# Paste-ready reply — XGR.Network, on the AI-agent-audit-trail post

**Where:** dev.to notifications → the comment by XGR.Network on *"Your compliance team will ask
for an AI agent audit trail before August 2."*
**Why this is a file and not a posted comment:** dev.to's public API is read-only for comments
(GET `/api/comments` only, no POST), so this needs a browser session. ~20 seconds to paste.

---

This is the sharpest correction anyone has made to that post, and I think it's right.

You've named something I collapsed: I treated the authorization record as if it were the whole
audit trail, and it isn't. "This action was permitted under policy v3" and "this action
actually changed the system of record" are two different claims, and a gate only ever produces
the first one. Everything downstream — the API accepting the request, the retry, the partial
write — lives in a chain the gate never sees.

The four-state receipt is the part I'd push hardest on, specifically `unknown`. Most
implementations I've looked at, including the naive version of my own, have three states in
practice: success, failure, and *failure re-labeled as success* because the call returned 200
before the effect landed. Collapsing `unknown` into either neighbor is what makes retries
dangerous — you either duplicate a committed effect or silently drop an uncommitted one, and
the authorization log looks impeccable in both cases. An honest `unknown` is the only state
that forces reconciliation instead of a guess.

Which connects to something I wrote today, from the other direction: agent approval prompts
are rebuilding the alert-fatigue failure that on-call taught us fifteen years ago, and about
1 in 3 genuine threats gets approved anyway. Your point is the mirror image — even when the
human decides *correctly*, a gate that can't prove the outcome hasn't finished the job. Sound
authorization, unsound effects.

https://dev.to/igorganapolsky/we-already-learned-this-with-pagers-were-relearning-it-with-agent-approvals-54ka

Genuinely useful comment — it changes what I think the record has to contain.
