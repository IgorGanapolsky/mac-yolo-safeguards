import type { ChatProjectState, ChatProject } from '../types/chatProject';
import type { GatewayHealthSnapshot } from '../types/gateway';
import type { GatewayProfile } from '../types/gatewayProfile';
import {
  findProfileForGatewayUrl,
  formatProfileLabel,
} from '../services/gatewayProfiles';
import { formatGatewayHostLabel } from './gatewayEndpoint';

export function resolveChatMachineLabel(
  gatewayUrl: string,
  health: GatewayHealthSnapshot | null | undefined,
  profile: GatewayProfile | null | undefined,
  allProfiles?: GatewayProfile[],
): string {
  const matched =
    profile ?? (gatewayUrl.trim() ? findProfileForGatewayUrl(allProfiles ?? [], gatewayUrl) : null);
  if (matched) {
    return formatProfileLabel(matched);
  }
  if (!gatewayUrl.trim()) {
    return 'No Mac linked';
  }
  return formatGatewayHostLabel(gatewayUrl, health);
}

/** Active project chip, or project bound to the current session. */
export function resolveChatProject(
  projectState: ChatProjectState,
  currentSessionId?: string | null,
): ChatProject | null {
  if (projectState.activeProjectId) {
    return projectState.projects.find((p) => p.id === projectState.activeProjectId) ?? null;
  }
  if (!currentSessionId) {
    return null;
  }
  const projectId = projectState.sessionProjectMap[currentSessionId];
  if (!projectId) {
    return null;
  }
  return projectState.projects.find((p) => p.id === projectId) ?? null;
}
