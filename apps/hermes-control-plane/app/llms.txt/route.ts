const body = `# ThumbGate Continuity

> ThumbGate Continuity is a paid fenced cloud VPS runner for autonomous agent work under LLM-as-a-Judge gates and renewable leases. Continuity is the product on thumbgate.app — not Mac pairing. Hermes Mobile is an optional phone companion for Leash approvals and alerts.

## Canonical URL
- https://thumbgate.app/

## Core capabilities
- Continuity: fenced cloud / VPS execution for eligible agent tasks (coding, research, computer use)
- LLM-as-a-Judge pre-action gates and auditable task receipts
- Renewable, expiring fenced leases so only the current unexpired executor can complete a task
- Aggregate, content-free product analytics
- Optional Hermes Mobile companion for biometric approvals and push (separate app from Continuity)

## Product split
- **ThumbGate.app** — Continuity VPS, dashboard, trial/Pro billing, judge policy
- **Hermes Mobile** — phone Leash/approvals/voice (store apps); not Continuity, not billing
- Mac pairing is not the marketed product path for Continuity on thumbgate.app

## Pricing
- Continuity is a recurring paid subscription for the fenced VPS runner
- Current price and billing interval: https://thumbgate.app/api/billing/plan (Pro list price is $10/month as of live Stripe read-back)

## Privacy boundary
- Funnel analytics do not contain prompts, threads, email addresses, IP addresses, cookies, or user-agent strings
- Optional first-party campaign tokens only (utm_source/medium/campaign + cta_id); free-form query strings are dropped
- Chats, task receipts, response feedback, and lessons require an authenticated workspace session

## Discovery
- ARD 1.0 catalog: https://thumbgate.app/.well-known/ai-catalog.json
- Engineering expertise: https://thumbgate.app/expertise
- Live public stats endpoint: https://thumbgate.app/api/expertise/stats

## Direct answers
- What is this? Continuity — fenced VPS agent execution on ThumbGate.app
- Do I pair my Mac? No — Continuity is offered as VPS execution without a Mac-pair product path
- Where is the phone app? Hermes Mobile (optional) for approvals/alerts — not a Continuity download
- Access Continuity: sign in, start trial or Pro, run work on the fenced cloud runner
`;

export async function GET() {
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
