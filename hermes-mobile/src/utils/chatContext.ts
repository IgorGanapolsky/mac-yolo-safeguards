import type { ChatProjectState, ChatProject } from '../types/chatProject';
import type { GatewayHealthSnapshot } from '../types/gateway';
import type { GatewayProfile } from '../types/gatewayProfile';
import {
  findProfileForGatewayUrl,
  formatProfileLabel,
} from '../services/gatewayProfiles';
import { resolveActiveProjectId } from '../services/chatProjects';
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
    return 'No computer linked';
  }
  return formatGatewayHostLabel(gatewayUrl, health);
}

/** Active project chip, or project bound to the current session. */
export function resolveChatProject(
  projectState: ChatProjectState,
  currentSessionId?: string | null,
  computerProfileId?: string | null,
): ChatProject | null {
  const activeId = computerProfileId
    ? resolveActiveProjectId(projectState, computerProfileId)
    : projectState.activeProjectId;
  if (activeId) {
    return projectState.projects.find((p) => p.id === activeId) ?? null;
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
