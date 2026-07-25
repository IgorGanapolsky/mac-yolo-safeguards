import fs from 'fs';
import path from 'path';

/**
 * iPad Cannot reach Tailscale 100.x (2026-07-23 / 2026-07-25): Apple
 * NSAllowsLocalNetworking covers RFC1918 only — not CGNAT 100.64/10. Cleartext
 * gateway HTTP must be allowed via NSAllowsArbitraryLoads (Android NSC already
 * allowlists Tailscale). `ios/` is gitignored — app.json + withIosAtsTailscale
 * plugin are the durable prebuild source of truth.
 *
 * 2026-07-25: local Info.plist had NSAllowsArbitraryLoads=false (prebuild drift)
 * while app.json said true → iPad stuck on Outdated connection / never Connected.
 */
describe('iOS ATS Tailscale cleartext contract', () => {
  const root = path.join(__dirname, '../..');

  it('app.json ios.infoPlist allows Tailscale CGNAT cleartext HTTP', () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(root, 'app.json'), 'utf8'),
    );
    const ats = appJson?.expo?.ios?.infoPlist?.NSAppTransportSecurity;
    expect(ats).toEqual({
      NSAllowsArbitraryLoads: true,
      NSAllowsLocalNetworking: true,
    });
    expect(appJson?.expo?.ios?.infoPlist?.NSLocalNetworkUsageDescription).toMatch(
      /Tailscale|Wi/i,
    );
  });

  it('documents why NSAllowsLocalNetworking alone is insufficient', () => {
    const appJsonRaw = fs.readFileSync(path.join(root, 'app.json'), 'utf8');
    // Guard against silent regression to local-only ATS (breaks iPad→100.x).
    expect(appJsonRaw).toMatch(/NSAllowsArbitraryLoads"\s*:\s*true/);
  });

  it('wires withIosAtsTailscale so prebuild cannot ship ArbitraryLoads=false', () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(root, 'app.json'), 'utf8'),
    );
    const plugins = appJson?.expo?.plugins ?? [];
    const flat = plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    expect(flat).toContain('./plugins/withIosAtsTailscale.js');
    const plugin = fs.readFileSync(
      path.join(root, 'plugins/withIosAtsTailscale.js'),
      'utf8',
    );
    expect(plugin).toContain('NSAllowsArbitraryLoads: true');
    expect(plugin).toContain('withInfoPlist');
  });
});
