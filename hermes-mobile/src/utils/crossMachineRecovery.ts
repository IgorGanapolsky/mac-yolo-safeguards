import type { DiscoveredGateway, GatewayProfile } from '../types/gatewayProfile';
import {
  isGenericMachineLabel,
  profileDisplayName,
  profilesShareMachine,
  stripTransportSuffixFromComputerName,
} from '../services/gatewayProfiles';
import { profileMatchesDiscoveredGateway } from './gatewayProfilePicker';
import { isLoopbackGatewayUrl, isValidGatewayUrl } from './gatewayUrlPolicy';

/**
 * Cross-machine recovery — OFFERED, never silent.
 *
 * Automatic self-heal (`savedProfileFallbackUrls`) deliberately stays on the ACTIVE
 * machine: switching Macs changes which computer runs the user's commands, and chat
 * sessions/projects live on one specific machine. Silently rerouting a conversation
 * would run work in the wrong place and lose session context.
 *
 * But when the active Mac is entirely down (Tailscale offline / gateway dead), the
 * same-machine-only rule leaves the phone stranded with no path forward even though a
 * second saved Mac is answering /health right now. That dead end is the bug this
 * module closes: surface the healthy machine as an explicit, one-tap switch that names
 * both computers and says what changes.
 */

const NEUTRAL_COMPUTER_NAME = 'Your computer';
const NEUTRAL_OTHER_COMPUTER_NAME = 'another saved computer';

export type CrossMachineRecoveryOffer = {
  /** Saved profile to activate on tap. */
  profileId: string;
  gatewayUrl: string;
  /** Healthy machine the user would move to. */
  computerName: string;
  /** Machine that stopped answering. */
  offlineComputerName: string;
  title: string;
  body: string;
  actionLabel: string;
};

/** Human machine name, with transport tokens and placeholder labels stripped. */
function recoveryComputerName(profile: GatewayProfile): string | null {
  const display = stripTransportSuffixFromComputerName(profileDisplayName(profile));
  if (!display || isGenericMachineLabel(display)) {
    return null;
  }
  // Copy law: transport words never appear in app copy — Tailscale only.
  if (/\busb\b/i.test(display)) {
    return null;
  }
  return display;
}

function lastSeenAt(profile: GatewayProfile): string {
  return profile.lastConnectedAt ?? profile.addedAt ?? '';
}

/**
 * Saved computers on a DIFFERENT machine than the active one that answered /health
 * on this probe pass. Same-machine rows are excluded on purpose — those are alternate
 * routes to the selected Mac and belong to automatic healing, not to a user prompt.
 */
export function crossMachineRecoveryCandidates(input: {
  profiles: GatewayProfile[];
  activeProfileId?: string | null;
  /** Gateways that answered a healthy /health probe (tailnet peers). */
  reachableGateways: DiscoveredGateway[];
}): GatewayProfile[] {
  const activeId = input.activeProfileId?.trim();
  if (!activeId) {
    return [];
  }
  const active = input.profiles.find((profile) => profile.id === activeId);
  if (!active) {
    return [];
  }
  const reachable = input.reachableGateways.filter(
    (gateway) =>
      Boolean(gateway?.gatewayUrl?.trim()) && !isLoopbackGatewayUrl(gateway.gatewayUrl),
  );
  if (reachable.length === 0) {
    return [];
  }

  const candidates = input.profiles.filter((profile) => {
    if (profile.id === activeId) {
      return false;
    }
    if (!isValidGatewayUrl(profile.gatewayUrl)) {
      return false;
    }
    // A cable answers for whichever Mac is attached — loopback is never proof of
    // a specific other machine.
    if (isLoopbackGatewayUrl(profile.gatewayUrl)) {
      return false;
    }
    if (profilesShareMachine(active, profile)) {
      return false;
    }
    return reachable.some((gateway) => profileMatchesDiscoveredGateway(profile, gateway));
  });

  return [...candidates].sort((a, b) => lastSeenAt(b).localeCompare(lastSeenAt(a)));
}

/**
 * The one-tap recovery offer, or null when there is nothing honest to offer.
 *
 * Gated on heal exhaustion so a transient blip never nags the user to move machines
 * while silent same-machine healing still has budget.
 */
export function resolveCrossMachineRecoveryOffer(input: {
  profiles: GatewayProfile[];
  activeProfileId?: string | null;
  activeProfileReachable: boolean;
  healExhausted: boolean;
  reachableGateways: DiscoveredGateway[];
}): CrossMachineRecoveryOffer | null {
  if (input.activeProfileReachable || !input.healExhausted) {
    return null;
  }
  const activeId = input.activeProfileId?.trim();
  const active = activeId
    ? input.profiles.find((profile) => profile.id === activeId)
    : undefined;
  if (!active) {
    return null;
  }
  const target = crossMachineRecoveryCandidates({
    profiles: input.profiles,
    activeProfileId: activeId,
    reachableGateways: input.reachableGateways,
  })[0];
  if (!target) {
    return null;
  }

  const computerName = recoveryComputerName(target);
  const offlineComputerName = recoveryComputerName(active);
  const targetName = computerName ?? NEUTRAL_OTHER_COMPUTER_NAME;
  const offlineName = offlineComputerName ?? NEUTRAL_COMPUTER_NAME;

  return {
    profileId: target.id,
    gatewayUrl: target.gatewayUrl,
    computerName: targetName,
    offlineComputerName: offlineName,
    title: `${offlineName} is offline`,
    body: `${offlineName} isn't answering, but ${targetName} is — it's on and reachable over Tailscale. Switching runs your commands on ${targetName}; chats and projects on ${offlineName} stay there until it comes back.`,
    actionLabel: computerName ? `Switch to ${computerName}` : 'Switch computer',
  };
}
