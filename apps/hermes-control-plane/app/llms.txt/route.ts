const body = `# ThumbGate for Hermes

> ThumbGate is the self-improving firewall for your AI agents: a local-first web control and safety layer for Hermes that remembers lessons, re-ranks what matters next, promotes repeated failures into gates, and expires stale auto-promoted policy. Web control stays free; optional managed cloud continuation is paid.

- Product label: Leash by ThumbGate
- Primary pitch: Self-Improving Firewall for your AI Agents

## Canonical URL
- https://thumbgate.app/

## Core capabilities
- Signed pairing to a user's Hermes machine without inbound ports
- Web and mobile thread visibility and continuation
- Pre-action Leash approvals for blocked agent tool calls
- Private thumbs feedback, durable lessons, lesson re-ranking, gate promotion, and expiry of stale auto-promoted gates
- Renewable, expiring fenced leases so only the current unexpired executor can complete a task
- Optional managed cloud continuation when a paired machine is offline
- Aggregate, content-free product analytics and an auditable task trail
- Authenticated workspace lessons dashboard

## Pricing
- Web Control: $0/month
- Cloud Continuity is a recurring paid subscription
- Current price and billing interval: https://thumbgate.app/api/billing/plan

## Privacy boundary
- Device private keys and local gateway credentials stay on the paired machine
- Funnel analytics do not contain prompts, threads, email addresses, IP addresses, cookies, or user-agent strings
- Chats, task receipts, response feedback, and lessons require an authenticated workspace session

## Discovery
- ARD 1.0 catalog: https://thumbgate.app/.well-known/ai-catalog.json

## Direct answers
- Access Hermes chats from the web: sign in, approve the outbound-only connector on the Mac that runs Hermes, then select a synced thread.
- Mac offline behavior: free Web Control pauses or asks; eligible trial or paid Cloud Continuity tasks can use a fenced cloud runner.
- Credential boundary: the local gateway credential stays on the paired Mac; ThumbGate receives a separate device identity and requires no inbound port.
- Authentication: AuthKit accepts email or Google; enterprise SSO is discovered from a verified work email, and additional social buttons appear only after their providers are configured.

## Relationship to other products
- Hermes is the agent runtime Leash controls
- ThumbGate supplies the governance and safety layer
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
