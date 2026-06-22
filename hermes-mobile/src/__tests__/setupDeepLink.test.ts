import { buildSetupDeepLink, parseSetupDeepLink } from '../utils/setupDeepLink';

describe('setupDeepLink', () => {
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

  it('returns null for non-setup links', () => {
    expect(parseSetupDeepLink('hermes://leash/approve')).toBeNull();
  });
});
