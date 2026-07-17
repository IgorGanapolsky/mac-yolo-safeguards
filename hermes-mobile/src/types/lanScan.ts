export type LanScanStage = 'pair_server' | 'gateway_health' | 'complete';

/** Unique computers classified by winning reach path after machine dedupe. */
export type LanScanReachCounts = {
  foundCount: number;
  /** True home Wi‑Fi / mDNS (.local / RFC1918). Never includes Tailscale CGNAT 100.64/10. */
  lanCount?: number;
  /** Tailscale MagicDNS / 100.x — never labeled "local". */
  tailscaleCount?: number;
  /** USB adb-reverse loopback (127.0.0.1 / localhost). */
  usbCount?: number;
};

export type LanScanProgress = LanScanReachCounts & {
  stage: LanScanStage;
  completedHosts: number;
  totalHosts: number;
  /** Optional: distinct gateway URLs probed — never shown as "machines found". */
  linkCount?: number;
};

export type LanScanResult = LanScanReachCounts & {
  completedAtMs: number;
};
