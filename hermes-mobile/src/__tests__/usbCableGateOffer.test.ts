import {
  USB_CABLE_GATE_TITLE,
  shouldAutoSelectLiveUsbOnGate,
  usbCableGateButtonLabel,
  usbCableHostLabel,
} from '../utils/usbCableGateOffer';

describe('usbCableGateOffer', () => {
  it('labels the cable Mac without .local', () => {
    expect(usbCableHostLabel('Igors-MacBook-Pro.local')).toBe('Igors-MacBook-Pro');
    expect(usbCableGateButtonLabel('Igors-MacBook-Pro.local')).toBe(
      'Use Igors-MacBook-Pro via this USB cable',
    );
    expect(USB_CABLE_GATE_TITLE).toBe('Using this USB cable');
  });

  it('auto-selects only for fresh gate with live hostname', () => {
    expect(
      shouldAutoSelectLiveUsbOnGate({
        liveUsbReachable: true,
        liveUsbHostname: 'Igors-MacBook-Pro.local',
        hasSavedNonLoopbackMac: false,
        alreadyApplied: false,
      }),
    ).toBe(true);

    expect(
      shouldAutoSelectLiveUsbOnGate({
        liveUsbReachable: true,
        liveUsbHostname: 'Igors-MacBook-Pro.local',
        hasSavedNonLoopbackMac: true,
        alreadyApplied: false,
      }),
    ).toBe(false);

    expect(
      shouldAutoSelectLiveUsbOnGate({
        liveUsbReachable: true,
        liveUsbHostname: 'Igors-MacBook-Pro.local',
        hasSavedNonLoopbackMac: false,
        alreadyApplied: true,
      }),
    ).toBe(false);

    expect(
      shouldAutoSelectLiveUsbOnGate({
        liveUsbReachable: true,
        liveUsbHostname: null,
        hasSavedNonLoopbackMac: false,
        alreadyApplied: false,
      }),
    ).toBe(false);
  });
});
