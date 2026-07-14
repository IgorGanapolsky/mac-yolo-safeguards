import type { GatewayProfile } from '../types/gatewayProfile';
import { freshUserConnectionBody } from '../utils/freshUserOnboarding';
import { preferredProfileForMachine } from '../utils/gatewayProfilePicker';

const usb: GatewayProfile = {
  id: 'usb',
  label: 'Studio Mac',
  hostname: 'Studio-Mac.local',
  gatewayUrl: 'http://127.0.0.1:8642',
  addedAt: '2026-07-14T00:00:00Z',
};
const tailscale: GatewayProfile = {
  id: 'tailscale',
  label: 'Studio Mac',
  hostname: 'Studio-Mac.tail123.ts.net',
  gatewayUrl: 'http://100.80.20.10:8642',
  addedAt: '2026-07-14T00:00:00Z',
};

describe('on-device decision integration', () => {
  it('uses the live cable and falls back to Tailscale when the cable is dead', () => {
    expect(
      preferredProfileForMachine([tailscale, usb], {
        liveUsb: { reachable: true, hostname: 'Studio-Mac.local' },
      }).id,
    ).toBe('usb');
    expect(
      preferredProfileForMachine([usb, tailscale], {
        liveUsb: { reachable: false },
      }).id,
    ).toBe('tailscale');
  });

  it('uses score-driven recovery copy in the live onboarding path', () => {
    const body = freshUserConnectionBody({
      searching: false,
      healInFlight: false,
      healExhausted: true,
      freshUser: false,
      macLabel: 'Studio Mac',
      cellularBlocksDirect: false,
      showUsbFix: false,
    });
    expect(body).toBe(
      'Studio Mac is saved but not reachable right now. Find computers or pick another one.',
    );
  });
});
