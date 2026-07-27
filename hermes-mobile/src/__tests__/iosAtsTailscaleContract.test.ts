import fs from 'fs';
import path from 'path';

const {
  applyIosAtsTailscaleToPlist,
} = require('../../plugins/withIosAtsTailscale.js') as {
  applyIosAtsTailscaleToPlist: (
    plist: Record<string, unknown>,
  ) => Record<string, unknown>;
};

/**
 * iPad Cannot reach Tailscale 100.x (2026-07-23): iPadOS 17 requires an
 * explicit local-network ATS exception for IP-address loads. Apple documents
 * combining it with the broad key for older-OS compatibility.
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
      /Wi|Tailscale/i,
    );
  });

  it('generates both ATS keys without depending on ignored native output', () => {
    const generated = applyIosAtsTailscaleToPlist({
      NSAppTransportSecurity: { NSExceptionDomains: { 'example.test': {} } },
    });
    expect(generated).toEqual(
      expect.objectContaining({
        NSAppTransportSecurity: {
          NSExceptionDomains: { 'example.test': {} },
          NSAllowsArbitraryLoads: true,
          NSAllowsLocalNetworking: true,
        },
        NSLocalNetworkUsageDescription: expect.stringMatching(/Wi|Tailscale/i),
      }),
    );
  });

  it('runs the ATS plugin during every native prebuild', () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(root, 'app.json'), 'utf8'),
    );
    const pluginNames = (appJson?.expo?.plugins ?? []).map((plugin: unknown) =>
      Array.isArray(plugin) ? plugin[0] : plugin,
    );
    expect(pluginNames).toContain('./plugins/withIosAtsTailscale.js');

    const pluginSource = fs.readFileSync(
      path.join(root, 'plugins/withIosAtsTailscale.js'),
      'utf8',
    );
    expect(pluginSource).toContain('withInfoPlist');
    expect(pluginSource).toContain('applyIosAtsTailscaleToPlist');
    expect(pluginSource).not.toContain('delete ats.NSAllowsLocalNetworking');
  });
});
