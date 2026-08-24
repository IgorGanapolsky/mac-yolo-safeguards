/**
 * apps/hermes-control-plane/lib/bot-mode.ts
 *
 * Hermes Agent Bot Mode (Nous Research specification):
 * Persistent roster of named specialized bots with custom roles, models,
 * skills, memories, routines, and @mention task routing.
 */

export interface HermesBotProfile {
  id: string;
  name: string;
  handle: string; // e.g. "@chief"
  role: string;
  avatar: string;
  defaultModel: string;
  systemPrompt: string;
  skills: string[];
  routines: string[];
}

export const CANONICAL_BOT_ROSTER: Record<string, HermesBotProfile> = Object.freeze({
  chief: {
    id: "chief",
    name: "Chief",
    handle: "@chief",
    role: "Executive Orchestrator & Architectural Governance",
    avatar: "👑",
    defaultModel: "qwen-max-latest",
    systemPrompt: "You are Chief, the lead AI conductor. Direct workflows, enforce fail-closed security, and coordinate the team.",
    skills: ["listen-to-chief", "architectural-governance", "pre-action-interdiction"],
    routines: ["daily-fleet-health", "pre-action-audit"],
  },
  ralph: {
    id: "ralph",
    name: "Revenue Ralph",
    handle: "@ralph",
    role: "B2B Cash Path & Pipeline Execution",
    avatar: "💰",
    defaultModel: "glm-5.3",
    systemPrompt: "You are Revenue Ralph. Drive enterprise partner conversions, B2B cash paths, and Stripe checkouts.",
    skills: ["ralph-gsd-revenue-loop", "revenue-cash-accelerator", "stripe-agency-billing"],
    routines: ["hourly-pipeline-check", "b2b-outreach-cadence"],
  },
  ship: {
    id: "ship",
    name: "Ship Engineer",
    handle: "@ship",
    role: "Zero-Crash CI/CD & Delivery Engine",
    avatar: "🚀",
    defaultModel: "openai-codex",
    systemPrompt: "You are Ship Engineer. Build surgical diffs, ensure green CI, verify 100% test coverage, and ship clean work.",
    skills: ["codex-harness-optimizer", "anti-lying-ground-truth-verifier", "clean-worktree-rebase"],
    routines: ["ci-monitor-auto-merge", "codeql-pattern-scan"],
  },
  qa: {
    id: "qa",
    name: "QA Auditor",
    handle: "@qa",
    role: "Ground-Truth Empirical Receipt Verifier",
    avatar: "🔍",
    defaultModel: "gpt-5.6-sol",
    systemPrompt: "You are QA Auditor. Demand hard empirical receipts, run negative E2E paths, and interdict unverified claims.",
    skills: ["functionize-ai-test-studio", "empirical-receipt-verifier", "visual-e2e-auditor"],
    routines: ["continuous-e2e-smoke", "flaky-test-quarantine"],
  },
  raven: {
    id: "raven",
    name: "Research Raven",
    handle: "@raven",
    role: "Trending RAG & Market Intelligence",
    avatar: "🦅",
    defaultModel: "deepseek-v4",
    systemPrompt: "You are Research Raven. Ingest industry trends (ExplainX, arXiv, product launches) and optimize strategies.",
    skills: ["explainx-trending-rag", "search-as-code", "lorebook-triggered-context"],
    routines: ["half-hourly-explainx-ingest", "competitive-intel-scan"],
  },
});

/**
 * Extracts @bot mentions from prompt text and resolves routing target.
 */
export function extractBotMention(promptText: string): {
  targetBot: HermesBotProfile | null;
  cleanedPrompt: string;
} {
  const match = promptText.match(/@(chief|ralph|ship|qa|raven)\b/i);
  if (!match) {
    return { targetBot: null, cleanedPrompt: promptText };
  }

  const botKey = match[1].toLowerCase();
  const targetBot = CANONICAL_BOT_ROSTER[botKey] ?? null;
  const cleanedPrompt = promptText.replace(match[0], "").trim();

  return { targetBot, cleanedPrompt };
}

export function getAllBots(): HermesBotProfile[] {
  return Object.values(CANONICAL_BOT_ROSTER);
}

export function getBotById(id: string): HermesBotProfile {
  return CANONICAL_BOT_ROSTER[id.toLowerCase()] ?? CANONICAL_BOT_ROSTER.chief;
}
