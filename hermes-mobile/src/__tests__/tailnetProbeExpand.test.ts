import { expandTailnetProbeHosts } from '../utils/tailnetProbeExpand';

describe('expandTailnetProbeHosts', () => {
  it('adds -1 MagicDNS sibling for a bare device name', () => {
    const expanded = expandTailnetProbeHosts([
      'office-mac.tailexample.ts.net',
      '100.64.1.2',
    ]);
    expect(expanded).toEqual(
      expect.arrayContaining([
        'office-mac.tailexample.ts.net',
        'office-mac-1.tailexample.ts.net',
        '100.64.1.2',
      ]),
    );
  });

  it('adds bare MagicDNS sibling for a -N renamed node', () => {
    const expanded = expandTailnetProbeHosts(['office-mac-1.tailexample.ts.net']);
    expect(expanded).toEqual(
      expect.arrayContaining([
        'office-mac-1.tailexample.ts.net',
        'office-mac.tailexample.ts.net',
      ]),
    );
  });

  it('leaves CGNAT IPs unchanged and does not invent non-ts hosts', () => {
    expect(expandTailnetProbeHosts(['100.64.2.3', 'not-a-host'])).toEqual([
      '100.64.2.3',
    ]);
  });
});
