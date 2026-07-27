import fs from 'fs';
import path from 'path';

/**
 * iPad Cannot reach Tailscale 100.x (2026-07-23): Apple NSAllowsLocalNetworking
 * covers RFC1918 only — not CGNAT 100.64/10. Cleartext gateway HTTP must be
 * allowed via NSAllowsArbitraryLoads (Android NSC already allowlists Tailscale).
 * `ios/` is gitignored — app.json is the durable prebuild source of truth.
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
  });

  it('documents why NSAllowsLocalNetworking alone is insufficient', () => {
    const appJsonRaw = fs.readFileSync(path.join(root, 'app.json'), 'utf8');
    // Guard against silent regression to local-only ATS (breaks iPad→100.x).
    expect(appJsonRaw).toMatch(/NSAllowsArbitraryLoads"\s*:\s*true/);
  });
});
