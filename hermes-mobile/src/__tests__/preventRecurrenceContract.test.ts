import fs from 'fs';
import path from 'path';
import {
  isConnectedWrongKeyContradiction,
  isMacGatewayHttpOk,
  resolveChatLinkDisplay,
  resolveEffectiveMacHttpOk,
} from '../utils/gatewayConnection';
import { GATEWAY_AUTH_REPAIR_HEADER } from '../services/gatewayClient';

const root = path.resolve(__dirname, '../../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('prevent recurrence contract (July 2026 CI gates)', () => {
  it('Connected ⊕ Wrong key: authMismatch never yields green Connected', () => {
    const link = resolveChatLinkDisplay({
      connectionState: 'connected',
      macHttpOk: true,
      authMismatch: true,
    });
    expect(link.label).toBe(GATEWAY_AUTH_REPAIR_HEADER);
    expect(link.label).not.toContain('Connected');
    expect(link.chatReachable).toBe(false);
    expect(
      isConnectedWrongKeyContradiction({
        linkLabel: link.label,
        authMismatch: true,
      }),
    ).toBe(false);
  });

  it('Connected ⊕ Wrong key: stale wrong-key banner never yields green Connected', () => {
    const link = resolveChatLinkDisplay({
      connectionState: 'connected',
      macHttpOk: true,
      wrongKeyBannerActive: true,
    });
    expect(link.label).toBe(GATEWAY_AUTH_REPAIR_HEADER);
    expect(link.chatReachable).toBe(false);
    expect(
      isConnectedWrongKeyContradiction({
        linkLabel: 'Connected',
        wrongKeyBannerActive: true,
      }),
    ).toBe(true);
  });

  it('green health with authMismatch is not mac HTTP ok', () => {
    expect(
      isMacGatewayHttpOk({
        level: 'green',
        checkedAt: '2026-07-14T00:00:00Z',
        directGatewayReachable: true,
        authMismatch: true,
      }),
    ).toBe(false);
    expect(
      resolveEffectiveMacHttpOk({
        macHttpOk: true,
        authMismatch: true,
      }),
    ).toBe(false);
  });

  it('wires preventRecurrenceContract into test:release-safety', () => {
    const pkg = JSON.parse(read('hermes-mobile/package.json'));
    expect(pkg.scripts['test:release-safety']).toContain('preventRecurrenceContract.test.ts');
  });

  it('continuous E2E records fail (not skipped) when android-only and no phone', () => {
    const runner = read('hermes-mobile/scripts/run-continuous-e2e.sh');
    expect(runner).toMatch(/e2e_status="fail"/);
    expect(runner).toMatch(/no USB Android device connected/);
    expect(runner).not.toMatch(/android-only continuous E2E skipped/);
  });

  it('tier-0 Maestro validator requires stranger-cold-start and wrong-key-repair', () => {
    const validator = read('hermes-mobile/scripts/validate-maestro-flows.js');
    expect(validator).toContain("'stranger-cold-start'");
    expect(validator).toContain("'wrong-key-repair'");
    for (const flow of ['stranger-cold-start', 'wrong-key-repair']) {
      const yaml = read(`hermes-mobile/.maestro/${flow}.yaml`);
      expect(yaml).toContain('appId: com.iganapolsky.hermesmobile');
      expect(yaml).toMatch(/^---/m);
    }
  });

  it('ChatScreen passes authMismatch and wrongKeyBannerActive into header', () => {
    const chat = read('hermes-mobile/src/screens/ChatScreen.tsx');
    expect(chat).toContain('authMismatch={health?.authMismatch === true}');
    expect(chat).toContain('wrongKeyBannerActive');
    expect(chat).toContain('isAuthRepairMessage');
  });
});
