import {
  AGENT_SELF_CHECK_CONTINUE_TEXT,
  AGENT_SELF_CHECK_AUTO_CONTINUE_MAX,
  isAgentErrorStallAssistantMessage,
  resolveAgentSelfCheckContinueText,
  SAFETY_TIMEOUT_AUTO_CONTINUE_TEXT,
  shouldAutoContinueAfterAgentStall,
} from '../utils/agentSelfCheckRecovery';

describe('agentSelfCheckRecovery (Opus 5 self-check steal)', () => {
  const safetyRaw =
    'Safety timeout interrupted further progress. Resume with `hermes continue` to automate signup.';
  const toolFail =
    'I ran into an error executing the last tool call and could not complete the request.';

  it('detects safety-timeout and tool-error stalls', () => {
    expect(isAgentErrorStallAssistantMessage(safetyRaw)).toBe(true);
    expect(isAgentErrorStallAssistantMessage(toolFail)).toBe(true);
    expect(isAgentErrorStallAssistantMessage('Here is the finished report with three sections.')).toBe(
      false,
    );
  });

  it('picks short continue for safety timeout, self-check for generic stalls', () => {
    expect(resolveAgentSelfCheckContinueText(safetyRaw)).toBe(SAFETY_TIMEOUT_AUTO_CONTINUE_TEXT);
    expect(resolveAgentSelfCheckContinueText(toolFail)).toBe(AGENT_SELF_CHECK_CONTINUE_TEXT);
  });

  it('auto-continues when Mac HTTP is healthy and budget remains', () => {
    expect(
      shouldAutoContinueAfterAgentStall({
        assistantText: toolFail,
        macHttpOk: true,
        isDemo: false,
        isSending: false,
        recoveriesUsed: 0,
      }),
    ).toBe(true);
    expect(
      shouldAutoContinueAfterAgentStall({
        assistantText: toolFail,
        macHttpOk: true,
        isDemo: false,
        isSending: false,
        recoveriesUsed: AGENT_SELF_CHECK_AUTO_CONTINUE_MAX,
      }),
    ).toBe(false);
    expect(
      shouldAutoContinueAfterAgentStall({
        assistantText: toolFail,
        macHttpOk: false,
        isDemo: false,
        isSending: false,
        recoveriesUsed: 0,
      }),
    ).toBe(false);
  });
});
