export type GatewayHealthLevel = 'green' | 'amber' | 'red' | 'unknown';

export type GateDecision = 'approve' | 'reject';

export interface GateBlockedPayload {
  actionId: string;
  toolName: string;
  reason: string;
  command?: string;
  workspacePath?: string;
  diff?: string;
}

export interface ReclaimFiredPayload {
  target: string;
  rssReclaimedMb?: number;
  triggerCondition?: string;
}

export interface PendingApproval {
  actionId: string;
  toolName: string;
  reason: string;
  command?: string;
  workspacePath?: string;
  diff?: string;
  receivedAt: string;
}

export interface GatewayHealthSnapshot {
  level: GatewayHealthLevel;
  status?: string;
  gatewayState?: string;
  pid?: number;
  platforms?: Record<string, { state?: string; error_message?: string }>;
  checkedAt: string;
  errorMessage?: string;
}

export interface GatewayEventMessage {
  event: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
}

export type ConnectionMode = 'agentleash' | 'gateway';

export interface GatewaySettings {
  connectionMode: ConnectionMode;
  cloudUrl: string;
  gatewayUrl: string;
  usePortal: boolean;
  redactPii: boolean;
  notificationsEnabled: boolean;
  demoMode: boolean;
}

export const DEFAULT_GATEWAY_SETTINGS: GatewaySettings = {
  connectionMode: 'agentleash',
  cloudUrl: 'https://agentleash-cloud.fly.dev',
  gatewayUrl: 'http://127.0.0.1:8642',
  usePortal: false,
  redactPii: true,
  notificationsEnabled: true,
  demoMode: false,
};
