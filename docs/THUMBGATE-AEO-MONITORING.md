# ThumbGate AI/search visibility monitoring

ThumbGate tracks a stable, brand-neutral three-prompt set weekly instead of treating one manual LLM query as proof. The monitor is a **web-source citation proxy**. It does not claim direct Google AI Overview telemetry.

## What is measured

- Technical discovery: landing JSON-LD (SoftwareApplication + MobileApplication + FAQPage) and visible FAQ, robots, sitemap, `llms.txt` (including Hermes Mobile store answers), and ARD 1.0.
- Citation count: results whose canonical host is `thumbgate.app`.
- Brand mention share: results that cite or name ThumbGate.
- Deterministic mention sentiment: a small, auditable positive/negative term set; not an ML sentiment model.
- Citation and mention deltas against the preceding receipt.

## Prompt set (v2026-07-23.1)

Three stable prompts (exactly three — monitor enforces the count):

1. Secure Hermes web chat / browser control
2. Hermes Mobile phone control without inbound ports
3. Local-agent cloud failover when the machine is offline

Do not treat store **ranking** as an AEO metric. ASO lives in Play/ASC metadata; this monitor is a web citation proxy only.

## Cost and privacy

- One Parallel Turbo request per weekly run, containing all three public prompts.
- Estimated scheduled maximum: **$0.005/month** (five runs).
- Hard local monthly stop: **$0.10/month**, well below the product-wide $10/month ceiling.
- Receipts live at `~/.hermes/receipts/thumbgate-aeo/` with mode `0600`.
- No chat, account, customer, or workspace data is queried or stored.

## Commands

```bash
node tools/thumbgate-aeo-monitor.js --json
node tools/thumbgate-aeo-monitor.js --execute --write --json
bash scripts/install-thumbgate-aeo-monitor.sh
```

The installer copies the bounded monitor, its prompt set, and the existing search wrapper into `~/.local/share/thumbgate-aeo/`, so launchd never depends on a disposable git worktree. The LaunchAgent runs Mondays at 9:15 AM local time. It never edits content automatically. Citation loss becomes evidence for the normal branch → tests → canary → promote/revert workflow.
