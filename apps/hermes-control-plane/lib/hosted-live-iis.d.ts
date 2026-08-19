export const GRB: {
  readonly LOADED: 1;
  readonly OPTIMAL: 2;
  readonly INFEASIBLE: 3;
  readonly INF_OR_UNBD: 4;
  readonly UNBOUNDED: 5;
};

export const IISMethod: 1;

export const CONSTR: {
  readonly runner_healthy: "runner_healthy";
  readonly model_alive: "model_alive";
  readonly spend_zero_or_approved: "spend_zero_or_approved";
  readonly gateway_budget: "gateway-budget";
  readonly runner_identity: "runner_identity";
  readonly browser_healthy: "browser_healthy";
};

export type HostedLiveFacts = {
  runnerHealthy?: boolean;
  modelAlive?: boolean;
  spendUsd?: number;
  spendApproved?: boolean;
  runnerIdentity?: string | null;
  runnerHealthUrl?: string | null;
  browserHealthy?: boolean | null;
};

export type HostedLiveIIS = {
  IISMethod: 1;
  IISConstr: Record<string, number>;
  IISConstrName: string[];
};

export type HostedLiveOptimize = HostedLiveIIS & {
  Status: 2 | 3;
  ObjVal: 0 | 1;
  live: boolean;
};

export type HostedLiveCertificate = HostedLiveOptimize & {
  feasible: boolean;
  certificate:
    | { kind: "feasibility"; live: true; IISConstrName: [] }
    | { kind: "IIS"; live: false; IISConstrName: string[] };
};

export function computeIIS(input?: HostedLiveFacts): HostedLiveIIS;
export function optimizeHostedLive(input?: HostedLiveFacts): HostedLiveOptimize;
export function certifyHostedLive(input?: HostedLiveFacts): HostedLiveCertificate;
