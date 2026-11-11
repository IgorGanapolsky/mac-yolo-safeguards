#!/usr/bin/env node
'use strict';

/**
 * tools/mac-yolo-mcp-server.js — Official MCP Server (stdio, JSON-RPC 2.0) for mac-yolo-safeguards
 *
 * Packages mac-yolo-safeguards as a commercial & open-source MCP server for
 * Claude Code, Cursor, OMP, Codex, Windsurf, and Goose.
 *
 * Tools:
 *   - yolo_health_status:      Live macOS load average, simulator count, memory pressure & daemon status
 *   - yolo_confidence_flags:   Spotify Confidence ACTIVE flags, typed variant resolution & "what is worth building"
 *   - yolo_guardrails_audit:   Unified Supabase Declarative Schema + Anti-Paperclipping + IBM 3-Axis Confusion + Tailscale audit
 *   - yolo_token_budget_gate:  $10/mo hard metered token cap + Z.ai GLM-5.3 / local Ollama $0 fallback check
 *   - yolo_reap_simulators:    Safe inspection/reaping of runaway iOS Simulator processes (never touches GUI apps)
 *   - yolo_business_catalog:   5-tier commercial product, license, and instant-checkout catalog
 *   - yolo_agent_guard:        Agent processes by kind, process storms, storm cleanup, and Claude kill incidents
 */

const os = require('os');
const readline = require('readline');
const { execFileSync } = require('child_process');
const {
  listFlags,
  resolveFlagWithExposure,
  synthesizeWhatIsWorthBuilding,
} = require('./spotify-confidence-flags-steal');
const { runAllChecks: runSupabaseIbmChecks } = require('./supabase-ibm-agent-guardrails');
const { runAllTailscaleSteals } = require('./tailscale-october-steals');
const { getBudgetPacingStatus } = require('./openrouter-budget-guard');
const { OFFERS } = require('./mac-yolo-24x7-promote');

const SERVER_NAME = 'mac-yolo-safeguards';
const SERVER_VERSION = '1.0.0';

function getLiveMacMetrics() {
  const load = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  let simCount = 0;
  try {
    const out = execFileSync('pgrep', ['-f', 'simruntime|launchd_sim'], { encoding: 'utf8' }).trim();
    simCount = out ? out.split('\n').filter(Boolean).length : 0;
  } catch {
    simCount = 0;
  }
  return {
    platform: process.platform,
    arch: process.arch,
    loadAvg1m: Number((load[0] || 0).toFixed(2)),
    loadAvg5m: Number((load[1] || 0).toFixed(2)),
    simRuntimeProcesses: simCount,
    simRunawayHealthy: simCount <= 4 && (load[0] || 0) < 45,
    freeMemoryPct: Number(((freeMem / totalMem) * 100).toFixed(1)),
  };
}

function getToolDefinitions() {
  return [
    {
      name: 'yolo_health_status',
      title: 'macOS Health & Safeguard Status',
      description: 'Get live macOS load average, iOS Simulator process count, memory headroom, and safeguard status',
      annotations: {
        title: 'macOS Health & Safeguard Status',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'yolo_confidence_flags',
      title: 'Spotify Confidence Feature Flags & Guardrails',
      description: 'List Spotify Confidence feature flags (state=ACTIVE), resolve a typed flag with exposure logging, or synthesize what is worth building',
      annotations: {
        title: 'Spotify Confidence Feature Flags & Guardrails',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'resolve', 'worth_building'], default: 'list' },
          state: { type: 'string', default: 'ACTIVE' },
          flagKey: { type: 'string' },
          subjectId: { type: 'string' },
        },
      },
    },
    {
      name: 'yolo_guardrails_audit',
      title: 'Unified Agent Guardrails & Security Audit',
      description: 'Run unified Supabase Declarative Schema + Anti-Paperclipping DB + IBM 3-Axis Pre-Production Confusion + Tailscale (scurgery, MagicRoute, Tailworm) audit',
      annotations: {
        title: 'Unified Agent Guardrails & Security Audit',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'yolo_token_budget_gate',
      title: 'Metered API Token Budget Gate',
      description: 'Check the $10/mo metered API token budget ceiling and zero-spend fallback route',
      annotations: {
        title: 'Metered API Token Budget Gate',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'yolo_reap_simulators',
      title: 'Safe iOS Simulator Runaway Reaper',
      description: 'Safely inspect or reap runaway iOS Simulator processes exceeding threshold without touching foreground GUI apps',
      annotations: {
        title: 'Safe iOS Simulator Runaway Reaper',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean', default: true },
        },
      },
    },
    {
      name: 'yolo_business_catalog',
      title: 'Commercial Product & Pricing Catalog',
      description: 'Return the packaged mac-yolo-safeguards product suite (MCP Server, Native Mac Menu Bar App, HTTP Service) and 5-tier commercial pricing ladder',
      annotations: {
        title: 'Commercial Product & Pricing Catalog',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'yolo_sdlc_10_prompts',
      title: 'SDLC AI Prompts & Non-Coding Executors',
      description: 'GitLab 10 SDLC AI Prompts & 80% non-coding SDLC executors (breaking-change detector, doc-drift detector, release-notes compiler, pipeline RCA)',
      annotations: {
        title: 'SDLC AI Prompts & Non-Coding Executors',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        type: 'object',
        properties: {
          promptId: { type: 'string' },
          variables: { type: 'object' },
        },
      },
    },
    {
      name: 'yolo_revenue_observability',
      title: 'Cross-Fleet Revenue & Funnel Observability',
      description: 'Funnel and pipeline numbers read from the latest Mac YOLO, ThumbGate and Dayglass receipt files (null when a receipt is missing). Does not measure cash; read Stripe and Gumroad for paid orders.',
      annotations: {
        title: 'Cross-Fleet Revenue & Funnel Observability',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'yolo_disk_smart_scan',
      title: 'Disk Space Lens & Smart Temp Cache Scan',
      description: 'Disk Space Lens, Smart Scan, safe 1-click agent temp cache purge, and native macOS notification',
      annotations: {
        title: 'Disk Space Lens & Smart Temp Cache Scan',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        type: 'object',
        properties: {
          clean: { type: 'boolean', default: false },
          notify: { type: 'boolean', default: false },
        },
      },
    },
    {
      name: 'yolo_agent_guard',
      title: 'AI Agent Process Storm & Memory Guard',
      description: 'AI agent processes by kind, process storms (one command in 40+ copies), memory pressure, and saved incidents where several Claude Code processes were killed at once. action=clean stops storms and extra copies of orphaned MCP servers; action=pressure gives the memory pressure verdict and, when not normal, the same cleanup. Both are dry runs unless execute=true and never touch live sessions or the MCP servers and hooks they launched.',
      annotations: {
        title: 'AI Agent Process Storm & Memory Guard',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['status', 'clean', 'pressure', 'incidents'], default: 'status' },
          execute: { type: 'boolean', default: false },
        },
      },
    },
    {
      name: 'yolo_local_models',
      title: 'Local Model Memory Check',
      description: 'Local LLMs loaded right now (Ollama, llama.cpp, MLX, LM Studio), how much RAM they hold, model folders on disk, and when a smaller quantization (Q4_K_M) would free memory for coding agents. Read-only: never stops or deletes a model.',
      annotations: {
        title: 'Local Model Memory Check',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'yolo_system_care',
      title: '5-Pillar macOS Smart Care Scan',
      description: '5-Pillar Smart Care Scan (Cleanup, Protection, Performance/Browser Care/LaunchAgents, Applications/Installers, My Clutter) + Status Bar Icon toggle',
      annotations: {
        title: '5-Pillar macOS Smart Care Scan',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        type: 'object',
        properties: {
          clean: { type: 'boolean', default: false },
          showStatusBarIcon: { type: 'boolean' },
        },
      },
    },
    {
      name: 'yolo_wabi_sales_ops',
      title: 'Collaborative Deal Plan & Checkout Recovery',
      description: 'Wabi-driven collaborative sales operations: Shared Fleet Plan & ROI Mini-App, Shared 48h Deal Countdown Widget, and Email/Checkout Deadline Recovery Scanner',
      annotations: {
        title: 'Collaborative Deal Plan & Checkout Recovery',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          teamMacs: { type: 'number', default: 8 },
        },
      },
    },
  ];
}

function callTool(name, args = {}) {
  if (name === 'yolo_health_status') {
    const mac = getLiveMacMetrics();
    const budget = getBudgetPacingStatus();
    return {
      ok: mac.simRunawayHealthy && budget.allowPaid,
      product: SERVER_NAME,
      version: SERVER_VERSION,
      mac,
      tokenBudget: {
        monthlyCapUsd: budget.monthlyBudgetCapUsd,
        currentSpentUsd: budget.currentSpentUsd,
        remainingUsd: budget.remainingBudgetUsd,
        pacingStatus: budget.pacingStatus,
      },
    };
  }

  if (name === 'yolo_confidence_flags') {
    const action = args.action || 'list';
    if (action === 'resolve') {
      return resolveFlagWithExposure(args.flagKey || 'yolo-sim-runaway-reaper', {
        subjectId: args.subjectId || 'mcp-client',
        metrics: { loadAvg: getLiveMacMetrics().loadAvg1m, errorRate: 0 },
      });
    }
    if (action === 'worth_building') {
      return synthesizeWhatIsWorthBuilding({
        approvedIds: ['rec-packaged-mcp-and-mac-app', 'rec-realtime-hud-window-switch'],
      });
    }
    return listFlags({ state: args.state || 'ACTIVE' });
  }

  if (name === 'yolo_guardrails_audit') {
    const supabaseIbm = runSupabaseIbmChecks();
    const tailscale = runAllTailscaleSteals();
    return {
      ok: supabaseIbm.ok && tailscale.ok,
      supabaseIbm,
      tailscale,
    };
  }

  if (name === 'yolo_token_budget_gate') {
    return getBudgetPacingStatus();
  }

  if (name === 'yolo_reap_simulators') {
    const mac = getLiveMacMetrics();
    const dryRun = args.dryRun !== false;
    let reaped = false;
    if (!dryRun && !mac.simRunawayHealthy && process.platform === 'darwin') {
      try {
        execFileSync('xcrun', ['simctl', 'shutdown', 'all'], { timeout: 10000 });
        reaped = true;
      } catch {
        reaped = false;
      }
    }
    return {
      ok: true,
      dryRun,
      reaped,
      simRuntimeProcesses: mac.simRuntimeProcesses,
      loadAvg1m: mac.loadAvg1m,
      guiAppsUntouched: true,
    };
  }

  if (name === 'yolo_business_catalog') {
    return {
      ok: true,
      productSuite: {
        mcpServer: 'bin/mac-yolo-mcp (registered in .mcp.json as mac-yolo-safeguards)',
        macMenuBarApp: '/Applications/MacYoloSafeguards.app (built from macos/MacYoloSafeguardsApp.swift)',
        backgroundService: 'http://127.0.0.1:8766 (com.iganapolsky.mac-yolo-safeguards-service)',
      },
      tiers: OFFERS,
    };
  }

  if (name === 'yolo_sdlc_10_prompts') {
    const {
      SDLC_10_PROMPTS,
      renderSdlcPrompt,
      runAllGitlabSdlcChecks,
    } = require('./gitlab-10-sdlc-prompts-steal');
    if (args.promptId) {
      return renderSdlcPrompt(args.promptId, args.variables || {});
    }
    return {
      ...runAllGitlabSdlcChecks(),
      prompts: SDLC_10_PROMPTS,
    };
  }

  if (name === 'yolo_revenue_observability') {
    const fs = require('fs');
    const path = require('path');
    const home = os.homedir();
    const readJsonSafe = (p) => {
      try {
        return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
      } catch {
        return null;
      }
    };
    const yoloReceipt = readJsonSafe(path.join(home, '.hermes', 'receipts', 'mac-yolo-24x7-promote-latest.json'));
    const tgReceipt = readJsonSafe(path.join(home, 'workspace', 'ThumbGate', '.thumbgate', 'make-money-last-run.json'));
    const dgReceipt = readJsonSafe(path.join(home, '.dayglass', 'make-money-last-run.json'));
    // Every number comes from a receipt file read now, or is null. Hand-typed figures
    // were removed because callers took them for live data.
    const tgFunnel = tgReceipt?.stages?.stage1Funnel?.funnelBaseline ?? null;
    const dgBoard = dgReceipt?.stages?.stage1_funnel_and_checkout_truth?.scoreboard_summary ?? null;
    const missingReceipts = [
      ['macYolo', yoloReceipt],
      ['thumbgate', tgReceipt],
      ['dayglass', dgReceipt],
    ].filter(([, r]) => !r).map(([k]) => k);
    return {
      ok: true,
      honestyContract: 'Every number is read from a receipt file during this call, or is null. Nothing here is an estimate. Cash is not measured here: read paid orders from Stripe and Gumroad.',
      cashMeasured: false,
      receipts: {
        macYolo: yoloReceipt ? { openPipelineGrossUsd: yoloReceipt.openPipelineGrossUsd ?? null } : null,
        thumbgate: tgReceipt
          ? {
              visitors30d: tgFunnel?.visitors30d ?? null,
              ctaClicks30d: tgFunnel?.ctaClicks30d ?? null,
              expectedPipelineUsd: tgReceipt?.stages?.stage2Promotion?.expectedPipelineUsd ?? null,
            }
          : null,
        dayglass: dgReceipt
          ? { gitClones: dgBoard?.dayglass_mac_clones?.count ?? null, dmgDownloads: dgBoard?.github_dmg_downloads ?? null }
          : null,
      },
      missingReceipts,
      observabilityGaps: {
        localStripeSecretInShellEnv: Boolean(process.env.STRIPE_SECRET_KEY),
        plausibleApiKeyInShellEnv: Boolean(process.env.PLAUSIBLE_API_KEY),
      },
    };
  }

  if (name === 'yolo_agent_guard') {
    const agentGuard = require('./mac-yolo-agent-guard');
    if (args.action === 'clean') return agentGuard.clean({ execute: args.execute === true });
    if (args.action === 'pressure') return agentGuard.relieve({ execute: args.execute === true });
    if (args.action === 'incidents') return { ok: true, incidents: agentGuard.listIncidents(20) };
    return agentGuard.status();
  }
  if (name === 'yolo_disk_smart_scan') {
    const { runDiskSmartScan, runDiskSmartClean } = require('./mac-yolo-disk-guard');
    if (args.clean) {
      return runDiskSmartClean({ notify: args.notify !== false });
    }
    return runDiskSmartScan();
  }
  if (name === 'yolo_local_models') {
    return require('./mac-yolo-local-models').scan();
  }
  if (name === 'yolo_system_care') {
    const {
      runFivePillarSmartCare,
      setStatusBarIconVisibility,
    } = require('./mac-yolo-system-care-engine');
    if (typeof args.showStatusBarIcon === 'boolean') {
      setStatusBarIconVisibility(args.showStatusBarIcon);
    }
    return runFivePillarSmartCare({ clean: Boolean(args.clean) });
  }
  if (name === 'yolo_wabi_sales_ops') {
    const { runWabiSalesOperations } = require('./wabi-sales-operations-engine');
    return runWabiSalesOperations(args);
  }
  throw new Error(`Unknown tool: ${name}`);
}

function handleRpcRequest(req) {
  const { id, method, params } = req || {};
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: (params && params.protocolVersion) || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    };
  }
  if (method === 'notifications/initialized') {
    return null;
  }
  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: getToolDefinitions() },
    };
  }
  if (method === 'tools/call') {
    try {
      const data = callTool(params?.name, params?.arguments || {});
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          isError: false,
        },
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, error: err.message }) }],
          isError: true,
        },
      };
    }
  }
  if (id !== undefined) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }
  return null;
}

function startStdioServer() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const req = JSON.parse(trimmed);
      const resp = handleRpcRequest(req);
      if (resp) {
        process.stdout.write(`${JSON.stringify(resp)}\n`);
      }
    } catch (err) {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: err.message } })}\n`,
      );
    }
  });
}

if (require.main === module) {
  startStdioServer();
}

module.exports = {
  SERVER_NAME,
  SERVER_VERSION,
  getLiveMacMetrics,
  getToolDefinitions,
  callTool,
  handleRpcRequest,
};
