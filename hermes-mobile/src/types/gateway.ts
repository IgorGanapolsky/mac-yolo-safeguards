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
  /** Direct HTTP to :8642 on the saved gateway URL (distinct from relay cloud health). */
  directGatewayReachable?: boolean;
  /** /health returned ok but authenticated chat probe returned 401/403. */
  authMismatch?: boolean;
}

export interface GatewayEventMessage {
  event: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
}

export type ConnectionMode = 'relay' | 'gateway';

export type ApprovalPolicy = 'strict' | 'balanced' | 'autonomous';
export type HermesPersona = 'operator' | 'coach' | 'spark';
export type HermesAvatar = 'orb' | 'bolt' | 'navigator' | 'guardian';

export interface GatewaySettings {
  connectionMode: ConnectionMode;
  cloudUrl: string;
  gatewayUrl: string;
  usePortal: boolean;
  redactPii: boolean;
  /** Master flag — true when any per-purpose notification toggle is on (derived on save). */
  notificationsEnabled: boolean;
  /** Time-sensitive approval requests (Approve / Deny on lock screen). */
  notificationApprovals: boolean;
  /** Ongoing runs the user started while Hermes is in the background. */
  notificationLiveRunStatus: boolean;
  /** Task finish summaries (success or failure). */
  notificationCompletion: boolean;
  demoMode: boolean;
  /** Glanceable stack UI + audio-first feedback (AI glasses parity on phone). */
  glanceMode: boolean;
  /** Prioritize lock-screen approval alerts (ThumbGate ops persona). Does not change launch tab. */
  safetyMode: boolean;
  /** ThumbGate: capture thumbs-down verdicts to agent memory (default on). */
  thumbgateCaptureOnDown: boolean;
  /** ThumbGate: capture thumbs-up verdicts to agent memory (default on). */
  thumbgateCaptureOnUp: boolean;
  /** ThumbGate API base URL for /v1/feedback/capture. */
  thumbgateApiUrl: string;
  /** Operator approval friction — strict gates prod deploy; autonomous favors standing allow on Mac. */
  approvalPolicy: ApprovalPolicy;
  /** Product analytics (PostHog) — off when true. Default on in production builds with key. */
  analyticsOptOut: boolean;
  /** ThumbGate Pro — unlocks ThumbGate Leash (mobile approval relay + memory gates). */
  thumbgateProActive: boolean;
  /** Developer backdoor: unlock Leash without IAP (gesture / deep link / pair script). */
  developerLeashUnlock?: boolean;
  /** Route chat "confirm proceed" prompts to Leash tab instead of composer chips. */
  routeChatConfirmationsToLeash?: boolean;
  /** Whether to show tool execution messages (role tool/function) in transcripts. */
  includeToolActivity?: boolean;
  /** Presentation/personality skin for mobile chat. Style only; execution directives still win. */
  hermesPersona?: HermesPersona;
  /** Local avatar skin shown in Chat and Settings. */
  hermesAvatar?: HermesAvatar;
  /** Lightweight animated presence cues. */
  playfulMotion?: boolean;
  /** User dismissed first-run ConnectMacGate — show ChatConnectionPanel instead of re-trapping. */
  connectMacGateDismissed?: boolean;
}

export const DEFAULT_GATEWAY_SETTINGS: GatewaySettings = {
  connectionMode: 'relay',
  cloudUrl: HERMES_MOBILE_CLOUD_URL,
  gatewayUrl: '',
  usePortal: false,
  redactPii: true,
  notificationsEnabled: true,
  notificationApprovals: true,
  /** Opt-in quiet shade only — default off so backgrounding never pops a run HUD. */
  notificationLiveRunStatus: false,
  /** Quiet shade when a run finishes — never heads-up; disable in Settings. */
  notificationCompletion: true,
  demoMode: false,
  glanceMode: false,
  safetyMode: false,
  thumbgateCaptureOnDown: true,
  thumbgateCaptureOnUp: true,
  thumbgateApiUrl: THUMBGATE_API_URL,
  approvalPolicy: 'balanced',
  analyticsOptOut: false,
  thumbgateProActive: false,
  developerLeashUnlock: false,
  routeChatConfirmationsToLeash: true,
  includeToolActivity: false,
  hermesPersona: 'operator',
  hermesAvatar: 'orb',
  playfulMotion: true,
};
