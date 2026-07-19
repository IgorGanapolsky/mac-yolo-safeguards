# ICP shortlist from e2b-dev/awesome-ai-agents (2026-07-19)

Source: https://github.com/e2b-dev/awesome-ai-agents (via Dan Kornas X post 2026-07-18).
These are open-source agent projects that run autonomous loops and burn API tokens —
the exact pain our reliability/guardrails wedge (ThumbGate, mac-yolo-safeguards,
$499 diagnostic / $1,500 hardening) addresses. Channel: GitHub issues mining
(proven 2026-06-03 per source-agent-reliability-buyers), NOT cold spam.

Play per repo: search issues for "infinite loop", "token usage", "runaway",
"stuck repeating", "burned credits" → reply with genuinely useful diagnosis +
link free kit; escalate warm threads only.

## Tier 1 — loop-running autonomous agents (highest token-burn pain)
- AutoGPT — https://github.com/Significant-Gravitas/Auto-GPT
- BabyAGI — https://github.com/yoheinakajima/babyagi
- GPT Pilot — https://github.com/Pythagora-io/gpt-pilot
- OpenDevin — https://github.com/OpenDevin/OpenDevin
- Devika — https://github.com/stitionai/devika
- Devon — https://github.com/entropy-research/Devon
- Open Interpreter — https://github.com/KillianLucas/open-interpreter
- GPT Engineer — https://github.com/AntonOsika/gpt-engineer

## Tier 2 — multi-agent frameworks (users hit cost/reliability walls)
- CrewAI — https://github.com/joaomdmoura/crewai
- AutoGen — https://github.com/microsoft/autogen
- MetaGPT — https://github.com/geekan/MetaGPT
- ChatDev — https://github.com/OpenBMB/ChatDev
- AgentVerse — https://github.com/OpenBMB/AgentVerse
- Langroid — https://github.com/langroid/langroid
- AgentForge — https://github.com/DataBassGit/AgentForge
- IX — https://github.com/kreneskyp/ix

## Tier 3 — adjacent (memory/orchestration; softer fit)
- MemGPT — https://github.com/cpacker/MemGPT
- Flowise — https://github.com/FlowiseAI/Flowise
- Aider — https://github.com/paul-gauthier/aider
- L2MAC — https://github.com/samholt/l2mac

## Directory gap (distribution opportunity, pending Igor approval)
- e2b-dev/awesome-sdks-for-ai-agents: ~10 entries, has observability
  (AgentOps, Helicone, Langfuse, LangSmith) but ZERO guardrails/approval/
  pre-action-governance tools. ThumbGate + mac-yolo-safeguards fill an empty
  niche. Submission is PR-based; agents-only main list is wrong venue for tools.
