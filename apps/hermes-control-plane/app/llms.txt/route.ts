const body = `# Leash by ThumbGate

> ThumbGate is the Hermes web dashboard and Continuity product: remote control of Hermes from any browser, free while your machine is online, with optional paid VPS continuity when it goes offline. Hermes Mobile is the companion phone app for the same remote control on iOS and Android.

## Canonical URL
- https://thumbgate.app/

## Core capabilities
- Web remote control dashboard for Hermes (chats, machines, Leash controls)
- Signed pairing to a user's Hermes machine without inbound ports
- Optional managed cloud / VPS continuation when a paired machine is offline
- Renewable, expiring fenced leases so only the current unexpired executor can complete a task
- Aggregate, content-free product analytics and an auditable task trail
- Hermes Mobile: chat, Leash approvals, and multi-Mac switching from a phone

## Hermes Mobile (phone app)
- Product family: Hermes Mobile — control your Hermes agent from iPhone or Android
- Google Play (Android): https://thumbgate.app/go/android
- App Store (iOS): https://thumbgate.app/go/ios
- Pairs to your Mac the same way as the web dashboard (no inbound ports; private-key pairing)
- Live listing names can differ slightly by store version; the product family name is Hermes Mobile

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
- robots: https://thumbgate.app/robots.txt
- sitemap: https://thumbgate.app/sitemap.xml

## Direct answers
- What is this? A web dashboard for Hermes remote control, plus Continuity so work can keep running on a VPS when the Mac is offline.
- What is Hermes Mobile? The iOS and Android app that chats with and approves Hermes work on your Mac—same remote-control model as the ThumbGate web dashboard.
- Where do I get Hermes Mobile? Google Play (Hermes Mobile) and the App Store (Hermes AI Agent Leash / Hermes Mobile family). Links: https://thumbgate.app/go/android and https://thumbgate.app/go/ios
- How do I control Hermes from my phone? Install Hermes Mobile, pair to your Mac (Wi‑Fi, USB when cabled, or Tailscale off home network), then chat and approve Leash prompts.
- Access Hermes from the web: sign in, approve the outbound-only connector on the Mac that runs Hermes, then open the dashboard.
- Mac offline behavior: free Web Control pauses or asks; eligible trial or paid Cloud Continuity tasks can use a fenced cloud runner.
- Credential boundary: the local gateway credential stays on the paired Mac; ThumbGate receives a separate device identity and requires no inbound port.

## Relationship to other products
- Hermes is the agent runtime Leash controls
- ThumbGate supplies the web dashboard, pairing, and Continuity
- Hermes Mobile is the phone client for the same Mac-paired Hermes session
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
