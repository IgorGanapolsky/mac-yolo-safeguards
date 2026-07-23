/**
 * ConnectMacGate USB offer — phone probes loopback after Mac Connect-phone reverse.
 * Not Android USB host APIs; strangers without Mac-side reverse never see this CTA.
 */

export const USB_CABLE_GATE_TITLE = 'Using this USB cable';

export const USB_CABLE_GATE_BODY =
  'Hermes on your Mac already linked this cable. Tap to chat over USB — fastest when plugged in.';

export const USB_PROBE_INTERVAL_MS = 2500;

export function usbCableHostLabel(hostname: string): string {
  return hostname.replace(/\.local$/i, '').trim() || 'Your computer';
}

export function usbCableGateButtonLabel(hostname: string): string {
  return `Use ${usbCableHostLabel(hostname)} via this USB cable`;
}

/** Fresh gate with no saved Tailscale/LAN Mac may auto-select live USB (no sticky steal). */
export function shouldAutoSelectLiveUsbOnGate(input: {
  liveUsbReachable: boolean;
  liveUsbHostname?: string | null;
  hasSavedNonLoopbackMac: boolean;
  alreadyApplied: boolean;
}): boolean {
  if (input.alreadyApplied || input.hasSavedNonLoopbackMac) {
    return false;
  }
  if (!input.liveUsbReachable) {
    return false;
  }
  return Boolean(input.liveUsbHostname?.trim());
}
