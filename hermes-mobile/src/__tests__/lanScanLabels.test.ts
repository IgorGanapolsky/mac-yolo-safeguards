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

  it('formats stage labels without treating link aliases as computers', () => {
    const pairServerStage = formatLanScanStageLabel({
      stage: 'pair_server',
      completedHosts: 25,
      totalHosts: 100,
      foundCount: 0,
    });
    expect(pairServerStage).toContain('25%');
    expect(pairServerStage).toContain('Searching for Hermes computers');
    expect(pairServerStage).not.toMatch(/local/i);

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

  it('never calls Tailscale or USB results "local"', () => {
    expect(formatLanScanResultLabel(0)).toBe('None found yet');
    expect(formatLanScanResultLabel(2)).toBe('Found 2 Hermes computers');
    expect(
      formatLanScanResultLabel({
        foundCount: 3,
        lanCount: 0,
        tailscaleCount: 3,
        usbCount: 0,
      }),
    ).toBe('Found 3 on Tailscale');
    expect(
      formatLanScanResultLabel({
        foundCount: 1,
        lanCount: 0,
        tailscaleCount: 0,
        usbCount: 1,
      }),
    ).toBe('Found 1 over USB');
    expect(
      formatLanScanResultLabel({
        foundCount: 2,
        lanCount: 0,
        tailscaleCount: 0,
        usbCount: 2,
      }),
    ).toBe('Found 2 over USB');
    // Discovery copy must never claim the active chat route ("Using USB").
    expect(
      formatLanScanResultLabel({
        foundCount: 1,
        lanCount: 0,
        tailscaleCount: 0,
        usbCount: 1,
      }),
    ).not.toMatch(/Using USB/i);
    expect(
      formatLanScanResultLabel({
        foundCount: 2,
        lanCount: 2,
        tailscaleCount: 0,
        usbCount: 0,
      }),
    ).toBe('Found 2 local Hermes computers');
    expect(
      formatLanScanResultLabel({
        foundCount: 2,
        lanCount: 1,
        tailscaleCount: 1,
        usbCount: 0,
      }),
    ).toBe('Found 2 Hermes computers');
  });

  it('details match reach path (off-home Tailscale must not say local list)', () => {
    expect(
      formatLanScanResultDetail({
        foundCount: 3,
        lanCount: 0,
        tailscaleCount: 3,
        usbCount: 0,
        completedAtMs: 1,
      }),
    ).toContain('Tailscale list');
    expect(
      formatLanScanResultDetail({
        foundCount: 3,
        lanCount: 0,
        tailscaleCount: 3,
        usbCount: 0,
        completedAtMs: 1,
      }),
    ).not.toMatch(/local list/i);
    expect(
      formatLanScanResultDetail({
        foundCount: 1,
        lanCount: 1,
        tailscaleCount: 0,
        usbCount: 0,
        completedAtMs: 1,
      }),
    ).toContain('local list');
  });
});
