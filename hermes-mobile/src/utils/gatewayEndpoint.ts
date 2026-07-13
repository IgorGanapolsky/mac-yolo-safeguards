import { Platform } from 'react-native';
import { normalizeGatewayUrl } from '../services/gatewayClient';
import { isLoopbackGatewayUrl, isValidGatewayUrl } from './gatewayUrlPolicy';
import { isTailnetRouteLabel } from './tailscaleHosts';
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
  const host = trimmed.replace(/\.local$/i, '');
  if (Platform.OS !== 'web' && isLoopbackGatewayUrl(`http://${host}:8642`)) {
    return undefined;
  }
  return host;
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

import { isPrivateLanIpv4 as isPrivateLanIpv4Shared } from './gatewayUrlPolicy';

function isPrivateLanIpv4(ip: string): boolean {
  return isPrivateLanIpv4Shared(ip);
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
const UNCONFIGURED_GATEWAY_LABEL = 'Computer not configured';

export function formatGatewayHostLabel(
  gatewayUrl: string,
  health?: GatewayHealthSnapshot | null,
): string {
  if (!isValidGatewayUrl(gatewayUrl)) {
    return UNCONFIGURED_GATEWAY_LABEL;
  }
  if (isLoopbackGatewayUrl(gatewayUrl)) {
    const fromHealthName = isUsableHost(health?.hostname);
    const fromUrl = parseHostFromGatewayUrl(gatewayUrl);
    const name =
      fromHealthName?.replace(/\.local$/i, '') ??
      fromUrl.hostname?.replace(/\.local$/i, '') ??
      'Computer';
    return `${name} · USB`;
  }

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
  if (!isValidGatewayUrl(gatewayUrl)) {
    return { machineName: UNCONFIGURED_GATEWAY_LABEL };
  }
  const fromHealthName = isUsableHost(health?.hostname);
  const fromHealthIp = isUsableHost(health?.localIp);
  const fromUrl = parseHostFromGatewayUrl(gatewayUrl);

  const urlHostname =
    fromUrl.hostname && !isTailnetRouteLabel(fromUrl.hostname) ? fromUrl.hostname : undefined;
  const machineName =
    fromHealthName ?? urlHostname ?? (isTailnetRouteLabel(fromUrl.hostname) ? 'Computer via Tailscale' : fromUrl.hostname) ?? gatewayUrlHost(gatewayUrl) ?? 'computer';
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
      const directOk =
        input.health?.directGatewayReachable === true || input.health?.level === 'green';
      if (directOk && input.gatewayUrl.trim()) {
        const usb = isLoopbackGatewayUrl(input.gatewayUrl);
        return {
          headline: usb
            ? `USB link to ${machineName.replace(/\.local$/i, '')}`
            : `Direct link to ${machineName.replace(/\.local$/i, '')}`,
          machineName,
          lanIp: usb ? undefined : lanIp,
          footnote: 'Pair Hermes relay in Settings for approvals on Wi‑Fi or cellular',
        };
      }
      return {
        headline: 'Hermes relay not paired',
        footnote: 'Pair in Settings — approvals on Wi‑Fi, cellular, or USB',
      };
    }
    if (input.connectionState === 'connected') {
      return {
        headline: 'Hermes relay linked to your active machine',
        machineName,
        lanIp,
        footnote: 'Approval alerts route over the internet; Wi-Fi is only a local fallback',
      };
    }
    if (input.connectionState === 'connecting') {
      return {
        headline: 'Connecting Hermes relay to your active machine…',
        machineName,
        lanIp,
      };
    }
    return {
      headline: 'Hermes relay disconnected',
      machineName,
      lanIp,
      footnote: 'Check pairing in Settings',
    };
  }

  switch (input.connectionState) {
    case 'connected':
      return {
        headline: 'Direct local link to your computer',
        machineName,
        lanIp,
        footnote: 'Phone receives instant alerts when Hermes blocks a risky command',
      };
    case 'connecting':
      return {
        headline: 'Connecting directly to your computer…',
        machineName,
        lanIp,
      };
    default:
      return {
        headline: 'No direct local link',
        footnote:
          'Use Hermes relay from Settings, or scan a nearby computer QR for local fallback',
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
  if (!isValidGatewayUrl(gatewayUrl)) {
    return 'Set computer in Settings';
  }
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
