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
      text: 'Forget this Mac',
      style: 'destructive',
      onPress: () => {
        void onConfirm(profileId);
      },
    },
  ]);
}

/** Delay so RN Modal unmounts before Alert — Android otherwise swallows the dialog. */
export const FORGET_CONFIRM_AFTER_MODAL_MS = 50;

/**
 * Android often swallows Alert.alert while an RN Modal (BottomSheetModal) is still
 * mounted — the Forget tap looks like a no-op. Dismiss the host first, then confirm.
 */
export function confirmForgetGatewayProfileAfterHostDismiss(
  dismissHost: () => void,
  options: ConfirmForgetOptions,
): void {
  dismissHost();
  setTimeout(() => {
    confirmForgetGatewayProfile(options);
  }, FORGET_CONFIRM_AFTER_MODAL_MS);
}
