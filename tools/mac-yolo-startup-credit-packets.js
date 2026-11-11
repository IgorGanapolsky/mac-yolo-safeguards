#!/usr/bin/env node
'use strict';

/**
 * mac-yolo-startup-credit-packets.js — Truth-Guardrailed Non-Dilutive Startup Credit Packets
 *
 * Prepares ready-to-submit, Truth-Guardrailed application packets for the 5 non-dilutive
 * cloud and AI startup credit programs identified via Instinct and ranked #1-#4 by
 * `gemini-decisions-engine.js` (`priorityScore: 2.69`):
 *   1. Cloudflare for Startups (up to $10,000 Workers, R2, Browser Rendering, AI Gateway)
 *   2. Microsoft for Startups Founders Hub (up to $150,000 Azure & OpenAI credits, no VC required)
 *   3. AWS Activate Founders ($1,000-$5,000 self-funded cloud infrastructure credits)
 *   4. ElevenLabs Startup Grants (12 months free scale-tier voice agent credits, 33M chars)
 *   5. Google Cloud for Startups ($2,000+ AI/Cloud start-tier credits for Gemini Decisions API & Vertex)
 *
 * Strict MONEY v6.0 & Truth Guardrails:
 *   - Scoped 100% to `mac-yolo-safeguards` (https://github.com/IgorGanapolsky/mac-yolo-safeguards)
 *     and `ThumbGate` (https://thumbgate.app).
 *   - Zero fabricated revenue, customer counts, or investor affiliations.
 *   - `unattendedSubmissionAllowed: false` — prepares verified copy-paste / 1-click packets
 *     for the owner without submitting external forms unattended.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PRODUCT_ID = 'mac-yolo-safeguards';
const UNATTENDED_SUBMISSION_ALLOWED = false;

const FORBIDDEN_UNVERIFIED_CLAIM_RE =
  /\b(?:\$\d+\s*[mk]\s*arr|\d+,\d+\s+paying\s+customers|backed\s+by\s+y\s+combinator|series\s+[abc]\s+funded|foreclosure|tax-deed|miami-dade|broward)\b/i;

const STARTUP_CREDIT_PROGRAMS = Object.freeze([
  {
    id: 'cloudflare-for-startups',
    programName: 'Cloudflare for Startups',
    applicationUrl: 'https://www.cloudflare.com/forstartups/',
    estimatedCreditValueUsd: { min: 5000, max: 10000 },
    equityDilutionPct: 0,
    eligibilityTier: 'Bootstrapped / Self-Funded Software Company with Live Domain (thumbgate.app)',
    workloadMapping:
      'Hosts thumbgate.app edge routing, R2 artifact storage, Browser Rendering verification, and AI Gateway caching for coding-agent pre-action interdiction.',
    applicationFields: {
      companyName: 'ThumbGate / Mac YOLO Safeguards',
      websiteUrl: 'https://thumbgate.app',
      repositoryUrl: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards',
      productDescription:
        'Mac YOLO Safeguards & ThumbGate is an open-source and commercial macOS runtime protection and mobile pre-action approval control plane for AI coding agents (Claude Code, Cursor, OpenAI Codex). It prevents macOS WindowServer swap freezes, reaps runaway subprocess storms, and gates destructive tool calls before execution.',
      technicalArchitecture:
        'Cloudflare DNS, Workers, and AI Gateway fronting thumbgate.app mobile approval webhooks, paired with a native Swift macOS menu bar HUD (MacYoloSafeguards.app) and a 16-tool Model Context Protocol (MCP) server.',
      fundingStage: 'Self-funded / Bootstrapped (Pre-Seed)',
    },
  },
  {
    id: 'microsoft-founders-hub',
    programName: 'Microsoft for Startups Founders Hub',
    applicationUrl: 'https://www.microsoft.com/en-us/startups',
    estimatedCreditValueUsd: { min: 1000, max: 150000 },
    equityDilutionPct: 0,
    eligibilityTier: 'Open to Self-Funded Builders (No Institutional Investor Required)',
    workloadMapping:
      'Offsets cloud model evaluation, GitHub Actions CI runner capacity, and cross-model adversarial review for Mac YOLO Safeguards PR and security gates.',
    applicationFields: {
      companyName: 'ThumbGate / Mac YOLO Safeguards',
      websiteUrl: 'https://thumbgate.app',
      repositoryUrl: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards',
      productDescription:
        'Developer safety and runtime governance control plane for autonomous coding agents. Provides a 16-tool MCP server, native macOS menu bar telemetry HUD, and mobile pre-action approval gate.',
      technicalArchitecture:
        'Node.js + Swift control plane integrated with GitHub Actions, GitHub Marketplace (thumbgate-security-gate), and MCP-compatible IDEs.',
      fundingStage: 'Self-funded / Bootstrapped',
    },
  },
  {
    id: 'aws-activate-founders',
    programName: 'AWS Activate Founders',
    applicationUrl: 'https://aws.amazon.com/startups/credits',
    estimatedCreditValueUsd: { min: 1000, max: 5000 },
    equityDilutionPct: 0,
    eligibilityTier: 'Self-Funded / Bootstrapped Startup (Activate Founders Tier)',
    workloadMapping:
      'Covers cloud webhook relay, DynamoDB/S3 audit trail persistence, and Bedrock fallback model routing for ThumbGate mobile pre-action approvals.',
    applicationFields: {
      companyName: 'ThumbGate / Mac YOLO Safeguards',
      websiteUrl: 'https://thumbgate.app',
      repositoryUrl: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards',
      productDescription:
        'Pre-action tool interdiction and macOS system freeze protection for engineering teams running Claude Code, Cursor, and Codex.',
      technicalArchitecture:
        'Hybrid local-first Apple Silicon runtime + cloud webhook approval relay with cryptographic SHA-256 audit receipts.',
      fundingStage: 'Self-funded / Bootstrapped',
    },
  },
  {
    id: 'elevenlabs-startup-grants',
    programName: 'ElevenLabs Startup Grants',
    applicationUrl: 'https://elevenlabs.io/startup-grants',
    estimatedCreditValueUsd: { min: 1200, max: 4000 },
    equityDilutionPct: 0,
    eligibilityTier: 'Early-Stage AI Product Integrating Conversational / Voice Alerting',
    workloadMapping:
      'Powers hands-free voice alerts and spoken mobile pre-action approval briefings in ThumbGate when a coding agent triggers a high-blast-radius command or macOS swap cliff.',
    applicationFields: {
      companyName: 'ThumbGate / Mac YOLO Safeguards',
      websiteUrl: 'https://thumbgate.app',
      repositoryUrl: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards',
      productDescription:
        'Mobile approval and voice-alert control plane for autonomous coding agents, alerting developers in real time before destructive Bash/git commands execute.',
      technicalArchitecture:
        'MCP pre-action hook + ElevenLabs conversational voice summary + mobile push approval.',
      fundingStage: 'Self-funded / Bootstrapped',
    },
  },
  {
    id: 'google-cloud-for-startups',
    programName: 'Google Cloud for Startups (Start Tier)',
    applicationUrl: 'https://cloud.google.com/startup',
    estimatedCreditValueUsd: { min: 2000, max: 2000 },
    equityDilutionPct: 0,
    eligibilityTier: 'Early-Stage / Bootstrapped AI Builder with Live Domain',
    workloadMapping:
      'Funds Gemini Decisions API (`gemini-decision-1` single-pass noul/choice/score control plane at $0.10/1M input tokens) for sub-250ms pre-action tool interdiction.',
    applicationFields: {
      companyName: 'ThumbGate / Mac YOLO Safeguards',
      websiteUrl: 'https://thumbgate.app',
      repositoryUrl: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards',
      productDescription:
        'Low-latency pre-action safety and macOS resource safeguard suite for AI coding agents, using Gemini Decision 1 for single-pass tool-call risk scoring and mobile escalation.',
      technicalArchitecture:
        'Gemini Decisions API (`gemini-decision-1`) + Meta FAIR e-means local codebook quantization router + macOS native Swift HUD.',
      fundingStage: 'Self-funded / Bootstrapped',
    },
  },
]);

function validateTruthGuardrails(packet) {
  if (!packet || typeof packet !== 'object') {
    throw new Error('ERR_INVALID_CREDIT_PACKET: Packet object required');
  }
  const serialized = JSON.stringify(packet);
  if (FORBIDDEN_UNVERIFIED_CLAIM_RE.test(serialized)) {
    const err = new Error(
      `ERR_FABRICATED_CLAIM_FORBIDDEN: Packet "${packet.id || 'unknown'}" contains unverified financial/customer claims or unrelated product terms.`,
    );
    err.code = 'ERR_FABRICATED_CLAIM_FORBIDDEN';
    throw err;
  }
  if (!serialized.includes('https://thumbgate.app') || !serialized.includes('mac-yolo-safeguards')) {
    const err = new Error(
      `ERR_PRODUCT_SCOPE_MISSING: Packet "${packet.id || 'unknown'}" must reference thumbgate.app and mac-yolo-safeguards.`,
    );
    err.code = 'ERR_PRODUCT_SCOPE_MISSING';
    throw err;
  }
  return { ok: true, id: packet.id };
}

function buildStartupCreditPacketsReport() {
  const validatedPackets = STARTUP_CREDIT_PROGRAMS.map((p) => {
    validateTruthGuardrails(p);
    return {
      ...p,
      truthGuardrailsVerified: true,
      unattendedSubmissionAllowed: UNATTENDED_SUBMISSION_ALLOWED,
    };
  });

  const totalMinUsd = validatedPackets.reduce((s, p) => s + p.estimatedCreditValueUsd.min, 0);
  const totalMaxUsd = validatedPackets.reduce((s, p) => s + p.estimatedCreditValueUsd.max, 0);

  return {
    ok: true,
    productId: PRODUCT_ID,
    unattendedSubmissionAllowed: UNATTENDED_SUBMISSION_ALLOWED,
    programsCount: validatedPackets.length,
    estimatedTotalNonDilutiveCreditsUsd: {
      min: totalMinUsd,
      max: totalMaxUsd,
    },
    packets: validatedPackets,
  };
}

if (require.main === module) {
  const report = buildStartupCreditPacketsReport();
  const outDir = path.join(os.homedir(), '.hermes', 'business_os', 'revenue');
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'startup-credit-packets-2026-11-11.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
  } catch {
    // ignore in read-only test envs
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

module.exports = {
  PRODUCT_ID,
  UNATTENDED_SUBMISSION_ALLOWED,
  STARTUP_CREDIT_PROGRAMS,
  validateTruthGuardrails,
  buildStartupCreditPacketsReport,
};
