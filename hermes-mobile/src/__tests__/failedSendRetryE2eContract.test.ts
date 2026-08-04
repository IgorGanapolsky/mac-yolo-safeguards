import { readFileSync } from 'fs';
import path from 'path';

const mobileRoot = path.resolve(__dirname, '../..');

describe('failed attachment retry E2E contract', () => {
  const flow = readFileSync(
    path.join(mobileRoot, '.maestro/regression-chat-failed-attachment-retry.yaml'),
    'utf8',
  );
  const shipGuard = readFileSync(path.join(mobileRoot, '.maestro/ship-guard.yaml'), 'utf8');
  const chatScreen = readFileSync(path.join(mobileRoot, 'src/screens/ChatScreen.tsx'), 'utf8');

  it('is mandatory in the device ship guard and drives the empty-composer send button', () => {
    expect(shipGuard).toContain('runFlow: regression-chat-failed-attachment-retry.yaml');
    expect(flow).toContain('hermes://chat?e2eFailedRetry=attachment');
    expect(flow).toContain('id: "chat-send-button"');
    expect(flow).toContain('text: "accepted_1"');
  });

  it('asserts attachment preservation and loud failure states', () => {
    expect(flow).toContain('id: "chat-message-body"');
    expect(flow).toContain('text: "(?s)make money today.*retry-proof\\\\.png"');
    expect(flow).toContain('assertNotVisible: "reattach_required"');
    expect(flow).toContain('assertNotVisible: "prepare_failed"');
  });

  it('keeps the deterministic fixture gated to E2E automation plus demo mode', () => {
    expect(chatScreen).toContain("process.env.EXPO_PUBLIC_E2E_AUTOMATION === '1'");
    expect(chatScreen).toContain('!e2eAutomation || !isDemo || !isDemoModeAllowed()');
    expect(chatScreen).toContain('testID="chat-failed-retry-e2e-status"');
  });
});
