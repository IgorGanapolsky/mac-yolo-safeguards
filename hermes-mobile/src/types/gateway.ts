import { HERMES_MOBILE_CLOUD_URL, THUMBGATE_API_URL } from '../constants/appIdentity';

export type GatewayHealthLevel = 'green' | 'amber' | 'red' | 'unknown';

export type GateDecision = 'approve' | 'reject';

export interface GateBlockedPayload {
  actionId: string;
  toolName: string;
  reason: string;
  command?: string;
  workspacePath?: string;
  diff?: string;
  runId?: string;
  allowPermanent?: boolean;
  /** Structured proposal fields (2026 unified approval UX). */
  source?: 'gateway_guard' | 'text_nudge' | 'relay_hook';
  approveText?: string;
  riskTier?: 'low' | 'medium' | 'high';
  rollbackHint?: string;
  sessionKey?: string;
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
  /** When actionId is a session key, run_id from gateway chat stream. */
  runId?: string;
  allowPermanent?: boolean;
  source?: 'gateway_guard' | 'text_nudge' | 'relay_hook';
  approveText?: string;
  riskTier?: 'low' | 'medium' | 'high';
  rollbackHint?: string;
  sessionKey?: string;
}

export interface GatewayHealthSnapshot {
  level: GatewayHealthLevel;
  status?: string;
  gatewayState?: string;
  pid?: number;
  platforms?: Record<string, { state?: string; error_message?: string }>;
  checkedAt: string;
  errorMessage?: string;
  hostname?: string;
  localIp?: string;
}

export interface GatewayEventMessage {
  event: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
}

export type ConnectionMode = 'relay' | 'gateway';

export type ApprovalPolicy = 'strict' | 'balanced' | 'autonomous';

export interface GatewaySettings {
  connectionMode: ConnectionMode;
  cloudUrl: string;
  gatewayUrl: string;
  usePortal: boolean;
  redactPii: boolean;
  notificationsEnabled: boolean;
  demoMode: boolean;
  /** Glanceable stack UI + audio-first feedback (AI glasses parity on phone). */
  glanceMode: boolean;
  /** Open Leash on launch and prioritize approval alerts (ThumbGate ops persona). */
  safetyMode: boolean;
  /** ThumbGate: capture thumbs-down verdicts to agent memory (default on). */
  thumbgateCaptureOnDown: boolean;
  /** ThumbGate: capture thumbs-up verdicts to agent memory (default off). */
  thumbgateCaptureOnUp: boolean;
  /** ThumbGate API base URL for /v1/feedback/capture. */
  thumbgateApiUrl: string;
  /** Operator approval friction — strict gates prod deploy; autonomous favors standing allow on Mac. */
  approvalPolicy: ApprovalPolicy;
  /** Product analytics (PostHog) — off when true. Default on in production builds with key. */
  analyticsOptOut: boolean;
  /** Whether to show tool execution messages (role tool/function) in transcripts. */
  includeToolActivity?: boolean;
}

export const DEFAULT_GATEWAY_SETTINGS: GatewaySettings = {
  connectionMode: 'gateway',
  cloudUrl: HERMES_MOBILE_CLOUD_URL,
  gatewayUrl: 'http://127.0.0.1:8642',
  usePortal: false,
  redactPii: true,
  notificationsEnabled: true,
  demoMode: false,
  glanceMode: false,
  safetyMode: false,
  thumbgateCaptureOnDown: true,
  thumbgateCaptureOnUp: false,
  thumbgateApiUrl: THUMBGATE_API_URL,
  approvalPolicy: 'balanced',
  analyticsOptOut: false,
  includeToolActivity: true,
};
