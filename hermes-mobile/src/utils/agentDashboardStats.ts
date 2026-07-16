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

export function resolveConnectionHealthLabel(
  connectionState: LeashConnectionState,
  health?: GatewayHealthSnapshot | null,
  macHttpReachable = false,
): string {
  if (connectionState === 'demo') {
    return 'Demo preview';
  }
  if (health?.authMismatch) {
    return 'Needs re-pair';
  }
  if (macHttpReachable || health?.level === 'green') {
    return 'Computer linked';
  }
  if (connectionState === 'connecting') {
    // First-connect and reconnect share 'connecting' state — prefer honest copy.
    return 'Connecting…';
  }
  if (health?.level === 'amber') {
    return 'Degraded link';
  }
  if (health?.level === 'red') {
    return 'Computer unreachable';
  }
  return 'Not linked';
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
