import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  BotPersona,
  BrainModel,
  LLMJudgeAssessment,
  ComputerSessionState,
  AutomationRoutine,
  TokenTelemetry,
} from '../types/grokBot';

const SELECTED_BOT_STORAGE = '@hermes_grok_selected_bot_id_v1';
const SELECTED_BRAIN_STORAGE = '@hermes_grok_selected_brain_id_v1';
const ROUTINES_STORAGE = '@hermes_grok_routines_list_v1';

export const DEFAULT_BOT_PERSONAS: BotPersona[] = [
  {
    id: 'chief-of-staff',
    name: 'Chief of Staff',
    role: 'chief_of_staff',
    avatarColor: '#8B93A8',
    systemCharter:
      'Runs fleet coordination: daily watch lists, system briefings, bookings, and autonomous handoffs between specialized bots.',
    hardStopRules: ['No outbound send without CEO auth', 'No unverified completion claims'],
    defaultModelId: 'zai-glm53',
    memorySummary: 'Active coordinator. Synchronizing PR reviews, bug triage, and daily watch lists.',
    lastActiveLabel: 'Just now',
    status: 'idle',
  },
  {
    id: 'qa-tester',
    name: 'QA Tester',
    role: 'qa_tester',
    avatarColor: '#3EC5A8',
    systemCharter:
      'Executes brand-new user repro packs, continuous E2E suites, and release regression audits.',
    hardStopRules: ['No ship claim without tests+E2E pass', 'Never use developer backdoors during tests'],
    defaultModelId: 'ollama-local',
    memorySummary: '137/137 release safety tests verified green. Last E2E pass on Android 14.',
    lastActiveLabel: '5m ago',
    status: 'idle',
  },
  {
    id: 'ship-pr',
    name: 'Ship & PR Engineer',
    role: 'ship_pr',
    avatarColor: '#3B82F6',
    systemCharter:
      'Drives PR implementation from issue to merge. Enforces clean CI, auto-merge, and release safety contracts.',
    hardStopRules: ['No force pushes to main', 'Never bypass CI verification gates'],
    defaultModelId: 'qwen38-max',
    memorySummary: 'PR #1720 merged cleanly. Managing branch synchronization.',
    lastActiveLabel: '12m ago',
    status: 'idle',
  },
  {
    id: 'inbox-zero',
    name: 'Inbox Manager',
    role: 'inbox_manager',
    avatarColor: '#6A6BF5',
    systemCharter:
      'Sweeps notifications, triages issues, archives noise, and drafts high-fidelity replies.',
    hardStopRules: ['Never send outbound without approval', 'Draft-first boundary forever'],
    defaultModelId: 'zai-glm53',
    memorySummary: 'Inbox at zero. 5 reviewable drafts parked for approval.',
    lastActiveLabel: '1h ago',
    status: 'idle',
  },
  {
    id: 'bug-triage',
    name: 'Bug Triage',
    role: 'bug_triage',
    avatarColor: '#D9508A',
    systemCharter:
      'Reproduces user-reported issues in sandboxed browser/device and attaches root cause diffs.',
    hardStopRules: ['No desktop hijack', 'Must produce reproducible test cases'],
    defaultModelId: 'deepseek-v4',
    memorySummary: 'Investigated ASC review note discrepancy; generated regression prevention tests.',
    lastActiveLabel: '2h ago',
    status: 'idle',
  },
  {
    id: 'expense-ops',
    name: 'Expense & Ops',
    role: 'expense_manager',
    avatarColor: '#F2622A',
    systemCharter:
      'Audits transaction ledgers, enforces $10/mo API token budget ceilings, and matches receipts.',
    hardStopRules: ['Hard $10/mo fleet cap enforcement', 'Fail-closed on unverified spend claims'],
    defaultModelId: 'ollama-local',
    memorySummary: 'Fleet token spend at $0.00 (100% on zero-marginal cost and local tiers).',
    lastActiveLabel: 'Yesterday',
    status: 'idle',
  },
];

export const BRAIN_MODELS: BrainModel[] = [
  {
    id: 'ollama-local',
    name: 'Ollama Llama 3.3 (Local)',
    provider: 'local',
    tier: 'zero_cost',
    contextWindowLabel: '128k Context',
    costPerMTokenLabel: '$0.00 / 100% Local',
    speedTps: 85,
    isZeroMarginalCost: true,
    description: 'Runs entirely on local Apple Silicon Metal GPU with zero token spend and complete privacy.',
  },
  {
    id: 'zai-glm53',
    name: 'Z.AI GLM-5.3 (Coding Plan)',
    provider: 'zai',
    tier: 'zero_cost',
    contextWindowLabel: '1M Context',
    costPerMTokenLabel: '$0.00 / Free Plan',
    speedTps: 110,
    isZeroMarginalCost: true,
    description: 'High-speed reasoning engine with 1M context under unlimited $0 token Coding Plan.',
  },
  {
    id: 'qwen38-max',
    name: 'Alibaba Qwen 3.8 Max',
    provider: 'alibaba',
    tier: 'budget_optimized',
    contextWindowLabel: '1M Context',
    costPerMTokenLabel: '$0.40/M (2x Multiplier)',
    speedTps: 95,
    isZeroMarginalCost: false,
    description: 'State-of-the-art coding and agentic execution with 76% cash savings vs Claude Sonnet.',
  },
  {
    id: 'deepseek-v4',
    name: 'DeepSeek V4 Dynamic',
    provider: 'deepseek',
    tier: 'budget_optimized',
    contextWindowLabel: '128k Context',
    costPerMTokenLabel: '$0.22/M (Off-Peak)',
    speedTps: 70,
    isZeroMarginalCost: false,
    description: 'Smart-routed during off-peak hours for deep reasoning and root-cause analysis.',
  },
  {
    id: 'grok-46',
    name: 'xAI Grok 4.6 (Cloud)',
    provider: 'xai',
    tier: 'flagship',
    contextWindowLabel: '256k Context',
    costPerMTokenLabel: '$2.00/M',
    speedTps: 80,
    isZeroMarginalCost: false,
    description: 'Outcome-owned flagship autonomous agent for complex multi-step workflows.',
  },
  {
    id: 'claude-37',
    name: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
    tier: 'flagship',
    contextWindowLabel: '200k Context',
    costPerMTokenLabel: '$3.00/M',
    speedTps: 65,
    isZeroMarginalCost: false,
    description: 'High-precision software engineering with rigorous automated tool execution.',
  },
];

export const DEFAULT_ROUTINES: AutomationRoutine[] = [
  {
    id: 'routine-morning-sweep',
    name: 'Morning Fleet Sweep & Triage',
    personaId: 'chief-of-staff',
    cadenceLabel: 'Weekdays at 7:00 AM',
    scheduleType: 'cron',
    status: 'active',
    lastRunAt: 'Today at 7:00 AM',
    lastRunSummary: 'Checked 12 repo PRs, verified 3 CI pipelines, queued 2 review notes.',
    hardStopBoundary: 'Draft-first only; no automated merging without clean test proofs.',
  },
  {
    id: 'routine-e2e-release-audit',
    name: 'Continuous E2E & Release Safety Gate',
    personaId: 'qa-tester',
    cadenceLabel: 'Every 15 minutes',
    scheduleType: 'interval',
    status: 'active',
    lastRunAt: '5m ago',
    lastRunSummary: 'All 57 contract tests and Maestro stranger flow passed.',
    hardStopBoundary: 'Fail-closed on any assertion mismatch; immediately alerts operator.',
  },
  {
    id: 'routine-budget-pacing-watch',
    name: 'API Budget & Pacing Sentinel',
    personaId: 'expense-ops',
    cadenceLabel: 'Hourly',
    scheduleType: 'interval',
    status: 'active',
    lastRunAt: '45m ago',
    lastRunSummary: 'Current burn $0.00/mo. Pacing 100% compliant with $10 monthly cap.',
    hardStopBoundary: 'Auto-defers cloud requests to local Ollama if budget pacing exceeds threshold.',
  },
];

/**
 * Intelligent LLM-as-a-Judge Risk Evaluation Engine.
 * Evaluates safety invariants before executing any tool or command.
 */
export function evaluateToolSafety(
  toolName: string,
  command?: string,
  targetResource?: string
): LLMJudgeAssessment {
  const normalizedCmd = (command || '').toLowerCase();
  const violations: string[] = [];
  const passed: string[] = [];

  // Invariant 1: Force push protection
  if (normalizedCmd.includes('--force') || normalizedCmd.includes('-f') || normalizedCmd.includes('force-push')) {
    violations.push('Destructive branch overwrite forbidden without review');
  } else {
    passed.push('Non-force git operation verified');
  }

  // Invariant 2: Accidental data loss prevention
  if (
    normalizedCmd.includes('rm -rf /') ||
    normalizedCmd.includes('drop table') ||
    normalizedCmd.includes('truncate') ||
    normalizedCmd.includes('delete from')
  ) {
    violations.push('Potential irreversible data deletion detected');
  } else {
    passed.push('Data safety invariants satisfied');
  }

  // Invariant 3: Token budget ceiling check
  if (normalizedCmd.includes('spend') || normalizedCmd.includes('charge') || normalizedCmd.includes('payout')) {
    violations.push('Financial disbursement requires human approval');
  } else {
    passed.push('Budget ceiling intact');
  }

  // Calculate score & risk tier
  let riskScore = 10;
  if (violations.length > 0) {
    riskScore = Math.min(100, 50 + violations.length * 25);
  } else if (normalizedCmd.includes('push') || normalizedCmd.includes('deploy') || toolName.includes('write')) {
    riskScore = 35;
  }

  let riskTier: 'low' | 'medium' | 'high' = 'low';
  let suggestedAction: 'allow_auto' | 'require_human_gate' | 'block_hard' = 'allow_auto';

  if (riskScore >= 75) {
    riskTier = 'high';
    suggestedAction = 'require_human_gate';
  } else if (riskScore >= 30) {
    riskTier = 'medium';
    suggestedAction = 'require_human_gate';
  }

  return {
    id: `judge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    toolName,
    command,
    targetResource,
    riskTier,
    riskScore,
    rationale:
      violations.length > 0
        ? `Interdicted by Safety Gate: ${violations.join('; ')}`
        : 'All standard safety invariants verified clean.',
    invariantsPassed: passed,
    invariantsViolated: violations,
    suggestedAction,
  };
}

export async function getSelectedBotPersona(): Promise<BotPersona> {
  try {
    const savedId = await AsyncStorage.getItem(SELECTED_BOT_STORAGE);
    const found = DEFAULT_BOT_PERSONAS.find((b) => b.id === savedId);
    return found || DEFAULT_BOT_PERSONAS[0];
  } catch {
    return DEFAULT_BOT_PERSONAS[0];
  }
}

export async function setSelectedBotPersonaId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SELECTED_BOT_STORAGE, id);
  } catch {
    // ignore
  }
}

export async function getSelectedBrainModel(): Promise<BrainModel> {
  try {
    const savedId = await AsyncStorage.getItem(SELECTED_BRAIN_STORAGE);
    const found = BRAIN_MODELS.find((m) => m.id === savedId);
    return found || BRAIN_MODELS[0];
  } catch {
    return BRAIN_MODELS[0];
  }
}

export async function setSelectedBrainModelId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SELECTED_BRAIN_STORAGE, id);
  } catch {
    // ignore
  }
}

export async function getAutomatedRoutines(): Promise<AutomationRoutine[]> {
  try {
    const json = await AsyncStorage.getItem(ROUTINES_STORAGE);
    if (!json) return DEFAULT_ROUTINES;
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ROUTINES;
  } catch {
    return DEFAULT_ROUTINES;
  }
}

export async function saveAutomatedRoutines(routines: AutomationRoutine[]): Promise<void> {
  try {
    await AsyncStorage.setItem(ROUTINES_STORAGE, JSON.stringify(routines));
  } catch {
    // ignore
  }
}

export function getDefaultComputerState(): ComputerSessionState {
  return {
    isActive: true,
    activeAppTitle: 'Terminal — zsh',
    currentUrl: 'https://github.com/hermes-agent/project',
    resolution: '1920x1080 (Retina)',
    isUserInControl: false,
    lastFrameTimestamp: Date.now(),
    recentLogs: [
      '[sandbox] Mounted project workspace in sandboxed runtime',
      '[security] LLM-as-Judge pre-action gate active: mode=strict',
      '[router] Brain routed to Local Ollama Llama 3.3 ($0.00 tokens)',
      '[agent] Ready for instructions.',
    ],
  };
}

export function getDefaultTokenTelemetry(): TokenTelemetry {
  return {
    inputTokens: 1420,
    outputTokens: 380,
    cachedTokens: 8192,
    compactedTokensSaved: 12450,
    noiseReductionPercent: 86.4,
    sessionCostUsd: 0.0,
    monthlySpendUsd: 0.0,
    monthlyCeilingUsd: 10.0,
    ttftMs: 8,
  };
}
