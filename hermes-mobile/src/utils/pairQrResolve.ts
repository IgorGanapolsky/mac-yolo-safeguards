import { parseSetupDeepLink, type SetupDeepLinkParams } from './setupDeepLink';
import { normalizeGatewayUrl } from '../services/gatewayClient';
import { exchangePairingCode } from '../services/pairingCodeExchange';

const PAIR_PAGE_RE = /:8765(?:\/pair)?$/i;

async function redeemPairingCodeForScan(setup: SetupDeepLinkParams): Promise<SetupDeepLinkParams> {
  if (!setup.pairingCode || !setup.pairServerUrl) {
    return setup;
  }
  const payload = await exchangePairingCode(setup.pairServerUrl, setup.pairingCode);
  if (!payload) {
    return setup;
  }
  return {
    ...setup,
    gatewayUrl: payload.gatewayUrl || setup.gatewayUrl,
    apiKey: payload.apiKey || setup.apiKey,
    thumbgateApiKey: payload.thumbgateApiKey || setup.thumbgateApiKey,
    macName: payload.macName || setup.macName,
    relayCode: payload.relayCode || setup.relayCode,
    tailnetProbeHosts: payload.tailnetProbeHosts?.length
      ? payload.tailnetProbeHosts
      : setup.tailnetProbeHosts,
    extraComputers: payload.extraComputers?.length ? payload.extraComputers : setup.extraComputers,
  };
}

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

/** Resolve QR payloads: hermes://setup, pair page URL, or raw gateway URL. */
export async function resolvePairQrPayload(data: string): Promise<SetupDeepLinkParams | null> {
  const trimmed = data.trim();
  const fromDeepLink = parseSetupDeepLink(trimmed);
  if (fromDeepLink) {
    return redeemPairingCodeForScan(fromDeepLink);
  }

  const pairJsonUrl = pairJsonUrlFromScan(trimmed);
  if (pairJsonUrl || PAIR_PAGE_RE.test(trimmed)) {
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
            return redeemPairingCodeForScan(parsed);
          }
        }
        if (body.gatewayUrl?.trim()) {
          return { gatewayUrl: body.gatewayUrl.trim() };
        }
      }
    } catch {
      // fall through
    }
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const { httpBase } = normalizeGatewayUrl(trimmed);
      return { gatewayUrl: httpBase };
    } catch {
      return null;
    }
  }

  return null;
}
