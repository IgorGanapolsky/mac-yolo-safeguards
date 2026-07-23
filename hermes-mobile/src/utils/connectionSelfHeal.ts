import type { GatewayProfile } from '../types/gatewayProfile';
import type { DiscoveredGateway } from '../types/gatewayProfile';
import {
  findProfileForGatewayUrl,
  profileMachineKey,
  profilesForActiveMachine,
  profilesShareMachine,
  shouldProbeGatewayUrlForActiveProfile,
} from '../services/gatewayProfiles';
import { profileMatchesDiscoveredGateway } from './gatewayProfilePicker';
import { isPrivateLanGatewayUrl } from './gatewayEndpoint';
import {
  cellularTailscaleFallbackUrls,
  usbLoopbackFallbackUrls,
  wifiLanFallbackUrls,
} from './gatewayLoopbackFallback';
import { isLoopbackGatewayUrl, isValidGatewayUrl } from './gatewayUrlPolicy';
import { isTailscaleGatewayUrl } from './tailscaleHosts';

export const CONNECTION_SELF_HEAL_INTERVAL_MS = 5_000;

export function savedProfileFallbackUrls(input: {
  primaryUrl: string;
  profiles: GatewayProfile[];
  preferTailscaleFirst?: boolean;
  activeProfileId?: string | null;
  /** When false (cellular), prefer Tailscale routes before loopback/LAN for the active Mac. */
  wifiConnected?: boolean;
}): string[] {
  const primary = input.primaryUrl.trim();
  const seen = new Set<string>([primary]);
  const tailscale: string[] = [];
  const lan: string[] = [];
  const loopback: string[] = [];
  const other: string[] = [];

  const activeProfile = input.activeProfileId
    ? input.profiles.find((profile) => profile.id === input.activeProfileId)
    : undefined;

  for (const profile of input.profiles) {
    if (activeProfile && profile.id !== activeProfile.id && !profilesShareMachine(activeProfile, profile)) {
      continue;
    }
    const url = profile.gatewayUrl.trim();
    if (!url || seen.has(url) || !isValidGatewayUrl(url)) {
      continue;
    }
    seen.add(url);
    if (isTailscaleGatewayUrl(url)) {
      tailscale.push(url);
    } else if (isLoopbackGatewayUrl(url)) {
      loopback.push(url);
    } else if (isPrivateLanGatewayUrl(url)) {
      lan.push(url);
    } else {
      other.push(url);
    }
  }

  const activeUrl = input.activeProfileId
    ? input.profiles.find((profile) => profile.id === input.activeProfileId)?.gatewayUrl.trim()
    : undefined;

  let ordered: string[];
  if (input.activeProfileId !== undefined) {
    const preferTailscale =
      input.preferTailscaleFirst ?? input.wifiConnected === false;
    ordered = preferTailscale
      ? [...tailscale, ...loopback, ...lan, ...other]
      : [...loopback, ...lan, ...tailscale, ...other];
  } else {
    const preferTailscale =
      input.preferTailscaleFirst ?? isPrivateLanGatewayUrl(primary);
    ordered = preferTailscale
      ? [...tailscale, ...lan, ...other, ...loopback]
      : [...lan, ...tailscale, ...other, ...loopback];
  }

  if (activeUrl && activeUrl !== primary) {
    ordered = [activeUrl, ...ordered.filter((url) => url !== activeUrl)];
  }

  return ordered;
}

export function buildSelfHealProbeUrls(input: {
  primaryUrl: string;
  wifiConnected: boolean;
  lastLanIp?: string | null;
  profiles: GatewayProfile[];
  tailnetProbeHosts?: string[];
  activeProfileId?: string | null;
}): string[] {
  const primary = input.primaryUrl.trim();
  const seen = new Set<string>();
  const ordered: string[] = [];

  const push = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed || trimmed === primary || seen.has(trimmed) || !isValidGatewayUrl(trimmed)) {
      return;
    }
    seen.add(trimmed);
    ordered.push(trimmed);
  };

  for (const url of savedProfileFallbackUrls({
    primaryUrl: primary,
    profiles: input.profiles,
    activeProfileId: input.activeProfileId ?? null,
    wifiConnected: input.wifiConnected,
  })) {
    push(url);
  }

  for (const url of cellularTailscaleFallbackUrls({
    primaryUrl: primary,
    wifiConnected: input.wifiConnected,
    profileUrls: profilesForActiveMachine(input.profiles, input.activeProfileId).map(
      (profile) => profile.gatewayUrl,
    ),
    tailnetProbeHosts: input.tailnetProbeHosts,
  })) {
    push(url);
  }

  for (const url of usbLoopbackFallbackUrls(primary)) {
    // USB answers whichever Mac is cabled — never probe it when the user picked another computer.
    if (
      input.activeProfileId == null ||
      shouldProbeGatewayUrlForActiveProfile(
        { profiles: input.profiles, activeProfileId: input.activeProfileId },
        url,
      )
    ) {
      push(url);
    }
  }

  for (const url of wifiLanFallbackUrls({
    primaryUrl: primary,
    wifiConnected: input.wifiConnected,
    lastLanIp: input.lastLanIp,
    profileLanIps: profilesForActiveMachine(input.profiles, input.activeProfileId).map(
      (profile) => profile.localIp?.trim() || undefined,
    ),
  })) {
    push(url);
  }

  return ordered;
}

/**
 * Active session is Tailscale/LAN to a Mac that is **not** the cabled host.
 * Preferring USB would steal the intentional remote session (e.g. mini via
 * Tailscale while Pro is plugged into the phone). Always honor the remote Mac.
 *
 * Not foreign when the *effective* route is already USB (same-Mac handoff kept
 * sticky Tailscale profile id while chat URL is 127.0.0.1).
 */
export function isForeignUsbVsActiveRemote(input: {
  activeGatewayUrl?: string | null;
  effectiveGatewayUrl?: string | null;
  /** Live reverse hostname matches the active/sticky Mac identity. */
  liveUsbSameMachine?: boolean;
}): boolean {
  const effective = input.effectiveGatewayUrl?.trim() ?? '';
  // Already chatting over USB — not a remote-other-Mac session to protect.
  if (effective && isLoopbackGatewayUrl(effective)) {
    return false;
  }
  const active = input.activeGatewayUrl?.trim() ?? '';
  if (!active || isLoopbackGatewayUrl(active)) {
    return false;
  }
  const remote =
    isTailscaleGatewayUrl(active) || isPrivateLanGatewayUrl(active);
  if (!remote) {
    return false;
  }
  // Remote sticky + cable is a different Mac (or no same-machine proof).
  return input.liveUsbSameMachine !== true;
}

/**
 * Prefer USB in autoDiscover **probe order only** — never force USB as the only path.
 *
 * Product (2026-07-23):
 * - Same sticky Mac + live reverse → try USB first (even if sticky URL is Tailscale).
 * - USB probe fails → fall through to Tailscale/LAN (never USB-only).
 * - **Active Tailscale/LAN to another Mac** (mini remote, Pro cable) → never prefer USB.
 *
 * Ghost guard: without liveUsbSameMachine, still require Wi‑Fi + already-loopback
 * profile/effective URL (cellular ghost 127.0.0.1 without live hostname stays out).
 */
export function shouldPreferUsbProbeFirst(input: {
  activeGatewayUrl?: string | null;
  /** Session reach URL — may be USB while sticky profile URL remains Tailscale. */
  effectiveGatewayUrl?: string | null;
  wifiConnected: boolean;
  /**
   * Live adb reverse /health hostname matches the sticky/active Mac.
   * When true, prefer USB first (not force) even on cellular / Tailscale sticky URL.
   * When false/absent and sticky is remote Tailscale/LAN → never prefer USB.
   */
  liveUsbSameMachine?: boolean;
}): boolean {
  // HARD: user is on Tailscale/LAN to machine A; cable is machine B → stay on A.
  if (
    isForeignUsbVsActiveRemote({
      activeGatewayUrl: input.activeGatewayUrl,
      effectiveGatewayUrl: input.effectiveGatewayUrl,
      liveUsbSameMachine: input.liveUsbSameMachine,
    })
  ) {
    return false;
  }
  if (input.liveUsbSameMachine) {
    return true;
  }
  const active = input.activeGatewayUrl?.trim() ?? '';
  const effective = input.effectiveGatewayUrl?.trim() ?? '';
  const onUsb =
    (Boolean(active) && isLoopbackGatewayUrl(active)) ||
    (Boolean(effective) && isLoopbackGatewayUrl(effective));
  return Boolean(onUsb && input.wifiConnected);
}

/**
 * Prefer keeping a **healthy** same-Mac USB route over re-applying sticky Tailscale/LAN
 * in the same autoDiscover pass (stops USB→Tailscale thrash while cable is live).
 * Not a force: if USB dies, callers fall through and probe sticky remote.
 * Foreign sticky Mac (mini Tailscale while Pro cabled) returns false — stay on mini.
 */
export function shouldKeepUsbOverStickyRemote(input: {
  effectiveGatewayUrl?: string | null;
  stickyProfileUrl?: string | null;
  liveUsbSameMachine: boolean;
}): boolean {
  const effective = input.effectiveGatewayUrl?.trim() ?? '';
  const sticky = input.stickyProfileUrl?.trim() ?? '';
  // Never "keep USB" when the cable is a different Mac than the sticky session.
  if (!input.liveUsbSameMachine || !isLoopbackGatewayUrl(effective)) {
    return false;
  }
  if (!sticky || isLoopbackGatewayUrl(sticky)) {
    return false;
  }
  return isTailscaleGatewayUrl(sticky) || isPrivateLanGatewayUrl(sticky);
}

/**
 * On cellular, do not accept a successful loopback /health as the session route when a
 * Tailscale alternate exists — clears false "USB Connected" from ghost adb reverse.
 * Skip defer when live USB reverse is confirmed (real cable on 5G).
 */
export function shouldDeferLoopbackSuccessOnCellular(input: {
  primaryUrl: string;
  wifiConnected: boolean;
  hasTailscaleAlternate: boolean;
  liveUsbConfirmed?: boolean;
}): boolean {
  if (input.liveUsbConfirmed) {
    return false;
  }
  return (
    !input.wifiConnected &&
    isLoopbackGatewayUrl(input.primaryUrl) &&
    input.hasTailscaleAlternate
  );
}

/**
 * Clear USB-primary on cellular when a same-machine Tailscale URL is available.
 * Never clear when live USB reverse is confirmed (cable + hostname) — product lock.
 */
export function shouldClearUsbPrimaryOnCellular(input: {
  primaryUrl: string;
  wifiConnected: boolean;
  failoverUrl: string | null | undefined;
  /** Live adb reverse /health for the cable — blocks ghost-clear of a real USB path. */
  liveUsbConfirmed?: boolean;
}): boolean {
  if (input.liveUsbConfirmed) {
    return false;
  }
  const failover = input.failoverUrl?.trim();
  if (!failover || input.wifiConnected) {
    return false;
  }
  if (!isLoopbackGatewayUrl(input.primaryUrl)) {
    return false;
  }
  return isTailscaleGatewayUrl(failover) && failover !== input.primaryUrl.trim();
}

/** First Tailscale URL among profiles/discoveries that is not the primary. */
function firstOtherTailscaleUrl(
  primary: string,
  profiles: GatewayProfile[],
  discoveries: DiscoveredGateway[],
): string | null {
  for (const profile of profiles) {
    const url = profile.gatewayUrl.trim();
    if (url && url !== primary && isTailscaleGatewayUrl(url)) {
      return url;
    }
  }
  for (const discovery of discoveries) {
    const url = discovery.gatewayUrl.trim();
    if (url && url !== primary && isTailscaleGatewayUrl(url)) {
      return url;
    }
  }
  return null;
}

/**
 * When cellular/off-Wi‑Fi blocks LAN/USB, pick a Tailscale URL.
 * Prefer same-machine Tailscale for the active computer.
 * Anonymous USB (no machine key) may fall through to any Tailscale peer.
 * Named USB/LAN (MacBook Pro) must NOT silently jump to Mac mini — selection sticks.
 */
export function resolveCellularTailscaleFailoverUrl(input: {
  primaryUrl: string;
  profiles: GatewayProfile[];
  activeProfile: GatewayProfile | null;
  discoveries?: DiscoveredGateway[];
}): string | null {
  const primary = input.primaryUrl.trim();
  if (!primary || isTailscaleGatewayUrl(primary)) {
    return null;
  }
  if (!isPrivateLanGatewayUrl(primary) && !isLoopbackGatewayUrl(primary)) {
    return null;
  }

  const active = input.activeProfile;
  const discoveries = input.discoveries ?? [];

  if (active) {
    if (isTailscaleGatewayUrl(active.gatewayUrl) && active.gatewayUrl !== primary) {
      return active.gatewayUrl;
    }
    for (const discovery of discoveries) {
      if (
        isTailscaleGatewayUrl(discovery.gatewayUrl) &&
        profileMatchesDiscoveredGateway(active, discovery)
      ) {
        return discovery.gatewayUrl;
      }
    }
    for (const profile of input.profiles) {
      if (
        profile.id !== active.id &&
        isTailscaleGatewayUrl(profile.gatewayUrl) &&
        profileMatchesDiscoveredGateway(active, {
          gatewayUrl: profile.gatewayUrl,
          hostname: profile.hostname,
          label: profile.label,
          localIp: profile.localIp,
        })
      ) {
        return profile.gatewayUrl;
      }
    }
    // Anonymous sticky USB/LAN only — never auto-steal a named MacBook → mini.
    if (
      !profileMachineKey(active) &&
      (isLoopbackGatewayUrl(primary) || isPrivateLanGatewayUrl(primary))
    ) {
      return firstOtherTailscaleUrl(primary, input.profiles, discoveries);
    }
    return null;
  }

  return firstOtherTailscaleUrl(primary, input.profiles, discoveries);
}

/** Pick the per-profile API key that matches a gateway URL before heal/failover probes. */
export async function resolveApiKeyForGatewayProbe(input: {
  gatewayUrl: string;
  profiles: GatewayProfile[];
  activeProfileId: string | null | undefined;
  fallbackKey: string;
  resolveProfileKey: (profileId: string) => Promise<string | null>;
}): Promise<string> {
  const matched = findProfileForGatewayUrl(input.profiles, input.gatewayUrl);
  if (matched) {
    const matchedKey = await input.resolveProfileKey(matched.id);
    if (matchedKey) {
      return matchedKey;
    }
  }
  const activeId = input.activeProfileId?.trim();
  if (activeId) {
    const activeKey = await input.resolveProfileKey(activeId);
    if (activeKey) {
      return activeKey;
    }
  }
  return input.fallbackKey;
}
