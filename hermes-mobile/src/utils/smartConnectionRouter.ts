import { probeGatewayDetailed } from '../services/gatewayDiscovery';
import type { GatewayHealthSnapshot } from '../types/gateway';

export type SmartRouteCandidate = {
  url: string;
  kind: 'lan' | 'tailscale' | 'loopback' | 'relay';
  label: string;
};

export type SmartRouteRaceResult = {
  winnerUrl: string;
  winnerKind: 'lan' | 'tailscale' | 'loopback' | 'relay';
  health: GatewayHealthSnapshot;
  latencyMs: number;
};

/**
 * Smart Multi-Target Connection Router (Uber-style Auto-Switch)
 *
 * Races all potential connection candidates concurrently (LAN Wi-Fi, Tailscale, Relay)
 * with a fast 2,000ms timeout per target. Returns the fastest responding reachable endpoint.
 */
export async function raceFastestConnectionRoute(
  candidates: SmartRouteCandidate[],
  options: { timeoutMs?: number } = {},
): Promise<SmartRouteRaceResult | null> {
  if (!candidates || candidates.length === 0) {
    return null;
  }

  const timeoutMs = options.timeoutMs ?? 2000;
  const uniqueCandidates = Array.from(
    new Map(candidates.map((c) => [c.url.trim().replace(/\/+$/, ''), c])).values(),
  );

  const startTime = Date.now();

  const probePromises = uniqueCandidates.map(async (candidate) => {
    const probeTimer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout probing ${candidate.url}`)), timeoutMs),
    );

    const probeExec = (async () => {
      const discovered = await probeGatewayDetailed(candidate.url);
      if (!discovered || discovered.reachable === false) {
        throw new Error(`Unreachable on ${candidate.url}`);
      }
      return {
        winnerUrl: candidate.url,
        winnerKind: candidate.kind,
        health: discovered as unknown as GatewayHealthSnapshot,
        latencyMs: Date.now() - startTime,
      };
    })();

    return Promise.race([probeExec, probeTimer]);
  });

  try {
    // Return the first candidate that resolves 200 OK
    return await Promise.any(probePromises);
  } catch {
    // All candidates failed or timed out
    return null;
  }
}
