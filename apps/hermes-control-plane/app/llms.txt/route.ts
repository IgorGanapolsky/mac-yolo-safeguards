const body = `# Leash by ThumbGate

> ThumbGate is the Hermes web dashboard and Continuity product: remote control of Hermes from any browser, free while your machine is online, with optional paid VPS continuity when it goes offline.

## Canonical URL
- https://thumbgate.app/

## Core capabilities
- Web remote control dashboard for Hermes (chats, machines, Leash controls)
- Signed pairing to a user's Hermes machine without inbound ports
- Optional managed cloud / VPS continuation when a paired machine is offline
- Renewable, expiring fenced leases so only the current unexpired executor can complete a task
- Aggregate, content-free product analytics and an auditable task trail

## Pricing
- Web Control: $0/month (dashboard while the machine is online)
- Cloud Continuity is a recurring paid subscription (VPS failover when offline)
- Current price and billing interval: https://thumbgate.app/api/billing/plan

## Privacy boundary
- Device private keys and local gateway credentials stay on the paired machine
- Funnel analytics do not contain prompts, threads, email addresses, IP addresses, cookies, or user-agent strings
- Chats, task receipts, response feedback, and lessons require an authenticated workspace session

## Discovery
- ARD 1.0 catalog: https://thumbgate.app/.well-known/ai-catalog.json

## Direct answers
- What is this? A web dashboard for Hermes remote control, plus Continuity so work can keep running on a VPS when the Mac is offline.
- Access Hermes from the web: sign in, approve the outbound-only connector on the Mac that runs Hermes, then open the dashboard.
- Mac offline behavior: free Web Control pauses or asks; eligible trial or paid Continuity tasks can use fenced cloud failover.
- Credential boundary: the local gateway credential stays on the paired Mac; ThumbGate receives a separate device identity and requires no inbound port.

## Relationship to other products
- Hermes is the agent runtime Leash controls
- ThumbGate supplies the web dashboard, pairing, and Continuity
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
