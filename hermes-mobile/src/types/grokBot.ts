/**
 * Grok Bot architecture types for Hermes Mobile.
 * Encapsulates bot personas, mixture of experts (MoE) brain models,
 * intelligent LLM-as-judge safety assessments, live computer sessions,
 * and scheduled outcome-owned routines.
 */

export type BotRole =
  | 'chief_of_staff'
  | 'qa_tester'
  | 'ship_pr'
  | 'inbox_manager'
  | 'bug_triage'
  | 'expense_manager'
  | 'sales_outbound'
  | 'custom';

export interface BotPersona {
  id: string;
  name: string;
  role: BotRole;
  avatarColor: string;
  systemCharter: string;
  hardStopRules: string[];
  defaultModelId: string;
  memorySummary?: string;
  lastActiveLabel?: string;
  status: 'idle' | 'working' | 'awaiting_approval';
}

export type BrainTier = 'zero_cost' | 'budget_optimized' | 'flagship';

export interface BrainModel {
  id: string;
  name: string;
  provider: 'local' | 'zai' | 'alibaba' | 'deepseek' | 'xai' | 'anthropic' | 'openai';
  tier: BrainTier;
  contextWindowLabel: string;
  costPerMTokenLabel: string;
  speedTps: number;
  isZeroMarginalCost: boolean;
  description: string;
}

export type JudgeRiskTier = 'low' | 'medium' | 'high';

export interface LLMJudgeAssessment {
  id: string;
  toolName: string;
  command?: string;
  targetResource?: string;
  riskTier: JudgeRiskTier;
  riskScore: number; // 0 - 100
  rationale: string;
  invariantsPassed: string[];
  invariantsViolated: string[];
  suggestedAction: 'allow_auto' | 'require_human_gate' | 'block_hard';
  diff?: string;
}

export interface ComputerSessionState {
  isActive: boolean;
  activeAppTitle: string;
  currentUrl?: string;
  resolution: string;
  isUserInControl: boolean;
  lastFrameTimestamp?: number;
  recentLogs: string[];
}

export interface AutomationRoutine {
  id: string;
  name: string;
  personaId: string;
  cadenceLabel: string;
  scheduleType: 'cron' | 'interval' | 'webhook' | 'event';
  status: 'active' | 'paused' | 'running';
  lastRunAt?: string;
  lastRunSummary?: string;
  hardStopBoundary: string;
}

export interface TokenTelemetry {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  compactedTokensSaved: number;
  noiseReductionPercent: number;
  sessionCostUsd: number;
  monthlySpendUsd: number;
  monthlyCeilingUsd: number;
  ttftMs: number;
}
