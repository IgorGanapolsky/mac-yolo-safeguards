import fs from 'fs';
import path from 'path';

const {
  applyIosAtsTailscaleToPlist,
  PRIVATE_HTTP_EXCEPTIONS,
} = require('../../plugins/withIosAtsTailscale.js') as {
  applyIosAtsTailscaleToPlist: (
    plist: Record<string, unknown>,
  ) => Record<string, unknown>;
  PRIVATE_HTTP_EXCEPTIONS: Record<string, Record<string, boolean>>;
};

/**
 * Physical iPad proof on iPadOS 17.7.6 returned NSURLErrorDomain -1022 for
 * every 100.x URL when both global ATS keys were present. Apple documents that
 * the local key makes iOS 10+ ignore NSAllowsArbitraryLoads, while iOS 17 needs
 * explicit IP/CIDR exceptions.
 */
describe('iOS ATS Tailscale cleartext contract', () => {
  const root = path.join(__dirname, '../..');

  it('app.json allows only private LAN, Tailscale CGNAT/IPv6, and MagicDNS HTTP', () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(root, 'app.json'), 'utf8'),
    );
    const ats = appJson?.expo?.ios?.infoPlist?.NSAppTransportSecurity;
    expect(ats.NSAllowsArbitraryLoads).toBeUndefined();
    expect(ats.NSAllowsLocalNetworking).toBe(true);
    expect(ats.NSExceptionDomains).toEqual(PRIVATE_HTTP_EXCEPTIONS);
    expect(appJson?.expo?.ios?.infoPlist?.NSLocalNetworkUsageDescription).toMatch(
      /Wi|Tailscale/i,
    );
  });

  it('deletes the ignored broad key and preserves unrelated native exceptions', () => {
    const generated = applyIosAtsTailscaleToPlist({
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
        NSExceptionDomains: { 'example.test': {} },
      },
    });
    const ats = generated.NSAppTransportSecurity as Record<string, unknown>;
    expect(ats.NSAllowsArbitraryLoads).toBeUndefined();
    expect(generated).toEqual(
      expect.objectContaining({
        NSAppTransportSecurity: {
          NSAllowsLocalNetworking: true,
          NSExceptionDomains: {
            'example.test': {},
            ...PRIVATE_HTTP_EXCEPTIONS,
          },
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
    expect(pluginSource).toContain('delete ats.NSAllowsArbitraryLoads');
  });
});
