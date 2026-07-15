export type LanScanStage = 'pair_server' | 'gateway_health' | 'complete';

export type LanScanProgress = {
  stage: LanScanStage;
  completedHosts: number;
  totalHosts: number;
  /** Unique computers (not URL aliases / probe links). */
  foundCount: number;
  /** Optional: distinct gateway URLs probed — never shown as "machines found". */
  linkCount?: number;
};

export type LanScanResult = {
  foundCount: number;
  completedAtMs: number;
};
