import { Alert } from 'react-native';

export const CLEAR_ALL_CHATS_TITLE = 'Clear all chats?';
export const CLEAR_ALL_CHATS_MESSAGE =
  'This deletes every thread on your computer from Hermes. You cannot undo this.';

/** Delay so RN Modal unmounts before Alert — Android otherwise swallows the dialog. */
export const CLEAR_ALL_CONFIRM_AFTER_MODAL_MS = 50;

export function confirmClearAllChats(onConfirm: () => void | Promise<void>): void {
  Alert.alert(CLEAR_ALL_CHATS_TITLE, CLEAR_ALL_CHATS_MESSAGE, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Clear all',
      style: 'destructive',
      onPress: () => {
        void onConfirm();
      },
    },
  ]);
}

/**
 * Android often swallows Alert.alert while Threads BottomSheetModal is mounted —
 * Clear all looks like a no-op and sessions reappear on relaunch. Dismiss first.
 */
export function confirmClearAllChatsAfterHostDismiss(
  dismissHost: () => void,
  onConfirm: () => void | Promise<void>,
): void {
  dismissHost();
  setTimeout(() => {
    confirmClearAllChats(onConfirm);
  }, CLEAR_ALL_CONFIRM_AFTER_MODAL_MS);
}
