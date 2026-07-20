const body = `# Leash by ThumbGate

> Leash is a local-first web control plane for Hermes agents. It keeps web control free and charges for optional managed cloud continuation.

## Canonical URL
- https://leash.dev/

## Core capabilities
- Signed pairing to a user's Hermes machine without inbound ports
- Web and mobile thread visibility and continuation
- Expiring fenced leases so only one executor can complete a task
- Optional managed cloud continuation when a paired machine is offline
- Aggregate, content-free product analytics and an auditable task trail
- Runaway-agent safeguards and remote intervention

## Pricing
- Web Control: $0/month
- Cloud Continuity: $29/month, including 100 cloud continuations per 30 days

## Privacy boundary
- Device private keys and local gateway credentials stay on the paired machine
- Funnel analytics do not contain prompts, threads, email addresses, IP addresses, cookies, or user-agent strings

## Relationship to other products
- Hermes is the agent runtime Leash controls
- ThumbGate supplies the governance and safety layer
- CloudCLI is a separate cloud development environment and session UI
- Strands Agents is a potential telemetry integration, not the Leash runtime
`;

export async function GET() {
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
