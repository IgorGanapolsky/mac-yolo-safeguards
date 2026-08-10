#!/usr/bin/env python3
"""
gen-next-dollar-plan.py  —  regenerate the private next-dollar send plan.

Reads the live Skool lead DB (sibling repo skool_top1percent/data/lead_crm.sqlite),
exports the repo money engine's private inputs from the buying-intent lead queue,
then `send-plan.js` consumes them to emit the manual-send plan.

Repeatable daily skill (no ad-hoc /tmp scripts). See docs/north-star-revenue.md.

Usage:
  python3 tools/gen-next-dollar-plan.py [YYYY-MM-DD]    # defaults to today (UTC)
"""
import sqlite3, os, sys, datetime

DATE = sys.argv[1] if len(sys.argv) > 1 else datetime.date.today().isoformat()
DB = "/Users/igorganapolsky/workspace/git/igor/skool_top1percent/data/lead_crm.sqlite"
OUT_DIR = "/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/data"
os.makedirs(OUT_DIR, exist_ok=True)

con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
rows = list(con.execute("""
  select post_id, max(buyer_intent) as buyer_intent, min(reason) as reason, min(next_step) as next_step,
         min(community) as community, min(post_url) as post_url, min(author) as author, min(title) as title
  from agentic_picks ap left join skool_posts sp on sp.id = ap.post_id
  where ap.buyer_intent >= 6.5 group by post_id order by buyer_intent desc, min(created_at) desc limit 12
"""))

def body(r):
    pain = (r['reason'] or '')[:140]
    return (
        "Re: " + (r['title'] or (r['reason'] or 'your AI-agent reliability post')) + "\n\n"
        "I saw your post about reliability in automation workflows. The blind-spot I keep seeing "
        "on these exact threads: multi-step agent chains that fail silently because the verification "
        "step is treated as a final answer instead of an artifact. The Stanford 5-lens method you "
        "referenced is a great example of why one angle misses what others catch.\n\n"
        "Concrete for your ask -> " + (r['next_step'] or pain)[:160] + "\n\n"
        "Repo: https://github.com/IgorGanapolsky/mac-yolo-safeguards (reliability diagnostic harness "
        "+ diff-verifiable state-machine template)\n\n"
        "Happy to drop the full reliability-checklist (free) or walk your stack in a 20-min triage. "
        "The $499 diagnostic / $1,500 hardening sprint closes on Stripe once the payment route is live."
    )

acts = os.path.join(OUT_DIR, f"outreach-actions-{DATE}.tsv")
with open(acts, "w") as f:
    f.write("prospect_label\troute\taction_type\taction_value\tsubject\tdraft_body\n")
    for r in rows:
        label = f"Skool #{r['post_id']} {r['author'] or 'anon'}"
        f.write("\t".join([
            label, "AI Agent Hardening Sprint ($1,500)", "skool",
            r['post_url'] or "",
            f"Re: {((r['reason'] or r['next_step']) or 'reliability diagnostic')[:60]}",
            body(r).replace("\n", "\\n"),
        ]) + "\n")

pipe = os.path.join(OUT_DIR, f"pipeline-status-{DATE}.tsv")
with open(pipe, "w") as f:
    f.write("prospect_label\tstage\tnext_action\n")
    for r in rows:
        label = f"Skool #{r['post_id']} {r['author'] or 'anon'}"
        f.write("\t".join([label, "ready", "post_skool_comment_then_wait_for_reply"]) + "\n")

omap = os.path.join(OUT_DIR, f"stripe-offer-map-{DATE}.tsv")
with open(omap, "w") as f:
    f.write("offer\tstatus\tstripe_product_id\tstripe_price_id\tpayment_link_url\tstripe_amount_usd\n")
    f.write("AI Agent Reliability Diagnostic\tmissing\t\t\t\t499\n")
    f.write("AI Agent Hardening Sprint\tmissing\t\t\t\t1500\n")

print(f"# {len(rows)} hot prospects (intent>=6.5) exported for {DATE}")
print(f"wrote {acts}")
print(f"wrote {pipe}")
print(f"wrote {omap}")
print("# stripe-status: missing (STRIPE_SECRET_KEY unset — paid close gated)")
