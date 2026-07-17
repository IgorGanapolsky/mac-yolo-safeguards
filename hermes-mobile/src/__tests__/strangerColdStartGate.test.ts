import fs from 'fs';
import path from 'path';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';

const root = path.resolve(__dirname, '../../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('stranger cold-start merge gate (T-342)', () => {
  it('empty default settings never embed USB 127.0.0.1 (storage baseline)', () => {
    expect(DEFAULT_GATEWAY_SETTINGS.gatewayUrl).toBe('');
    expect(DEFAULT_GATEWAY_SETTINGS.gatewayUrl).not.toContain('127.0.0.1');
    expect(DEFAULT_GATEWAY_SETTINGS.demoMode).toBe(false);
    expect(DEFAULT_GATEWAY_SETTINGS.connectMacGateDismissed).toBeFalsy();
  });

  it('ConnectMacGate is hidden only by E2E automation / store-review / demo — not by empty URL', () => {
    const gate = read('hermes-mobile/src/components/ConnectMacGate.tsx');
    expect(gate).toContain('shouldShowConnectMacGate');
    expect(gate).toContain('isE2eAutomationBuild()');
    expect(gate).toContain('isStoreReviewDemoBuild()');
    expect(gate).toContain('demoMode: settings.demoMode');
    expect(gate).toContain('testID="connect-mac-gate"');
    const policy = read('hermes-mobile/src/utils/freshUserOnboarding.ts');
    expect(policy).toContain('export function shouldShowConnectMacGate');
    expect(policy).toMatch(/if \(!isFreshUserUnpaired\(input\.profiles\)\)/);
  });

  it('stranger Maestro flow uses clearState, no demo=1, asserts gate and no Reconnecting', () => {
    const flow = read('hermes-mobile/.maestro/stranger-cold-start.yaml');
    expect(flow).toMatch(/clearState:\s*true/);
    expect(flow).not.toMatch(/openLink:.*demo=1|hermes:\/\/setup\?demo=1/);
    expect(flow).toContain('connect-mac-gate');
    expect(flow).toContain('connect-mac-onboarding-card');
    expect(flow).toMatch(/assertNotVisible:\s*"Reconnecting/);
  });

  it('mobile-e2e stranger job builds without E2E hide-gate and runs stranger-cold-start', () => {
    const workflow = read('.github/workflows/mobile-e2e.yml');
    expect(workflow).toContain('Maestro stranger cold-start (Android emulator)');
    expect(workflow).toContain('STRANGER_COLD_START_ASSEMBLE');
    expect(workflow).toContain('stranger-cold-start.yaml');
    const assembleIdx = workflow.indexOf('STRANGER_COLD_START_ASSEMBLE');
    const assembleSlice = workflow.slice(assembleIdx, assembleIdx + 800);
    expect(assembleSlice).toMatch(/EXPO_PUBLIC_E2E_AUTOMATION:\s*"0"/);
    expect(assembleSlice).not.toMatch(/EXPO_PUBLIC_E2E_AUTOMATION:\s*"1"/);
  });

  it('documents that USB empty-storage seed fix is owned by PR #419 (no GatewayContext edit here)', () => {
    const docs = read('hermes-mobile/docs/RELEASE-SAFETY-NET.md');
    expect(docs).toContain('Maestro stranger cold-start');
    expect(docs).toMatch(/ship-guard.*insufficient/i);
    // Crisis agent / #419 owns GatewayContext USB seed — this suite only locks the CI gate.
    expect(fs.existsSync(path.join(root, 'hermes-mobile/scripts/require-stranger-cold-start-proof.cjs'))).toBe(
      true,
    );
  });
});
