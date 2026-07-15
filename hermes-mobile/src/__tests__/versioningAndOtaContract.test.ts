import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../..');
const REPO = path.join(ROOT, '..');

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Record<string, unknown>;
}

describe('versioning and OTA contract', () => {
  it('enables EAS Update with appVersion runtime policy', () => {
    const app = readJson('app.json') as {
      expo: {
        version: string;
        runtimeVersion?: { policy?: string };
        updates?: { enabled?: boolean; url?: string; checkAutomatically?: string };
      };
    };
    expect(app.expo.updates?.enabled).toBe(true);
    expect(app.expo.runtimeVersion?.policy).toBe('appVersion');
    expect(app.expo.updates?.url).toMatch(/u\.expo\.dev/);
    expect(app.expo.updates?.checkAutomatically).toBe('ON_LOAD');
    expect(app.expo.version).toMatch(/^\d+\.\d+(\.\d+)?$/);
  });

  it('production EAS profile targets production channel with remote build numbers', () => {
    const eas = readJson('eas.json') as {
      cli?: { appVersionSource?: string };
      build?: { production?: { channel?: string; autoIncrement?: boolean } };
    };
    expect(eas.cli?.appVersionSource).toBe('remote');
    expect(eas.build?.production?.channel).toBe('production');
    expect(eas.build?.production?.autoIncrement).toBe(true);
  });

  it('documents OTA CI and versioning contract', () => {
    const otaWorkflow = fs.readFileSync(
      path.join(REPO, '.github/workflows/mobile-ota.yml'),
      'utf8',
    );
    expect(otaWorkflow).toMatch(/eas update/);
    expect(otaWorkflow).toMatch(/production/);

    const contract = fs.readFileSync(
      path.join(ROOT, 'docs/VERSIONING-AND-RELEASES.md'),
      'utf8',
    );
    expect(contract).toMatch(/runtimeVersion/);
    expect(contract).toMatch(/OTA/);
    expect(contract).toMatch(/Semantic versioning/i);
  });

  it('package scripts expose production OTA publish', () => {
    const pkg = readJson('package.json') as { scripts?: Record<string, string> };
    const script = pkg.scripts?.['ota:production'] || pkg.scripts?.['ota:publish'] || '';
    // Crisis 2026-07-15: production publish goes through gated wrapper (not raw eas update).
    expect(script).toMatch(/ota-publish-gated\.sh/);
    expect(script).toMatch(/production/);
    expect(script).toMatch(/require-stranger-cold-start-proof/);
    const gated = fs.readFileSync(path.join(ROOT, 'scripts/ota-publish-gated.sh'), 'utf8');
    expect(gated).toMatch(/eas update/);
    expect(gated).toMatch(/require-fresh-user-ota-gate/);
  });
});

  it('keeps Play train on marketing/runtime 1.0 until NSC binary replaces VC13', () => {
    const app = readJson('app.json') as { expo: { version: string } };
    // Play public is 1.0/vc13 without Tailscale cleartext; OTA cannot deliver NSC.
    // Do not bump expo.version to 1.1 while Android store users still need a 1.0 native rebuild.
    expect(app.expo.version).toBe('1.0');
  });

  it('ships Android NSC base cleartext so Tailscale Find computers works', () => {
    const plugin = fs.readFileSync(
      path.join(ROOT, 'plugins/withNetworkSecurityConfig.js'),
      'utf8',
    );
    expect(plugin).toMatch(/base-config cleartextTrafficPermitted="true"/);
    expect(plugin).toMatch(/ts\.net/);
  });
