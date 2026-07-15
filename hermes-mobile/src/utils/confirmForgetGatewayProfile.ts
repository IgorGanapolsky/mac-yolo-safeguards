import { Alert } from 'react-native';

export const FORGET_GATEWAY_PROFILE_TITLE = 'Forget this Mac?';

/** Exact effect of removeGatewayProfile — phone storage only, not Tailscale/Mac. */
export function forgetGatewayProfileConfirmMessage(computerName: string): string {
  const name = computerName.trim() || 'this computer';
  return (
    `Removes “${name}” from saved computers on this phone only. ` +
    `Does not disconnect Tailscale, shut down the Mac, or delete anything on the computer. ` +
    `You can find it again with Find computers.`
  );
}

type ConfirmForgetOptions = {
  profileId: string;
  computerName: string;
  onConfirm: (profileId: string) => void | Promise<void>;
};

/**
 * Confirm before deleting a saved gateway profile from phone storage.
 * Callers must pass the real removeGatewayProfile (or equivalent) as onConfirm.
 */
export function confirmForgetGatewayProfile({
  profileId,
  computerName,
  onConfirm,
}: ConfirmForgetOptions): void {
  Alert.alert(FORGET_GATEWAY_PROFILE_TITLE, forgetGatewayProfileConfirmMessage(computerName), [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Forget',
      style: 'destructive',
      onPress: () => {
        void onConfirm(profileId);
      },
    },
  ]);
}
