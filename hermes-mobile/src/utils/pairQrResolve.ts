import { parseSetupDeepLink, type SetupDeepLinkParams } from './setupDeepLink';
import { normalizeGatewayUrl } from '../services/gatewayClient';
import { acceptPairSetupPayload, acceptRawPairScan } from './pairPayloadAccept';

const PAIR_PAGE_RE = /:8765(?:\/pair)?$/i;

export type ResolvePairQrResult =
  | { ok: true; params: SetupDeepLinkParams }
  | { ok: false; reason: string; message: string };

function pairJsonUrlFromScan(data: string): string | null {
  const trimmed = data.trim();
  if (!trimmed.includes(':8765')) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    url.pathname = '/pair.json';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function acceptOrNull(params: SetupDeepLinkParams): SetupDeepLinkParams | null {
  const accepted = acceptPairSetupPayload(params, { source: 'qr' });
  return accepted.ok ? accepted.params : null;
}

/** Resolve QR payloads: hermes://setup, pair page URL, or raw gateway URL. */
export async function resolvePairQrPayload(data: string): Promise<SetupDeepLinkParams | null> {
  const detailed = await resolvePairQrPayloadDetailed(data);
  return detailed.ok ? detailed.params : null;
}

/** QR resolve with reject reasons for in-app scanner UX (no silent no-op). */
export async function resolvePairQrPayloadDetailed(data: string): Promise<ResolvePairQrResult> {
  const rawReject = acceptRawPairScan(data);
  if (rawReject && !rawReject.ok) {
    return rawReject;
  }

  const trimmed = data.trim();
  const fromDeepLink = parseSetupDeepLink(trimmed);
  if (fromDeepLink) {
    const accepted = acceptPairSetupPayload(fromDeepLink, { source: 'qr' });
    if (!accepted.ok) {
      return accepted;
    }
    return { ok: true, params: accepted.params };
  }

  const pairJsonUrl = pairJsonUrlFromScan(trimmed);
  if (pairJsonUrl || PAIR_PAGE_RE.test(trimmed)) {
    if (trimmed.toLowerCase().includes('127.0.0.1') || trimmed.toLowerCase().includes('localhost')) {
      return {
        ok: false,
        reason: 'loopback_primary',
        message:
          'This pair page is USB loopback — phones cannot open it off-cable. Use the Tailscale or Wi‑Fi pair link.',
      };
    }
    const fetchUrl = pairJsonUrl ?? `${trimmed.replace(/\/$/, '')}/pair.json`;
    try {
      const response = await fetch(fetchUrl);
      if (response.ok) {
        const body = (await response.json()) as {
          gatewayUrl?: string;
          deepLink?: string;
        };
        if (body.deepLink) {
          const parsed = parseSetupDeepLink(body.deepLink);
          if (parsed) {
            const accepted = acceptPairSetupPayload(parsed, { source: 'qr' });
            if (!accepted.ok) {
              return accepted;
            }
            return { ok: true, params: accepted.params };
          }
        }
        if (body.gatewayUrl?.trim()) {
          const accepted = acceptPairSetupPayload(
            { gatewayUrl: body.gatewayUrl.trim() },
            { source: 'qr' },
          );
          if (!accepted.ok) {
            return accepted;
          }
          return { ok: true, params: accepted.params };
        }
      }
    } catch {
      // fall through
    }
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const { httpBase } = normalizeGatewayUrl(trimmed);
      const accepted = acceptOrNull({ gatewayUrl: httpBase });
      if (!accepted) {
        return {
          ok: false,
          reason: 'loopback_primary',
          message:
            'That link uses USB loopback (127.0.0.1). Scan a Tailscale or home Wi‑Fi pair QR instead.',
        };
      }
      return { ok: true, params: accepted };
    } catch {
      return {
        ok: false,
        reason: 'invalid_gateway',
        message: 'Could not read a computer address from that QR.',
      };
    }
  }

  return {
    ok: false,
    reason: 'empty',
    message: 'No Hermes pairing data in that QR.',
  };
}
