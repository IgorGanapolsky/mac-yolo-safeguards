import {
  humanizeSafetyTimeoutMessage,
  isSafetyTimeoutAssistantMessage,
  SAFETY_TIMEOUT_AUTO_CONTINUE_TEXT,
  SAFETY_TIMEOUT_HUMAN_MESSAGE,
  shouldAutoContinueAfterSafetyTimeout,
} from '../utils/safetyTimeoutRecovery';

describe('safetyTimeoutRecovery', () => {
  const raw =
    'Safety timeout interrupted further progress. Resume with `hermes continue` to automate signup.';

  it('detects safety-timeout assistant copy', () => {
    expect(isSafetyTimeoutAssistantMessage(raw)).toBe(true);
    expect(humanizeSafetyTimeoutMessage(raw)).toBe(SAFETY_TIMEOUT_HUMAN_MESSAGE);
  });

  it('auto-continues when Mac HTTP is healthy', () => {
    expect(
      shouldAutoContinueAfterSafetyTimeout({
        assistantText: raw,
        macHttpOk: true,
        isDemo: false,
        isSending: false,
        recoveriesUsed: 0,
      }),
    ).toBe(true);
    expect(
      shouldAutoContinueAfterSafetyTimeout({
        assistantText: raw,
        macHttpOk: true,
        isDemo: false,
        isSending: false,
        recoveriesUsed: 2,
      }),
    ).toBe(false);
  });

  it('uses continue as the auto-resume payload', () => {
    expect(SAFETY_TIMEOUT_AUTO_CONTINUE_TEXT).toBe('continue');
  });
});
