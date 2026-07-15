import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('release safety net (T-114)', () => {
  it('mobile-e2e workflow runs on pull_request, push, and merge_group with SHA-pinned actions', () => {
    const workflow = read('.github/workflows/mobile-e2e.yml');
    expect(workflow).toMatch(/^\s*pull_request:/m);
    expect(workflow).toMatch(/^\s*push:/m);
    expect(workflow).toMatch(/^\s*merge_group:/m);
    expect(workflow).toContain('actions/setup-java@c1e323688fd81a25caa38c78aa6df2d33d3e20d9');
    expect(workflow).toContain(
      'reactivecircus/android-emulator-runner@a421e43855164a8197daf9d8d40fe71c6996bb0d',
    );
    expect(workflow).not.toMatch(/android-emulator-runner@v2\s*$/m);
    expect(workflow).not.toMatch(/setup-java@v4\s*#/);
    expect(workflow).toContain('ship-guard.yaml');
    expect(workflow).toContain('stranger-cold-start.yaml');
    expect(workflow).toContain('Maestro stranger cold-start (Android emulator)');
    expect(workflow).toContain('STRANGER_COLD_START_ASSEMBLE');
    expect(workflow).toContain('e2e:validate');
    expect(workflow).toContain('test:release-safety');
  });

  it('pre-OTA scripts refuse structurally invalid stranger cold-start proof', () => {
    const script = read('hermes-mobile/scripts/require-stranger-cold-start-proof.cjs');
    const pkg = read('hermes-mobile/package.json');
    const ota = read('.github/workflows/mobile-ota.yml');
    expect(script).toContain('HERMES_OTA_REQUIRE_STRANGER_PROOF');
    expect(script).toContain('STRANGER_COLD_START_ASSEMBLE');
    expect(script).toContain('clearState');
    expect(pkg).toContain('require-stranger-cold-start-proof.cjs --hard');
    expect(ota).toContain('require-stranger-cold-start-proof.cjs --hard');
    expect(ota).toContain("HERMES_OTA_REQUIRE_STRANGER_PROOF: '1'");
  });

  it('install-phone-release refuses when unit tests fail and warns on non-pass E2E', () => {
    const script = read('hermes-mobile/scripts/install-phone-release.sh');
    expect(script).toContain('gate_install_proofs');
    expect(script).toContain('HERMES_INSTALL_SKIP_TESTS');
    expect(script).toContain('HERMES_INSTALL_ALLOW_BAD_E2E');
    expect(script).toContain('HERMES_INSTALL_REQUIRE_E2E');
    expect(script).toContain('docs/proofs/continuous/latest.json');
    expect(script).toContain('unit tests failed — refusing phone install');
    expect(script).toContain('test:release-safety');
  });

  it('continuous E2E queues on elevated load instead of silently skipping at max 6', () => {
    const runner = read('hermes-mobile/scripts/run-continuous-e2e.sh');
    expect(runner).toContain('LOAD_WAIT_SEC');
    expect(runner).toContain('queueing up to');
    expect(runner).toContain('HERMES_E2E_LOAD_WAIT_SEC');
    expect(runner).toMatch(/MAX_LOAD="\$CPU_COUNT"|MAX_LOAD=\$CPU_COUNT/);
    expect(runner).not.toMatch(
      /skipped continuous E2E: load \$\{current_load\} exceeds max \$\{MAX_LOAD\}; set HERMES_E2E_FORCE=1 to override/,
    );
    const e2e = read('hermes-mobile/scripts/run-e2e.sh');
    expect(e2e).toContain('CPU_COUNT');
    expect(e2e).toMatch(/MAX_LOAD="\$CPU_COUNT"|MAX_LOAD=\$CPU_COUNT/);
  });

  it('chat-send-persistence documents IME harness bug and asserts user bubble testID', () => {
    const flow = read('hermes-mobile/.maestro/chat-send-persistence.yaml');
    expect(flow).toContain('IME');
    expect(flow).toContain('chat-message-user');
    expect(flow).toContain('make money today');
    expect(flow).toContain('chat-e2e-bootstrap.yaml');
  });

  it('regression Maestro flows cover glanceable tab, send visibility, leash refresh, header status', () => {
    const required = [
      'hermes-mobile/.maestro/regression-glanceable-tab.yaml',
      'hermes-mobile/.maestro/regression-chat-send-visible.yaml',
      'hermes-mobile/.maestro/regression-leash-refresh.yaml',
      'hermes-mobile/.maestro/regression-chat-header-model.yaml',
    ];
    for (const relativePath of required) {
      expect(fs.existsSync(path.join(root, relativePath))).toBe(true);
      const flow = read(relativePath);
      expect(flow).toContain('appId: com.iganapolsky.hermesmobile');
      expect(flow).toMatch(/^---/m);
    }
    const glance = read('hermes-mobile/.maestro/regression-glanceable-tab.yaml');
    expect(glance).toContain('glance-mode-switch');
    expect(glance).toContain('tab-hermes');
    expect(glance).toContain('THUMBGATE_LEASH');

    const send = read('hermes-mobile/.maestro/regression-chat-send-visible.yaml');
    expect(send).toContain('chat-message-user');
    expect(send).toContain('make money today');

    const refresh = read('hermes-mobile/.maestro/regression-leash-refresh.yaml');
    expect(refresh).toContain('leash-refresh-status');
    expect(refresh).toContain('Tap to refresh connection');
    expect(refresh).toContain('Refreshing connection…');

    const header = read('hermes-mobile/.maestro/regression-chat-header-model.yaml');
    expect(header).toContain('chat-header-hermes-status');
  });

  it('tier-0 validator requires regression flows and chat-send-persistence', () => {
    const validator = read('hermes-mobile/scripts/validate-maestro-flows.js');
    expect(validator).toContain("'regression-glanceable-tab'");
    expect(validator).toContain("'regression-chat-send-visible'");
    expect(validator).toContain("'regression-leash-refresh'");
    expect(validator).toContain("'regression-chat-header-model'");
    expect(validator).toContain("'chat-send-persistence'");
    expect(validator).toContain("'stranger-cold-start'");
    expect(validator).toContain("'wrong-key-repair'");
  });

  it('continuous E2E records fail when android-only and no USB phone', () => {
    const runner = read('hermes-mobile/scripts/run-continuous-e2e.sh');
    expect(runner).toMatch(/e2e_status="fail"/);
    expect(runner).toContain('no USB Android device connected');
    expect(runner).not.toContain('android-only continuous E2E skipped');
  });

  it('unit gates already cover notifications, auto-scroll, model header, and leash spinner', () => {
    const notifications = read('hermes-mobile/src/__tests__/hermesNotifications.test.ts');
    expect(notifications).toContain('does not schedule run progress notification while app is active');

    const chat = read('hermes-mobile/src/__tests__/ChatScreen.test.tsx');
    expect(chat).toContain('show this prompt now');
    expect(chat).toContain('scrollToEnd');

    const header = read('hermes-mobile/src/__tests__/ChatScreenHeader.test.tsx');
    expect(header).toContain('Hermes (active) · google/gemini-2.5-flash');
    expect(header).not.toMatch(/toBe\('Hermes \(active\)'\);/);

    const leash = read('hermes-mobile/src/__tests__/ApprovalsScreen.test.tsx');
    expect(leash).toContain('clears the pull-to-refresh spinner after a successful refresh');
  });

  it('documents bug→CI catch map and remaining branch-protection work', () => {
    const docs = read('hermes-mobile/docs/RELEASE-SAFETY-NET.md');
    expect(docs).toContain('Bug');
    expect(docs).toContain('would CI catch');
    expect(docs).toContain('branch-protection');
    expect(docs).toContain('Maestro ship-guard (Android emulator)');
    expect(docs).toContain('chat-send-persistence');
    expect(docs).toContain('IME');
    expect(docs).toContain('Wrong key');
    expect(docs).toContain('auth probe');
  });

  it('pair script resolves per-machine API keys for Mac mini Tailscale', () => {
    const pairLib = read('tools/hermes-mobile-pair-lib.js');
    expect(pairLib).toContain('resolveApiKeyForGatewayUrl');
    expect(pairLib).toContain('assertHostKeyConsistency');
    expect(pairLib).toContain('MINI_KEY_UNAVAILABLE');
    expect(pairLib).toContain('strictMini');
    expect(pairLib).toContain('100.94.135.78');
    expect(pairLib).toContain('hermes-mini');
    expect(pairLib).toContain('probeGatewayAuthSync');
    const pairTest = read('tests/test-hermes-mobile-pair.sh');
    expect(pairTest).toContain('mini-key-from-ssh');
    expect(pairTest).toContain('laptop-key-from-env');
    expect(pairTest).toContain('local_or_usb_url_bound_to_mini_key');
    expect(pairTest).toContain('Refuse ready claim');
  });

  it('wrong-key recovery prefers Find computers over Settings-only dead end', () => {
    const recovery = read('hermes-mobile/src/utils/wrongKeyRecovery.ts');
    expect(recovery).toContain('Find computers');
    expect(recovery).toContain('clearStaleProfileKey');
    const banner = read('hermes-mobile/src/services/gatewayClient.ts');
    expect(banner).toContain('Find computers');
    expect(banner.toLowerCase()).not.toContain('settings → your active machines');
  });

  it('fetchGatewayHealth runs authenticated sessions probe before Connected', () => {
    const client = read('hermes-mobile/src/services/gatewayClient.ts');
    expect(client).toContain('probeGatewayAuth');
    expect(client).toContain('/api/sessions?limit=1');
    expect(client).toContain('authMismatch');
    const connection = read('hermes-mobile/src/utils/gatewayConnection.ts');
    expect(connection).toContain('GATEWAY_AUTH_REPAIR_HEADER');
    expect(connection).toContain('authMismatch');
  });

  it('SHIP BLOCK: Connected ⊕ Wrong key is impossible in connection state machine', () => {
    const connection = read('hermes-mobile/src/utils/gatewayConnection.ts');
    expect(connection).toContain('wrongKeyBannerActive');
    expect(connection).toContain('isConnectedWrongKeyContradiction');
    expect(connection).toContain('RELEASE BLOCK');
    const chat = read('hermes-mobile/src/screens/ChatScreen.tsx');
    expect(chat).toContain('effectiveAuthMismatch');
    expect(chat).toContain('wrongKeyBannerActive');
    // Banner/health auth failure must force macHttpReachable false (no chatStalled bypass)
    expect(chat).toMatch(/effectiveAuthMismatch \? false : effectiveMacHttpOk/);
    const profiles = read('hermes-mobile/src/services/gatewayProfiles.ts');
    expect(profiles).toContain('Prefer non-loopback');
    const gatewayCtx = read('hermes-mobile/src/context/GatewayContext.tsx');
    expect(gatewayCtx).toContain('false-green Connected + Wrong key');
    const readiness = read('hermes-mobile/docs/REAL-USER-READINESS.md');
    expect(readiness).toContain('Connected ⊕ Wrong key');
    expect(readiness).toContain('SHIP BLOCK');
    expect(readiness).toContain('state-machine failure');
    const safetyNet = read('hermes-mobile/docs/RELEASE-SAFETY-NET.md');
    expect(safetyNet).toContain('Connected ⊕ Wrong key');
    expect(safetyNet).toContain('SHIP BLOCK');
    const client = read('hermes-mobile/src/services/gatewayClient.ts');
    expect(client).toContain('Find computers');
    expect(client).not.toMatch(/Settings → Your active machines/);
  });
});
