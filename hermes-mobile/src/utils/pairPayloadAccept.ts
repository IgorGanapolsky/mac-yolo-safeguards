import type { SetupDeepLinkParams } from './setupDeepLink';
import {
  gatewayUrlHostname,
  isLoopbackGatewayUrl,
  isLoopbackHost,
  isValidGatewayUrl,
} from './gatewayUrlPolicy';
import { isTailscaleGatewayUrl } from './tailscaleHosts';
import { isPrivateLanGatewayUrl } from './gatewayEndpoint';

export type PairPayloadRejectReason =
  | 'empty'
  | 'file_scheme'
  | 'unsupported_scheme'
  | 'loopback_primary'
  | 'invalid_gateway'
  | 'unreachable_pair_server';

export type PairPayloadAcceptResult =
  | { ok: true; params: SetupDeepLinkParams }
  | { ok: false; reason: PairPayloadRejectReason; message: string };

function hostLooksLoopback(raw: string | undefined): boolean {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return false;
  }
  if (isLoopbackGatewayUrl(trimmed)) {
    return true;
  }
  try {
    const host = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`).hostname;
    return isLoopbackHost(host);
  } catch {
    const host = gatewayUrlHostname(trimmed);
    return host ? isLoopbackHost(host) : false;
  }
}

function isSupportedHttpPairOrGatewayUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  if (hostLooksLoopback(trimmed)) {
    return false;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return false;
  }
  if (isTailscaleGatewayUrl(trimmed) || isPrivateLanGatewayUrl(trimmed)) {
    return true;
  }
  // Pair page on :8765 (LAN or Tailscale) — hostname already non-loopback above.
  try {
    const u = new URL(trimmed);
    return u.port === '8765' || u.pathname.includes('/pair');
  } catch {
    return false;
  }
}

/**
 * Fresh-user / Camera QR acceptance contract (Android docs ROI):
 * - Reject file://, unsupported schemes, and USB loopback primaries before any profile mutation.
 * - Accept hermes://setup and http(s) Tailscale/LAN pair or gateway routes only.
 * - USB adb reverse may still pass loopback when secretless pairServer is also loopback
 *   (cable path) — never for a Camera/HTTP QR that encodes 127.0.0.1 as primary.
 */
export function acceptPairSetupPayload(
  params: SetupDeepLinkParams,
  options?: { allowUsbLoopback?: boolean; source?: 'qr' | 'deeplink' | 'unknown' },
): PairPayloadAcceptResult {
  const source = options?.source ?? 'unknown';
  const gatewayUrl = params.gatewayUrl?.trim();
  const pairServerUrl = params.pairServerUrl?.trim();
  const pairingCode = params.pairingCode?.trim();

  if (params.demoMode) {
    return { ok: true, params };
  }

  // Secretless USB adb: pairServer + optional gateway on loopback is intentional.
  const usbAdbSecretless =
    Boolean(pairingCode && pairServerUrl && hostLooksLoopback(pairServerUrl)) &&
    (!gatewayUrl || hostLooksLoopback(gatewayUrl));

  const allowLoopback =
    options?.allowUsbLoopback === true ||
    (source !== 'qr' && usbAdbSecretless);

  if (gatewayUrl) {
    if (gatewayUrl.toLowerCase().startsWith('file:')) {
      return {
        ok: false,
        reason: 'file_scheme',
        message: 'That QR points at a file on the computer — open the live pair link instead.',
      };
    }
    if (!/^https?:\/\//i.test(gatewayUrl) && !gatewayUrl.includes('://')) {
      // bare host — normalize later; reject clearly bad schemes when present
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(gatewayUrl) && !/^https?:\/\//i.test(gatewayUrl)) {
      return {
        ok: false,
        reason: 'unsupported_scheme',
        message: 'Unsupported pairing link. Scan the ThumbGate pair page QR (http) or use Find computers.',
      };
    }
    if (hostLooksLoopback(gatewayUrl) && !allowLoopback) {
      return {
        ok: false,
        reason: 'loopback_primary',
        message:
          'This QR targets USB loopback (127.0.0.1), which phones cannot reach off-cable. Use Tailscale or the same Wi‑Fi pair page.',
      };
    }
    if (!hostLooksLoopback(gatewayUrl) && !isValidGatewayUrl(gatewayUrl) && !isSupportedHttpPairOrGatewayUrl(gatewayUrl)) {
      return {
        ok: false,
        reason: 'invalid_gateway',
        message: 'That computer address is not a supported Tailscale or home Wi‑Fi link.',
      };
    }
  }

  if (pairServerUrl) {
    if (pairServerUrl.toLowerCase().startsWith('file:')) {
      return {
        ok: false,
        reason: 'file_scheme',
        message: 'Pair server cannot be a file:// URL. Open the live http pair page on Tailscale or Wi‑Fi.',
      };
    }
    if (hostLooksLoopback(pairServerUrl) && !allowLoopback) {
      return {
        ok: false,
        reason: 'unreachable_pair_server',
        message:
          'Pair code server is 127.0.0.1 — only works over USB. On cellular, rescan a Tailscale pair QR.',
      };
    }
  }

  if (!gatewayUrl && !(pairingCode && pairServerUrl) && !params.relayCode && !params.extraComputers?.length) {
    return {
      ok: false,
      reason: 'empty',
      message: 'No computer link found in that QR.',
    };
  }

  // Strip loopback extras for QR so a poisoned payload cannot mutate profiles with 127.0.0.1.
  if (source === 'qr' && params.extraComputers?.length) {
    const cleaned = params.extraComputers.filter(
      (extra) => extra.gatewayUrl?.trim() && !hostLooksLoopback(extra.gatewayUrl),
    );
    return { ok: true, params: { ...params, extraComputers: cleaned.length ? cleaned : undefined } };
  }

  return { ok: true, params };
}

/** Reject raw scanned strings before parse/fetch (file://, nonsense schemes). */
export function acceptRawPairScan(data: string): PairPayloadAcceptResult | null {
  const trimmed = data.trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty', message: 'Empty QR.' };
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('file:')) {
    return {
      ok: false,
      reason: 'file_scheme',
      message: 'That QR is a local file page — open http://…:8765/pair on Tailscale or Wi‑Fi instead.',
    };
  }
  if (
    !lower.startsWith('hermes://') &&
    !lower.startsWith('http://') &&
    !lower.startsWith('https://')
  ) {
    return {
      ok: false,
      reason: 'unsupported_scheme',
      message: 'Unsupported QR. Scan the Hermes pair page or a hermes://setup link.',
    };
  }
  return null;
}
