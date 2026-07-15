import {
  buildRelayDeepLink,
  buildSetupDeepLink,
  buildStartFreshChatDeepLink,
  isStartFreshChatDeepLink,
  parseRelayDeepLink,
  parseSetupDeepLink,
} from '../utils/setupDeepLink';

describe('setupDeepLink', () => {
  it('builds and parses setup URLs with relay code', () => {
    const link = buildSetupDeepLink(
      'http://192.168.12.208:8642',
      'sk-test',
      'Mac-Mini',
      'moon-dust',
    );
    const parsed = parseSetupDeepLink(link);
    expect(parsed).toEqual({
      gatewayUrl: 'http://192.168.12.208:8642',
      apiKey: 'sk-test',
      macName: 'Mac-Mini',
      relayCode: 'MOON-DUST',
    });

    const parsedLower = parseSetupDeepLink('hermes://setup?url=http://192.168.12.208:8642&key=sk-test&name=Mac-Mini&relay=moon-dust');
    expect(parsedLower).toEqual({
      gatewayUrl: 'http://192.168.12.208:8642',
      apiKey: 'sk-test',
      macName: 'Mac-Mini',
      relayCode: 'MOON-DUST',
    });
  });

  it('builds and parses setup URLs', () => {
    const link = buildSetupDeepLink('http://192.168.12.208:8642', 'sk-test', 'Mac-Mini');
    expect(link).toContain('hermes://setup?');
    const parsed = parseSetupDeepLink(link);
    expect(parsed).toEqual({
      gatewayUrl: 'http://192.168.12.208:8642',
      apiKey: 'sk-test',
      macName: 'Mac-Mini',
    });
  });

  it('parses demo-mode setup for simulator E2E', () => {
    expect(parseSetupDeepLink('hermes://setup?demo=1')).toEqual({ demoMode: true });
  });

  it('parses relay-only deep links', () => {
    expect(parseRelayDeepLink('hermes://relay?relay=MOON-DUST')).toEqual({
      relayCode: 'MOON-DUST',
    });
    expect(parseRelayDeepLink('hermes://relay?relay=moon-dust')).toEqual({
      relayCode: 'MOON-DUST',
    });
    expect(buildRelayDeepLink('moon-dust')).toBe('hermes://relay?relay=MOON-DUST');
  });

  it('builds and parses tailnet probe hosts from setup URLs', () => {
    const link = buildSetupDeepLink(
      'http://127.0.0.1:8642',
      'sk-test',
      'Igors-MacBook-Pro',
      undefined,
      ['100.94.135.78', 'mac-mini.tailnet.ts.net'],
    );
    const parsed = parseSetupDeepLink(link);
    expect(parsed?.tailnetProbeHosts?.sort()).toEqual(
      ['100.94.135.78', 'mac-mini.tailnet.ts.net'].sort(),
    );
  });

  it('parses tailnet-only setup links without changing the primary gateway URL', () => {
    const parsed = parseSetupDeepLink(
      'hermes://setup?tailnet=100.94.135.78&tailnet=100.87.85.85&extraUrl=http%3A%2F%2F100.94.135.78%3A8642&extraName=Igors-Mac-mini',
    );
    expect(parsed).toEqual({
      tailnetProbeHosts: ['100.94.135.78', '100.87.85.85'],
      extraComputers: [
        {
          gatewayUrl: 'http://100.94.135.78:8642',
          macName: 'Igors-Mac-mini',
        },
      ],
    });
  });

  it('builds and parses extra saved computers from setup URLs', () => {
    const link = buildSetupDeepLink(
      'http://10.154.137.152:8642',
      'sk-test',
      'Igors-MacBook-Pro',
      undefined,
      ['igors-mac-mini.tail12aa33.ts.net'],
      [
        {
          gatewayUrl: 'http://100.94.135.78:8642',
          macName: 'Igors-Mac-mini',
          apiKey: 'sk-mini-key',
        },
      ],
    );
    const parsed = parseSetupDeepLink(link);
    expect(parsed?.extraComputers).toEqual([
      {
        gatewayUrl: 'http://100.94.135.78:8642',
        macName: 'Igors-Mac-mini',
        apiKey: 'sk-mini-key',
      },
    ]);
  });

  it('parses a secretless pairCode + pairServer deep link without requiring a gateway url', () => {
    const parsed = parseSetupDeepLink(
      'hermes://setup?pairCode=AB23CD45&pairServer=http://192.168.1.5:8765&name=Mac-Mini',
    );
    expect(parsed).toEqual({
      gatewayUrl: undefined,
      macName: 'Mac-Mini',
      pairingCode: 'AB23CD45',
      pairServerUrl: 'http://192.168.1.5:8765',
    });
    // Never embeds a raw key alongside the secretless code.
    expect(parsed?.apiKey).toBeUndefined();
  });

  it('parses legacy secretless links that used code= instead of pairCode=', () => {
    const parsed = parseSetupDeepLink(
      'hermes://setup?code=AB23CD45&pairServer=http://192.168.1.5:8765&name=Mac-Mini',
    );
    expect(parsed).toEqual({
      gatewayUrl: undefined,
      macName: 'Mac-Mini',
      pairingCode: 'AB23CD45',
      pairServerUrl: 'http://192.168.1.5:8765',
    });
    expect(parsed?.relayCode).toBeUndefined();
  });

  it('never confuses the secretless pairCode with the existing relay code/relay params', () => {
    const parsed = parseSetupDeepLink(
      'hermes://setup?url=http://192.168.1.5:8642&key=sk-legacy&relay=moon-dust&pairCode=ZZ99YY88&pairServer=http://192.168.1.5:8765',
    );
    expect(parsed?.relayCode).toBe('MOON-DUST');
    expect(parsed?.pairingCode).toBe('ZZ99YY88');
    expect(parsed?.apiKey).toBe('sk-legacy');
  });

  it('returns null for non-setup links', () => {
    expect(parseSetupDeepLink('hermes://leash/approve')).toBeNull();
  });

  it('detects Start fresh chat deep links for adb agents', () => {
    expect(isStartFreshChatDeepLink('hermes://chat?fresh=1')).toBe(true);
    expect(isStartFreshChatDeepLink('hermes://chat?fresh=true')).toBe(true);
    expect(isStartFreshChatDeepLink('hermes://chat?startFresh=yes')).toBe(true);
    expect(isStartFreshChatDeepLink('hermes://new-chat')).toBe(true);
    expect(isStartFreshChatDeepLink('hermes://new-chat?utm_source=agent')).toBe(true);
    expect(isStartFreshChatDeepLink('hermes://chat')).toBe(false);
    expect(isStartFreshChatDeepLink('hermes://chat?session=sess-1')).toBe(false);
    expect(isStartFreshChatDeepLink('hermes://setup?demo=1')).toBe(false);
    expect(buildStartFreshChatDeepLink()).toBe('hermes://chat?fresh=1');
  });
});
