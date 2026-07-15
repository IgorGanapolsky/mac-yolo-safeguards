import type { GatewayProfile } from '../types/gatewayProfile';
import type { ChatMachineHeaderDisplay } from './chatMachineHeader';
import { hasOnlyLoopbackProfiles } from './gatewayProfilePicker';
import { hasValidSavedComputer } from './freshUserOnboarding';
import { isLoopbackGatewayUrl } from './gatewayUrlPolicy';

/** True when any saved profile has a successful connect timestamp. */
export function hasSuccessfulComputerConnection(profiles: GatewayProfile[]): boolean {
  return profiles.some((profile) => Boolean(profile.lastConnectedAt?.trim()));
}

/**
 * Quiet the chat header / command tile while the user is in first-run or picker flow.
 * Stops USB dogfood (127.0.0.1 / Computer via USB) and Pair-relay status from competing
 * with Choose-your-computer / ConnectMacGate.
 */
export function shouldQuietConnectFlowChrome(input: {
  macPickerVisible: boolean;
  showMacConnectionHelp: boolean;
  profiles: GatewayProfile[];
  gatewayUrl: string;
  isDemo?: boolean;
}): boolean {
  if (input.isDemo) {
    return false;
  }
  if (input.macPickerVisible) {
    return true;
  }
  // Connection help / first-run panel owns the narrative — hide USB/relay thrash above it.
  if (input.showMacConnectionHelp) {
    return true;
  }
  // Loopback-only USB dogfood with no real Mac yet (emulator / adb reverse seed).
  if (hasOnlyLoopbackProfiles(input.profiles) && isLoopbackGatewayUrl(input.gatewayUrl)) {
    return true;
  }
  return false;
}

/** Hide inline ChatConnectionPanel when the Choose-computer sheet owns the narrative. */
export function shouldHideConnectionPanelBehindPicker(macPickerVisible: boolean): boolean {
  return macPickerVisible;
}

/** Hide Codex reconnect tile only while the Choose-computer sheet is open. */
export function shouldHideCommandCenterDuringConnectFlow(
  macPickerVisible: boolean,
): boolean {
  return macPickerVisible;
}

export function quietConnectFlowHeaderDisplay(): ChatMachineHeaderDisplay {
  return {
    machineLabel: 'Your computer',
    machineEndpoint: undefined,
    showDetailWhenConnected: false,
  };
}

/** Stable status under the quiet header — never Pair relay / Reconnecting / USB IP. */
export function quietConnectFlowStatusLabel(macPickerVisible: boolean): string {
  return macPickerVisible ? 'Choose a computer' : 'Not connected';
}

/**
 * Debounce rapid connection-status string flips so header height does not thrash
 * while heal / Tailscale probes poll.
 */
export function shouldAcceptStatusLabelUpdate(input: {
  previous: string | undefined;
  next: string;
  lastAcceptedAtMs: number;
  nowMs?: number;
  minIntervalMs?: number;
}): boolean {
  const now = input.nowMs ?? Date.now();
  const minInterval = input.minIntervalMs ?? 400;
  if (!input.previous || input.previous === input.next) {
    return true;
  }
  // Always accept transitions into quiet connect labels immediately.
  if (input.next === 'Not connected' || input.next === 'Choose a computer') {
    return true;
  }
  return now - input.lastAcceptedAtMs >= minInterval;
}

export function isDogfoodUsbHeader(display: ChatMachineHeaderDisplay): boolean {
  const endpoint = display.machineEndpoint?.trim() ?? '';
  return (
    display.machineLabel === 'Computer via USB' ||
    endpoint.includes('127.0.0.1') ||
    endpoint === 'USB'
  );
}

/** Unpaired / never-succeeded installs must never say "Reconnecting…". */
export function isNeverConnectedInstall(profiles: GatewayProfile[]): boolean {
  if (!hasValidSavedComputer(profiles)) {
    return true;
  }
  return !hasSuccessfulComputerConnection(profiles);
}
