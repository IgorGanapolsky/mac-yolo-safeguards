#!/usr/bin/env node
/**
 * tools/hermes-bot-roster.js
 *
 * CLI and Automation Engine for Hermes Agent Bot Mode (Nous Research).
 * Manages persistent named Bot rosters, @mention dispatch, and routine execution.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const BOT_ROSTER = Object.freeze({
  chief: {
    id: "chief",
    name: "Chief",
    handle: "@chief",
    role: "Executive Orchestrator & Architectural Governance",
    avatar: "👑",
    defaultModel: "qwen-max-latest",
    skills: ["listen-to-chief", "architectural-governance", "pre-action-interdiction"],
  },
  ralph: {
    id: "ralph",
    name: "Revenue Ralph",
    handle: "@ralph",
    role: "B2B Cash Path & Pipeline Execution",
    avatar: "💰",
    defaultModel: "glm-5.3",
    skills: ["ralph-gsd-revenue-loop", "revenue-cash-accelerator", "stripe-agency-billing"],
  },
  ship: {
    id: "ship",
    name: "Ship Engineer",
    handle: "@ship",
    role: "Zero-Crash CI/CD & Delivery Engine",
    avatar: "🚀",
    defaultModel: "openai-codex",
    skills: ["codex-harness-optimizer", "anti-lying-ground-truth-verifier", "clean-worktree-rebase"],
  },
  qa: {
    id: "qa",
    name: "QA Auditor",
    handle: "@qa",
    role: "Ground-Truth Empirical Receipt Verifier",
    avatar: "🔍",
    defaultModel: "gpt-5.6-sol",
    skills: ["functionize-ai-test-studio", "empirical-receipt-verifier", "visual-e2e-auditor"],
  },
  raven: {
    id: "raven",
    name: "Research Raven",
    handle: "@raven",
    role: "Trending RAG & Market Intelligence",
    avatar: "🦅",
    defaultModel: "deepseek-v4",
    skills: ["explainx-trending-rag", "search-as-code", "lorebook-triggered-context"],
  },
});

export function resolveBotDispatch(prompt = "") {
  const match = String(prompt).match(/@(chief|ralph|ship|qa|raven)\b/i);
  if (!match) {
    return {
      bot: BOT_ROSTER.chief,
      isMention: false,
      cleanedPrompt: prompt,
    };
  }

  const key = match[1].toLowerCase();
  const bot = BOT_ROSTER[key] || BOT_ROSTER.chief;
  const cleanedPrompt = String(prompt).replace(match[0], "").trim();

  return {
    bot,
    isMention: true,
    cleanedPrompt,
  };
}

export function saveBotModeState(botId, conversationState = {}) {
  const receiptDir = join(homedir(), ".hermes", "bots", botId);
  try {
    mkdirSync(receiptDir, { recursive: true });
    const payload = {
      botId,
      updatedAt: new Date().toISOString(),
      ...conversationState,
    };
    writeFileSync(join(receiptDir, "canonical-state.json"), JSON.stringify(payload, null, 2), "utf8");
    return payload;
  } catch (err) {
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv[2] || "@ralph Check pipeline conversions and send Stripe links";
  const dispatch = resolveBotDispatch(input);
  console.log(JSON.stringify(dispatch, null, 2));
}
