export const HOSTED_PROVIDER_FALLBACK: ReadonlyArray<{
  readonly id: "supergrok" | "deepseek-free" | "poolside";
  readonly label: string;
  readonly model: string;
  readonly deepModel?: string;
}>;

export const GATEWAY_BUDGET: "gateway-budget";
export const PAID_METER_IDS: ReadonlyArray<"supergrok" | "poolside">;
export const NAMED_FREE_FALLBACK: "deepseek-free";
export const CONSUMER_SUB_METERS: ReadonlyArray<"chatgpt-plus" | "codex-sub" | "codex-sdk">;

export type HostedFallbackResult = {
  order: Array<"supergrok" | "deepseek-free" | "poolside">;
  failedProviders: string[];
  selected: { id: string; label: string; model: string } | null;
  failover: boolean;
  modelAlive: boolean;
  vpsDead: false;
  exhausted: boolean;
};

export function isQuotaOrFailedRow(text?: string | null): boolean;
export function inferFailedProvider(text?: string | null): "supergrok" | "deepseek-free" | "poolside";
export function selectPoolsideHostedModel(input?: {
  taskCategory?: string;
  requiresVision?: boolean;
  sensitive?: boolean;
  privacyRequired?: "local" | "fenced" | "third_party";
  maxTokens?: number;
  longHorizon?: boolean;
  complexity?: string;
}): "poolside/laguna-xs-2.1" | "poolside/laguna-s-2.1" | null;
export function resolveHostedFallback(input?: {
  lastError?: string | null;
  error?: string | null;
  failedProviders?: string[];
  taskCategory?: string;
  requiresVision?: boolean;
  sensitive?: boolean;
  privacyRequired?: "local" | "fenced" | "third_party";
  maxTokens?: number;
  longHorizon?: boolean;
  complexity?: string;
}): HostedFallbackResult;
export function gatewayBudgetApproved(input?: {
  spendUsd?: number;
  spendApproved?: boolean;
}): boolean;
export function namedRunnerIdentity(value?: string | null): string | null;
export function resolveNamedRunnerIdentity(input?: {
  runnerIdentity?: string | null;
  runnerHealthUrl?: string | null;
}): string | null;
export function shouldKeepCallingRoute(input?: {
  spendUsd?: number;
  spendApproved?: boolean;
  lastError?: string | null;
  failedProviders?: string[];
  turningOn?: boolean;
  runnerIdentity?: string | null;
  meter?: string | null;
  meters?: string[];
}): boolean;
export function paidMetersForJob(input?: {
  spendUsd?: number;
  spendApproved?: boolean;
  lastError?: string | null;
  failedProviders?: string[];
  turningOn?: boolean;
  runnerIdentity?: string | null;
  meter?: string | null;
  meters?: string[];
}): string[];
export function shouldFirePaidMeter(input?: {
  spendUsd?: number;
  spendApproved?: boolean;
  lastError?: string | null;
  failedProviders?: string[];
  turningOn?: boolean;
  runnerIdentity?: string | null;
  meter?: string | null;
  meters?: string[];
}): boolean;
