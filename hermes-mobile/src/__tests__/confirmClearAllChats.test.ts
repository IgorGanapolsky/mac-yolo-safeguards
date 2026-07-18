import { Alert } from 'react-native';
import {
  CLEAR_ALL_CHATS_MESSAGE,
  CLEAR_ALL_CHATS_TITLE,
  CLEAR_ALL_CONFIRM_AFTER_MODAL_MS,
  confirmClearAllChats,
  confirmClearAllChatsAfterHostDismiss,
} from '../utils/confirmClearAllChats';

describe('confirmClearAllChats', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows destructive Clear all confirm', () => {
    const onConfirm = jest.fn();
    confirmClearAllChats(onConfirm);
    expect(Alert.alert).toHaveBeenCalledWith(
      CLEAR_ALL_CHATS_TITLE,
      CLEAR_ALL_CHATS_MESSAGE,
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Clear all', style: 'destructive' }),
      ]),
    );
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    buttons.find((b) => b.text === 'Clear all')?.onPress?.();
    expect(onConfirm).toHaveBeenCalled();
  });

  it('dismisses host modal before Alert so Android does not swallow it', () => {
    const dismissHost = jest.fn();
    const onConfirm = jest.fn();
    confirmClearAllChatsAfterHostDismiss(dismissHost, onConfirm);
    expect(dismissHost).toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    jest.advanceTimersByTime(CLEAR_ALL_CONFIRM_AFTER_MODAL_MS);
    expect(Alert.alert).toHaveBeenCalled();
  });
});
