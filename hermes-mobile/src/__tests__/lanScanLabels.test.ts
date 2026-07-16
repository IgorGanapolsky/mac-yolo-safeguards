import {
  formatLanScanResultDetail,
  formatLanScanResultLabel,
  formatLanScanStageLabel,
  lanScanFraction,
} from '../utils/lanScanLabels';

describe('lanScanLabels', () => {
  it('computes two-phase scan fraction', () => {
    expect(
      lanScanFraction({
        stage: 'pair_server',
        completedHosts: 50,
        totalHosts: 100,
        foundCount: 0,
      }),
    ).toBe(0.25);
    expect(
      lanScanFraction({
        stage: 'gateway_health',
        completedHosts: 50,
        totalHosts: 100,
        foundCount: 1,
      }),
    ).toBe(0.75);
    expect(
      lanScanFraction({
        stage: 'complete',
        completedHosts: 100,
        totalHosts: 100,
        foundCount: 2,
      }),
    ).toBe(1);
  });

  it('formats stage labels without implying picker row count', () => {
    expect(
      formatLanScanStageLabel({
        stage: 'pair_server',
        completedHosts: 25,
        totalHosts: 100,
        foundCount: 0,
      }),
    ).toContain('25%');
    expect(
      formatLanScanStageLabel({
        stage: 'gateway_health',
        completedHosts: 94,
        totalHosts: 100,
        foundCount: 6,
      }),
    ).toBe('Checking direct Hermes links (94%) · 6 Hermes links responding');
    expect(formatLanScanResultLabel(0)).toBe('No Hermes computers found nearby');
    expect(formatLanScanResultLabel(2)).toContain('2 Hermes links');
    expect(formatLanScanResultLabel(2)).toContain('one row per computer');
    expect(formatLanScanResultDetail({ foundCount: 6, completedAtMs: 1 })).toMatch(/USB and Tailscale/i);
  });
});
