import { Alert } from 'react-native';
import {
  FORGET_CONFIRM_AFTER_MODAL_MS,
  FORGET_GATEWAY_PROFILE_TITLE,
  confirmForgetGatewayProfile,
  confirmForgetGatewayProfileAfterHostDismiss,
  forgetGatewayProfileConfirmMessage,
} from '../utils/confirmForgetGatewayProfile';

describe('confirmForgetGatewayProfile', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('states phone-only forget and never Tailscale/Mac deletion', () => {
    const message = forgetGatewayProfileConfirmMessage('Igors-Mac-mini');
    expect(message).toContain('Igors-Mac-mini');
    expect(message).toMatch(/this phone only/i);
    expect(message).toContain(
      'Does not disconnect Tailscale, shut down the Mac, or delete anything on the computer',
    );
    expect(message).toMatch(/Find computers/i);
  });

  it('shows Forget confirm and only deletes after confirm', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onConfirm = jest.fn();
    confirmForgetGatewayProfile({
      profileId: 'mac_mini',
      computerName: 'Igors-Mac-mini',
      onConfirm,
    });
    expect(alertSpy).toHaveBeenCalledWith(
      FORGET_GATEWAY_PROFILE_TITLE,
      expect.stringContaining('Igors-Mac-mini'),
      expect.any(Array),
    );
    expect(onConfirm).not.toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0]?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Forget this Mac']);
    buttons.find((b) => b.text === 'Forget this Mac')?.onPress?.();
    expect(onConfirm).toHaveBeenCalledWith('mac_mini');
  });

  it('dismisses host Modal before showing Forget confirm (Android Alert swallow)', () => {
    jest.useFakeTimers();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const dismissHost = jest.fn();
    const onConfirm = jest.fn();

    confirmForgetGatewayProfileAfterHostDismiss(dismissHost, {
      profileId: 'mac_mini',
      computerName: 'Igors-Mac-mini',
      onConfirm,
    });

    expect(dismissHost).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(FORGET_CONFIRM_AFTER_MODAL_MS);

    expect(alertSpy).toHaveBeenCalledWith(
      FORGET_GATEWAY_PROFILE_TITLE,
      expect.stringContaining('Igors-Mac-mini'),
      expect.any(Array),
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
