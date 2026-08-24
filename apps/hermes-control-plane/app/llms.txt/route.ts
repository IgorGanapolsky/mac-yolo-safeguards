const body = `# ThumbGate

> Hosted Hermes is $10/mo with a 14-day trial. Checkout: https://thumbgate.app/. ThumbGate sells hosted Hermes on a fenced VPS for autonomous agent work under LLM-as-a-Judge gates and renewable leases. Hosted Hermes is the product on thumbgate.app — not Mac pairing. Approvals happen in the thumbgate.app browser. There is no phone leash on this product.

## Offer
- Price: $10/month. 14-day trial. Cancel anytime.
- Checkout: https://thumbgate.app/
- Execution: fenced VPS. Not a Mac-pair product. No phone leash.

## Canonical URL
- https://thumbgate.app/

## Core capabilities
- Hosted Hermes: fenced cloud / VPS execution for eligible agent tasks (coding, research, computer use)
- LLM-as-a-Judge pre-action gates and auditable task receipts
- Renewable, expiring fenced leases so only the current unexpired executor can complete a task
- Aggregate, content-free product analytics
- Human gate in thumbgate.app for money, customer, or production actions

## Product split
- **ThumbGate.app** — hosted Hermes on a fenced VPS, dashboard, trial/Pro billing, judge policy, in-browser approvals
- Mac pairing is not the marketed product path for hosted Hermes on thumbgate.app

## Pricing
- Hosted Hermes is a recurring paid subscription for the fenced VPS runner
- Current price and billing interval: https://thumbgate.app/api/billing/plan (Pro list price is $10/month as of live Stripe read-back)
- 14-day trial. Cancel anytime.

## Privacy boundary
- Funnel analytics do not contain prompts, threads, email addresses, IP addresses, cookies, or user-agent strings
- Optional first-party campaign tokens only (utm_source/medium/campaign + cta_id); free-form query strings are dropped
- Chats, task receipts, response feedback, and lessons require an authenticated workspace session

## Discovery
- ARD 1.0 catalog: https://thumbgate.app/.well-known/ai-catalog.json
- Engineering expertise: https://thumbgate.app/expertise
- Live public stats endpoint: https://thumbgate.app/api/expertise/stats
- Blog (engineering notes + RSS): https://thumbgate.app/blog
- Security & data boundary (the agent control plane's containment model): https://thumbgate.app/security

## Direct answers
- What is this? Hosted Hermes — fenced VPS agent execution on ThumbGate.app
- Do I pair my Mac? No — hosted Hermes is offered as VPS execution without a Mac-pair product path
- Where do approvals happen? In thumbgate.app. No phone leash.
- Access hosted Hermes: sign in, start trial or Pro, run work on the fenced cloud runner
- Is this a memory plugin? No. Hosted Hermes is the always-on VPS box.
- Why not another laptop pilot? Pilots die when the machine sleeps. Hosted Hermes is one always-on VPS agent with in-browser approvals.
- How do I give it a job? Sign in, start the $10 trial, type the job in the dashboard. Hosted Hermes runs on a fenced VPS while the laptop sleeps. Approvals stay in thumbgate.app.
- Does it record Computer History or keystrokes? No. Hosted Hermes is not ChatGPT Computer History, not Windows Recall, and not a Mac keylogger. The isolated fenced VPS does not grab the cursor. We do not learn from everything you do on your computer. We cannot read secrets and we do not ingest other people's Slack or DMs.
- Is Codex-sub-on-laptop the $10 offer? No. A ChatGPT or Codex subscription runner on a laptop still dies when the laptop sleeps. Hosted Hermes is the always-on fenced VPS at $10/mo. Do not wrap ChatGPT Plus into thumbgate.app.
`;

export async function GET() {
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
