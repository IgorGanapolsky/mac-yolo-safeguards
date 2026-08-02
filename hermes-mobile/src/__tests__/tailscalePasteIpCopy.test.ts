import {
  CONNECT_MAC_GATE_BODY_CELLULAR,
  CONNECT_MAC_GATE_BODY_WIFI,
  CONNECT_MAC_GATE_TITLE,
  MAC_PICKER_SUBTITLE,
  PICKER_EMPTY_FOOTER,
  PICKER_HELP_MISSING_DETAIL,
  SCAN_NONE_FOUND_DETAIL,
  SCAN_NONE_FOUND_TITLE,
  TAILSCALE_PASTE_IP_DETAIL,
  TAILSCALE_PASTE_IP_TITLE,
} from '../utils/tailscalePasteIpCopy';

describe('tailscalePasteIpCopy', () => {
  it('leads with paste Tailscale IP and never pitches Relay or USB essays', () => {
    const joined = [
      CONNECT_MAC_GATE_TITLE,
      CONNECT_MAC_GATE_BODY_CELLULAR,
      TAILSCALE_PASTE_IP_TITLE,
      TAILSCALE_PASTE_IP_DETAIL,
      MAC_PICKER_SUBTITLE,
      SCAN_NONE_FOUND_TITLE,
      SCAN_NONE_FOUND_DETAIL,
      PICKER_EMPTY_FOOTER,
      PICKER_HELP_MISSING_DETAIL,
    ].join(' ');

    expect(joined).toContain('Tailscale');
    expect(joined).toContain('100.x');
    expect(joined).toContain('Find computers');
    expect(joined.toLowerCase()).not.toContain('relay');
    expect(joined.toLowerCase()).not.toContain('plugged into');
    expect(joined.toLowerCase()).not.toContain('preferred automatically');
    expect(joined.toLowerCase()).not.toContain('gateway');
  });

  it('states cellular = Tailscale only and Wi‑Fi Find = same network', () => {
    expect(CONNECT_MAC_GATE_BODY_CELLULAR.toLowerCase()).toContain('cellular');
    expect(CONNECT_MAC_GATE_BODY_CELLULAR.toLowerCase()).toContain('tailscale only');
    expect(CONNECT_MAC_GATE_BODY_WIFI.toLowerCase()).toMatch(/same wi.?fi/);
  });

  it('keeps the paste path to one short line', () => {
    expect(TAILSCALE_PASTE_IP_DETAIL.split('→').length).toBeGreaterThanOrEqual(3);
    expect(TAILSCALE_PASTE_IP_DETAIL.length).toBeLessThan(90);
    expect(SCAN_NONE_FOUND_DETAIL.length).toBeLessThan(120);
  });
});
