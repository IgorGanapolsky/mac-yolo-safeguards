export type LanScanStage = 'pair_server' | 'gateway_health' | 'complete';

export type LanScanProgress = {
  stage: LanScanStage;
  completedHosts: number;
  totalHosts: number;
  foundCount: number;
};

export type LanScanResult = {
  foundCount: number;
  completedAtMs: number;
};
