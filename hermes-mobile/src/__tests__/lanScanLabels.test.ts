import {
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

  it('formats stage and result labels', () => {
    expect(
      formatLanScanStageLabel({
        stage: 'pair_server',
        completedHosts: 25,
        totalHosts: 100,
        foundCount: 0,
      }),
    ).toContain('25%');
    expect(formatLanScanResultLabel(0)).toBe('No local Hermes machines found');
    expect(formatLanScanResultLabel(2)).toBe('Found 2 local Hermes machines');
  });

  it('never implies URL alias count as computers found (Mac Pro rage)', () => {
    const midScan = formatLanScanStageLabel({
      stage: 'gateway_health',
      completedHosts: 94,
      totalHosts: 100,
      foundCount: 2,
      linkCount: 6,
    });
    expect(midScan).toContain('94%');
    expect(midScan).toContain('6 links across 2 computers');
    expect(midScan).not.toMatch(/6 found so far/);
    expect(midScan).not.toMatch(/6 computers/);

    const computersOnly = formatLanScanStageLabel({
      stage: 'gateway_health',
      completedHosts: 50,
      totalHosts: 100,
      foundCount: 2,
    });
    expect(computersOnly).toContain('2 computers so far');
    expect(computersOnly).not.toMatch(/found so far/);
  });
});
