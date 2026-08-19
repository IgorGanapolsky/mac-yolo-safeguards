export const HOSTED_PROVIDER_FALLBACK: ReadonlyArray<{
  readonly id: "supergrok" | "deepseek-free" | "poolside";
  readonly label: string;
  readonly model: string;
}>;

export const GATEWAY_BUDGET: "gateway-budget";

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
export function resolveHostedFallback(input?: {
  lastError?: string | null;
  error?: string | null;
  failedProviders?: string[];
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
}): boolean;
