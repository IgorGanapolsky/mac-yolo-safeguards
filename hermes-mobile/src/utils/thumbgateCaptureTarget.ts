import { THUMBGATE_API_URL } from '../constants/appIdentity';

/** Local ThumbGate HTTP port on the Mac (`~/.thumbgate/config.json` apiUrl). */
export const THUMBGATE_LOCAL_PORT = 3000;

const CLOUD_HOST_MARKERS = [
  'thumbgate-production.up.railway.app',
  'thumbgate.app',
  'railway.app',
];

function stripTrailingSlash(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function isCloudThumbgateUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return CLOUD_HOST_MARKERS.some((marker) => lower.includes(marker));
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

/**
 * Prefer Mac ThumbGate on the same host as the Hermes gateway.
 * Falls back to configured / cloud Railway URL when no gateway host exists.
 */
export function resolveThumbgateCaptureBaseUrl(options: {
  configuredApiUrl?: string | null;
  gatewayUrl?: string | null;
  cloudDefault?: string;
}): string {
  const cloud = stripTrailingSlash(options.cloudDefault || THUMBGATE_API_URL);
  const configured = stripTrailingSlash(options.configuredApiUrl || '');
  const gatewayUrl = (options.gatewayUrl || '').trim();

  let gatewayHost: string | null = null;
  if (gatewayUrl) {
    try {
      gatewayHost = new URL(gatewayUrl).hostname || null;
    } catch {
      gatewayHost = null;
    }
  }

  const macFromGateway = gatewayHost
    ? `http://${gatewayHost}:${THUMBGATE_LOCAL_PORT}`
    : null;

  // Explicit non-cloud URL (Settings override or pair-injected Mac URL).
  if (configured && !isCloudThumbgateUrl(configured)) {
    try {
      const parsed = new URL(configured);
      if (isLoopbackHost(parsed.hostname) && gatewayHost && !isLoopbackHost(gatewayHost)) {
        return `http://${gatewayHost}:${parsed.port || String(THUMBGATE_LOCAL_PORT)}`;
      }
    } catch {
      // keep configured as-is below
    }
    return configured;
  }

  // Default cloud setting + paired Mac → prefer Mac-local ThumbGate.
  if (macFromGateway) {
    return macFromGateway;
  }

  return configured || cloud;
}

/** Ordered capture targets: Mac first when available, then cloud fallback. */
export function resolveThumbgateCaptureTargets(options: {
  configuredApiUrl?: string | null;
  gatewayUrl?: string | null;
  cloudDefault?: string;
}): string[] {
  const cloud = stripTrailingSlash(options.cloudDefault || THUMBGATE_API_URL);
  const primary = resolveThumbgateCaptureBaseUrl(options);
  const targets = [primary];
  if (primary !== cloud && !isCloudThumbgateUrl(primary)) {
    targets.push(cloud);
  }
  return targets;
}
