# FROZEN — 2026-08-10 AM — LinkedIn
Campaign: away-from-desk-2026-08-10-am
Channel: Buffer → "igor-ganapolsky-859317343 LinkedIn Profile" (6a4bdce840483446287759f8)
PostURL: https://www.linkedin.com/posts/igor-ganapolsky-859317343_thumbgate-hermes-dashboard-continuity-activity-7492924012508008449-Il4T
Published: 2026-08-10T20:44:33Z via Buffer share_now (urn:li:share:7492924010146598913)
Claims re-verified in THIS run: Pro Continuity $10/mo (thumbgate.app/api/billing/plan,
unitAmount:1000); Team & Enterprise $49/mo (thumbgate.app price-card); Web Control $0/mo;
HN 47911524 = 860 points / 1032 comments (hn.algolia.com items API).

---

The agent that deleted a production database in 9 seconds wasn't rogue. Nobody was watching.

That Hacker News thread is still one of the most-discussed things written about agent safety — 860 points, over a thousand comments. What's striking is that the top comments don't really blame the model. They blame the fact that a tool holding production credentials had no step where a human said yes.

I keep coming back to one detail: nine seconds.

There is no realistic version of "I'll keep an eye on it" that catches a nine-second mistake. Not if you're in a meeting. Not if you're asleep. Not if you walked down the hall for coffee. "Supervise your agent" is advice that quietly assumes you are sitting in front of it, and most of the day you are not.

So the useful question isn't how to watch more carefully. It's where the approval lives when you're not at your desk.

That's what I'm building ThumbGate for. It's a web dashboard for Hermes agents running on your own Mac: real agent state from any browser, and approve or deny each tool call before it runs. The approve/deny gating is free — on web and on mobile — and I intend to keep it that way. A safety gate you have to pay for is a safety gate people switch off.

The only paid piece is Continuity: when the Mac goes offline, eligible work hands off to a fenced VPS runner under a policy you set — one thread, one executor. That's $10/month today, $49 for the team tier. The free dashboard doesn't expire if you never buy it.

Honest status: I'm a solo founder and this is early. I'd rather have ten people tell me exactly where it breaks than a hundred quiet signups.

If you run agents with shell access on a machine you'd hate to lose:
https://thumbgate.app/?utm_source=linkedin&utm_medium=social&utm_campaign=2026-08-10-am

#AIAgents #DevTools #AISafety
