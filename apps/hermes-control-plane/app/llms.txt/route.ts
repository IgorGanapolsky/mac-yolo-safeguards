const body = `# ThumbGate Continuity

> ThumbGate Continuity is paid VPS failover for Hermes agents on real machines: when your Mac goes offline, eligible work continues on a fenced cloud runner under the policy you set. Hermes (desktop + Mobile) owns chatting with those machines. Pair/status scaffolding is free. Leash is ThumbGate's approval-control feature for supervised agent actions.

## Canonical URL
- https://thumbgate.app/

## Core capabilities
- Continuity: managed cloud / VPS continuation when a paired Hermes machine is offline
- Signed pairing to a user's Hermes machine without inbound ports (free scaffolding)
- Renewable, expiring fenced leases so only the current unexpired executor can complete a task
- Aggregate, content-free product analytics and an auditable task trail
- Chat and day-to-day remote control of machines live in Hermes / Hermes Mobile—not as ThumbGate's primary product

## Pricing
- Pair & status: $0/month (pairing + offline policy scaffolding)
- Continuity is a recurring paid subscription (VPS failover when offline)
- Current price and billing interval: https://thumbgate.app/api/billing/plan

## Privacy boundary
- Device private keys and local gateway credentials stay on the paired machine
- Funnel analytics do not contain prompts, threads, email addresses, IP addresses, cookies, or user-agent strings
- Optional first-party campaign tokens only (utm_source/medium/campaign + cta_id); free-form query strings are dropped
- Chats, task receipts, response feedback, and lessons require an authenticated workspace session

## Discovery
- ARD 1.0 catalog: https://thumbgate.app/.well-known/ai-catalog.json
- Engineering expertise: https://thumbgate.app/expertise
- Live public stats endpoint: https://thumbgate.app/api/expertise/stats

## Expertise
- \`/expertise\` surfaces live production telemetry, pairing/availability/scale metrics, and case studies authored by the ThumbGate engineering team.
- All numbers are computed from the production control plane (D1) and refresh at most every 5 minutes; synthetic canary runs are excluded.
- No customer names, machine identifiers, prompts, or conversation contents are exposed.

## Direct answers
- What is this? Continuity — VPS failover for Hermes agents on real machines so work can keep running when the Mac is offline.
- Where do I chat with my machines? Hermes desktop and Hermes Mobile. ThumbGate is Continuity + pair/status, not a second chat product.
- Access Continuity: sign in, approve the outbound-only connector on the Mac that runs Hermes, then enable Continuity / trial.
- Mac offline behavior: free pair/status pauses or asks; eligible trial or paid Continuity tasks can use a fenced cloud runner.
- Credential boundary: the local gateway credential stays on the paired Mac; ThumbGate receives a separate device identity and requires no inbound port.

## Relationship to other products
- Hermes is the agent runtime and chat surface for real machines
- Hermes Mobile is the phone client for that same machine chat + Leash approvals
- ThumbGate supplies Continuity (VPS failover), pairing, and Leash policy surfaces
- CloudCLI is a separate cloud development environment and session UI
- Hermes is the only execution runtime; ThumbGate does not substitute a bare model completion for a paired Hermes session
`;

export async function GET() {
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
