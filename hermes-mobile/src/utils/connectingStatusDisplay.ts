import type { LeashConnectionState } from './gatewayEndpoint';

/**
 * After ~5s of Connecting with no live HTTP, ChatScreen sets connectingStuck.
 * Header / Choose-computer / connection panel must stop showing orange Connecting
 * and fall through to Can't reach / Cannot reach this computer.
 */
export function connectionStateForConnectingDisplay(
  connectionState: LeashConnectionState,
  connectingStuck: boolean,
): LeashConnectionState {
  if (connectionState === 'connecting' && connectingStuck) {
    return 'disconnected';
  }
  return connectionState;
}

export function isActiveConnectingDisplay(
  connectionState: LeashConnectionState,
  connectingStuck: boolean,
): boolean {
  return connectionState === 'connecting' && !connectingStuck;
}
