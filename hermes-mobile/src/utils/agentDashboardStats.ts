import type { HermesCronJob, HermesSkill, HermesToolset } from '../types/gatewayApi';
import type { GatewayHealthSnapshot } from '../types/gateway';
import type { LeashConnectionState } from './gatewayEndpoint';

export type AgentDashboardStats = {
  toolsetCount: number;
  toolCount: number;
  skillCount: number;
  cronJobCount: number;
  activeCronCount: number;
  gatewayModel: string | null;
  connectionLabel: string;
  hostname: string | null;
};

export function countToolsFromToolsets(toolsets: HermesToolset[]): number {
  return toolsets.reduce((sum, ts) => sum + (ts.tools?.length ?? 0), 0);
}

export function countActiveCronJobs(jobs: HermesCronJob[]): number {
  return jobs.filter((job) => !job.paused && job.enabled !== false).length;
}

/**
 * Short status for the Agent dashboard first column (narrow; must not ellipsize to "Computer…").
 * Never use multi-word phrases like "Computer linked" — they clip into nonsense next to "Link".
 */
export function resolveConnectionHealthLabel(
  connectionState: LeashConnectionState,
  health?: GatewayHealthSnapshot | null,
  macHttpReachable = false,
): string {
  if (connectionState === 'demo') {
    return 'Demo';
  }
  if (health?.authMismatch) {
    return 'Re-pair';
  }
  if (macHttpReachable || health?.level === 'green') {
    return 'Connected';
  }
  if (connectionState === 'connecting') {
    return 'Checking';
  }
  if (health?.level === 'amber') {
    return 'Weak';
  }
  if (health?.level === 'red') {
    return 'Offline';
  }
  return 'Offline';
}

/** Full plain-English line for Connection health hub (has room to breathe). */
export function resolveConnectionHealthSummary(
  connectionState: LeashConnectionState,
  health?: GatewayHealthSnapshot | null,
  macHttpReachable = false,
): string {
  if (connectionState === 'demo') {
    return 'Demo mode';
  }
  if (health?.authMismatch) {
    return 'Pair again — key does not match this Mac';
  }
  if (macHttpReachable || health?.level === 'green') {
    return 'Your Mac is connected';
  }
  if (connectionState === 'connecting') {
    return 'Checking your Mac…';
  }
  if (health?.level === 'amber') {
    return 'Connection is weak';
  }
  if (health?.level === 'red') {
    return "Can't reach your Mac";
  }
  return "Can't reach your Mac";
}

export function buildAgentDashboardStats(input: {
  toolsets: HermesToolset[];
  skills: HermesSkill[];
  jobs: HermesCronJob[];
  gatewayModel: string | null;
  connectionState: LeashConnectionState;
  health?: GatewayHealthSnapshot | null;
  macHttpReachable?: boolean;
}): AgentDashboardStats {
  return {
    toolsetCount: input.toolsets.length,
    toolCount: countToolsFromToolsets(input.toolsets),
    skillCount: input.skills.length,
    cronJobCount: input.jobs.length,
    activeCronCount: countActiveCronJobs(input.jobs),
    gatewayModel: input.gatewayModel,
    connectionLabel: resolveConnectionHealthLabel(
      input.connectionState,
      input.health,
      input.macHttpReachable,
    ),
    hostname: input.health?.hostname ?? null,
  };
}
