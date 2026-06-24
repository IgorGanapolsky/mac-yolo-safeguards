import { normalizeGatewayUrl } from '../services/gatewayClient';
import type { ConnectionMode, GatewayHealthSnapshot } from '../types/gateway';

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

export type LeashConnectionState = 'disconnected' | 'connecting' | 'connected' | 'demo';

export type LeashConnectionDisplay = {
  headline: string;
  machineName?: string;
  lanIp?: string;
  footnote?: string;
};

function isUsableHost(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === 'unknown') {
    return undefined;
  }
  return trimmed.replace(/\.local$/i, '');
}

function parseHostFromGatewayUrl(gatewayUrl: string): { hostname?: string; ip?: string } {
  try {
    const { httpBase } = normalizeGatewayUrl(gatewayUrl);
    const host = new URL(httpBase).hostname?.trim();
    if (!host) {
      return {};
    }
    if (IPV4_RE.test(host) || host.includes(':')) {
      return { ip: host };
    }
    return { hostname: host };
  } catch {
    return {};
  }
}

function isPrivateLanIpv4(ip: string): boolean {
  if (!IPV4_RE.test(ip)) {
    return false;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  return false;
}

/** True when the gateway URL points at a LAN-only address (unreachable off Wi‑Fi). */
export function isPrivateLanGatewayUrl(gatewayUrl: string): boolean {
  const fromUrl = parseHostFromGatewayUrl(gatewayUrl);
  if (fromUrl.ip && isPrivateLanIpv4(fromUrl.ip)) {
    return true;
  }
  const host = fromUrl.hostname?.toLowerCase();
  return Boolean(host?.endsWith('.local'));
}

function gatewayUrlHost(gatewayUrl: string): string | undefined {
  try {
    const { httpBase } = normalizeGatewayUrl(gatewayUrl);
    return new URL(httpBase).host;
  } catch {
    return undefined;
  }
}

/**
 * Human label for the Mac Hermes gateway — machine name plus LAN IP when known.
 * Prefers /health hostname + local_ip; falls back to the configured gateway URL host.
 */
export function formatGatewayHostLabel(
  gatewayUrl: string,
  health?: GatewayHealthSnapshot | null,
): string {
  const fromHealthName = isUsableHost(health?.hostname);
  const fromHealthIp = isUsableHost(health?.localIp);
  const fromUrl = parseHostFromGatewayUrl(gatewayUrl);

  const name = fromHealthName ?? fromUrl.hostname;
  const ip = fromHealthIp ?? fromUrl.ip;

  if (name && ip && name !== ip) {
    return `${name} (${ip})`;
  }
  if (name) {
    return name;
  }
  if (ip) {
    return ip;
  }
  return gatewayUrlHost(gatewayUrl) ?? gatewayUrl.trim();
}

/** Split machine name and LAN IP for multi-line operator UI. */
export function formatGatewayMachineParts(
  gatewayUrl: string,
  health?: GatewayHealthSnapshot | null,
): { machineName: string; lanIp?: string } {
  const fromHealthName = isUsableHost(health?.hostname);
  const fromHealthIp = isUsableHost(health?.localIp);
  const fromUrl = parseHostFromGatewayUrl(gatewayUrl);

  const machineName =
    fromHealthName ?? fromUrl.hostname ?? gatewayUrlHost(gatewayUrl) ?? 'computer';
  const lanIp = fromHealthIp ?? fromUrl.ip;

  return {
    machineName,
    lanIp: lanIp && lanIp !== machineName ? lanIp : undefined,
  };
}

export function formatLeashConnectionDisplay(input: {
  connectionMode: ConnectionMode;
  connectionState: LeashConnectionState;
  gatewayUrl: string;
  health?: GatewayHealthSnapshot | null;
  isPaired?: boolean;
}): LeashConnectionDisplay {
  const { machineName, lanIp } = formatGatewayMachineParts(input.gatewayUrl, input.health);

  if (input.connectionState === 'demo') {
    return {
      headline: 'Demo mode — mock approvals only',
      footnote: 'No live link to your computer',
    };
  }

  if (input.connectionMode === 'relay') {
    if (!input.isPaired) {
      return {
        headline: 'Cloud relay not paired',
        footnote: 'Pair in Settings with the code from desktop bridge pairing',
      };
    }
    if (input.connectionState === 'connected') {
      return {
        headline: 'Cloud relay linked to your computer',
        machineName,
        lanIp,
        footnote: 'Approval alerts over the internet (works off home Wi‑Fi)',
      };
    }
    if (input.connectionState === 'connecting') {
      return {
        headline: 'Connecting cloud relay to your computer…',
        machineName,
        lanIp,
      };
    }
    return {
      headline: 'Cloud relay disconnected',
      machineName,
      lanIp,
      footnote: 'Check pairing in Settings',
    };
  }

  switch (input.connectionState) {
    case 'connected':
      return {
        headline: 'Live link to your computer gateway',
        machineName,
        lanIp,
        footnote: 'Phone receives instant alerts when Hermes blocks a risky command',
      };
    case 'connecting':
      return {
        headline: 'Connecting to your computer gateway…',
        machineName,
        lanIp,
      };
    default:
      return {
        headline: 'Not linked to your computer gateway',
        footnote:
          'Scan the QR on the computer you want — Settings → Scan pairing QR',
      };
  }
}

export function formatListeningOnGatewayLine(
  gatewayUrl: string,
  health?: GatewayHealthSnapshot | null,
  suffix?: string,
): string {
  const host = formatGatewayHostLabel(gatewayUrl, health);
  const tail = suffix ? ` ${suffix}` : '';
  return `Listening on ${host}${tail}`;
}

/** Host + port (or IP) for operator UI — always show the reachable address. */
export function formatGatewayEndpointLine(
  gatewayUrl: string,
  health?: GatewayHealthSnapshot | null,
): string {
  const lanIp = isUsableHost(health?.localIp);
  try {
    const { httpBase } = normalizeGatewayUrl(gatewayUrl);
    const url = new URL(httpBase);
    const port = url.port;
    if (lanIp) {
      return port ? `${lanIp}:${port}` : lanIp;
    }
    const hostPart = url.host;
    if (hostPart) {
      return hostPart;
    }
  } catch {
    // fall through
  }
  if (lanIp) {
    return lanIp;
  }
  return gatewayUrl.trim();
}
