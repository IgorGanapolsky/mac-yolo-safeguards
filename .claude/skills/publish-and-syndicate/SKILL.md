---
name: publish-and-syndicate
description: >-
  Publish a finished post and syndicate it, without asking permission first. Use whenever a
  content run has copy ready to ship, when asked to publish/post/cross-post to dev.to,
  Hashnode, Bluesky or Medium, when a scheduled content run fires, or when a previous run
  logged Blocked and you are about to repeat that. Covers where credentials actually live,
  the publish-then-verify contract, canonical/syndication order, ledger updates, engagement,
  and the settled platform facts that should never be re-researched.
---

# Publish and syndicate

The standing content run is **pre-authorized**. Publishing the frozen copy is the job, not a
decision to escalate. Do not ask whether to publish, which platform to use, or whether a
credential exists — check, then act. Ask only when the copy itself makes a factual claim you
cannot verify.

## 0. Find the credentials before claiming you lack them

```bash
env | grep -E 'DEVTO_API_KEY|HASHNODE_TOKEN|BLUESKY_HANDLE|BLUESKY_APP_PASSWORD' | sed 's/=.*/=<set>/'
```

Print only the *names*. Never echo a token value, never write one into a file, never put one
in a commit, a ledger cell, or a PR body — the repo is public.

If a key is missing, the fix is **not** to ask for it again. Keys pasted into chat live only
for that session; this container is rebuilt from scratch every run, so a key given yesterday
is genuinely gone today. The permanent fix, done once:

> **Environment variables in the Claude Code environment config** (the same place the network
> policy and setup script are set) — see code.claude.com/docs/en/claude-code-on-the-web.
> Set `DEVTO_API_KEY` there and every future unattended run has it.

Say that once, then proceed with whatever you *can* do. Asking a third time for a key the
operator believes they already provided reads as refusing to work.

## 1. Publish to the canonical home first

dev.to is the origin. Everything else syndicates from it and points back.

```bash
node tools/social-publish.js --platform devto \
  --title "$TITLE" --body-file body.md --tags "devops,ai,security,sre" \
  --must-contain "<a distinctive phrase from the body>" --json
```

Strip the leading `# H1` out of the body first — dev.to renders the title separately and you
will otherwise ship a duplicated headline.

`--must-contain` is what makes the result trustworthy: the tool refetches the live URL and
confirms the text is really on the page. Exit 0 means published *and* verified. Anything else
is `Blocked`, never `Published`, no matter what the API returned.

## 2. Syndicate, always with canonical pointing home

A syndicated copy that does not name its original competes with the original in search.

| Target | How | Canonical |
|---|---|---|
| Hashnode | `--platform hashnode --canonical-url <dev.to URL>` | `originalArticleURL`, set automatically |
| Medium | Import a Story, paste the dev.to URL | Medium sets it back to dev.to for you |
| Bluesky | `--platform bluesky --text "..."` with the link in the text | n/a |

Bluesky posts need no extra work for links — the tool computes the byte-offset facets. Without
them a URL is dead plain text.

## 3. Update the ledger with the URL, immediately

`docs/social/hermes-mobile-content-log.tsv` — set `Status=Published` and `PostURL=<url>` on the
row you own, and say in `Outcome` *how* it was verified. A ledger that says Published with no
URL is the same lie as a Blocked row that was never tested.

## 4. Settled platform facts — do not re-research these

Four runs burned time rediscovering them:

- **X** — no free tier for new developers since Feb 2026; pay-per-use bills **$0.20 per post
  containing a URL**, and ours contain one. Declined on cost, not unavailable. A browser
  session on the Mac still posts free.
- **Medium** — no new API integration tokens since 2023. It will never work by API. Import a
  Story is the whole path.
- **Hashnode** — the GraphQL API has been **Pro-only since May 2026**, for reads *and* writes.
  A perfectly valid token on a free publication still fails. That is a spend decision the
  operator owns; surface it, don't quietly retry.
- **dev.to comments** — the API is **read-only**. There is no POST endpoint, so replying to a
  commenter genuinely needs a browser. Draft the reply to a file and say where it is.
- **LinkedIn / Threads** — OAuth only; no token path exists.

## 5. Engage, because reach is the point

Publishing without engaging wastes the post. After shipping, check notifications:

```bash
curl -s -H "api-key: $DEVTO_API_KEY" "https://dev.to/api/articles/me/published?per_page=5" \
  | python3 -c "import json,sys; [print(a['title'][:50], a['public_reactions_count'], a['comments_count'], a['url']) for a in json.load(sys.stdin)]"
```

Reply to substantive technical comments with something that concedes the strongest version of
their point before adding yours — that is what earns follow-through from engineers. Since the
comment API is read-only, write the drafted reply to `docs/social/drafts/` and name the file
after the thread so a Mac-side session can paste it in seconds.

## 6. Monetize honestly

Every link carries UTM (`?utm_source=<platform>&utm_medium=social&utm_campaign=<campaign>`) so
attribution survives. Disclose the commercial interest in the post itself — the posts that
convert are the ones that criticize the author's own category credibly. Never claim a metric
that was not re-verified in this run, and never invent social proof; a single fabricated number
costs more trust than the post earns.
