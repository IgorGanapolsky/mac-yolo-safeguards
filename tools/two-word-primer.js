"use strict";

/**
 * Two-word prompt primer — steals NLW "9 AI Techniques" #8 "Two-word prompts"
 * (short, deceptively simple prompt cues that reliably steer output) for the
 * hermes-yolo agent loop.
 *
 * High-ROI hook for THIS repo: the loop fires many `node tools/*.js` calls per
 * session; a 2-word cue replaces a verbose natural-language prompt each time,
 * cutting prompt tokens (feeds tools/agent-cost-analyzer.js) and converging
 * faster — non-converging / verbose re-prompts are exactly what
 * tools/agent-spin-detector.js flags as spinning loops.
 *
 * Source: The AI Breakdown #157 "9 AI Techniques You Probably Haven't Tried",
 * technique #8. Each verbose form mirrors the real CLI surface of an EXISTING
 * repo tool (commands only; the referenced tools are not modified).
 */

// 2-word cue -> canonical invocation + verbose natural-language form.
// All referenced tools already exist on origin/main (verified before authoring).
const CUE_TO_ENTRY = {
  "cost audit": {
    command: "node tools/agent-cost-analyzer.js",
    purpose:
      "Print a fleet-wide cost and token-usage rollup ranked cheapest-first for the active hermes-yolo session.",
  },
  "spin guard": {
    command: "node tools/agent-spin-detector.js",
    purpose:
      "Scan the active worktree for runaway agent loops and spinning tool recursion.",
  },
  "vault sync": {
    command: "node tools/linear-agent-bridge.js --coord-status",
    purpose:
      "Synchronize Linear issue locks with the AI-Agent-Sync vault Agent-State snapshots and print fleet coordination status.",
  },
  "ship claim": {
    command: "node tools/ship-claim-gate.js",
    purpose:
      "Open a pull request for the current claim and squash-merge it once required checks are green.",
  },
  "budget watch": {
    command: "node tools/api-token-budget-sync.js",
    purpose:
      "Sync API token spend and print remaining budget against the hard ten-dollar monthly cap.",
  },
};

const PROMPTS = Object.freeze(CUE_TO_ENTRY);

// Rough character->token rate (NLP avg ~4 chars/token). Floors at 1.
function charToTokens(chars) {
  return Math.max(1, Math.round(chars / 4));
}

/** All registered two-word cues. */
function listPrompts() {
  return Object.keys(PROMPTS);
}

/**
 * Resolve a two-word cue (case-insensitive, trimmed) to its canonical command
 * + purpose, or null if unknown.
 */
function resolveTwoWordPrompt(cue) {
  if (typeof cue !== "string") return null;
  const key = cue.trim().toLowerCase();
  return PROMPTS[key] ?? null;
}

/**
 * Estimated prompt-token savings of the 2-word cue vs the verbose natural-
 * language form. Positive => the cue is shorter than what it replaces.
 */
function estimateTokenSavings(cue) {
  const entry = resolveTwoWordPrompt(cue);
  if (!entry) return 0;
  return charToTokens(entry.purpose.length) - charToTokens(cue.trim().length);
}

/** Fleet-wide prompt-token savings if every cue replaced its verbose form. */
function fleetSavings() {
  return Object.keys(PROMPTS).reduce(
    (acc, cue) => acc + estimateTokenSavings(cue),
    0,
  );
}

module.exports = {
  PROMPTS,
  listPrompts,
  resolveTwoWordPrompt,
  estimateTokenSavings,
  fleetSavings,
};

if (require.main === module) {
  const rows = Object.entries(PROMPTS).map(([cue, entry]) => ({
    cue,
    command: entry.command,
    savesTokens: estimateTokenSavings(cue),
  }));
  console.log("cue          saves  command");
  rows.forEach((r) =>
    console.log(`${r.cue.padEnd(12)} ${String(r.savesTokens).padStart(5)}  ${r.command}`),
  );
  console.log(
    `\nfleet-wide prompt-token savings vs verbose: ${fleetSavings()} tokens/cue-set`,
  );
}
