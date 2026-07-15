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
    expect(script).toMatch(/eas update/);
    expect(script).toMatch(/production/);
  });
});
