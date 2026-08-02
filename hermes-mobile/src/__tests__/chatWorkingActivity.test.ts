import {
  isActiveRunProgressPhase,
  isChatWorkingActivity,
} from '../utils/chatWorkingActivity';

describe('chatWorkingActivity', () => {
  it('is true while sending or awaiting gateway reply', () => {
    expect(isChatWorkingActivity({ isSending: true })).toBe(true);
    expect(isChatWorkingActivity({ awaitingGatewayReply: true })).toBe(true);
    expect(isChatWorkingActivity({ emptyStreamAutoChecking: true })).toBe(true);
  });

  it('is true for active run phases', () => {
    expect(isActiveRunProgressPhase('running')).toBe(true);
    expect(isActiveRunProgressPhase('streaming')).toBe(true);
    expect(isActiveRunProgressPhase('tools')).toBe(true);
    expect(isChatWorkingActivity({ runProgress: { phase: 'running' } })).toBe(true);
  });

  it('is false when idle / completed / failed', () => {
    expect(isChatWorkingActivity({})).toBe(false);
    expect(isChatWorkingActivity({ runProgress: { phase: 'completed' } })).toBe(false);
    expect(isChatWorkingActivity({ runProgress: { phase: 'failed' } })).toBe(false);
    expect(isActiveRunProgressPhase('failed')).toBe(false);
    expect(isActiveRunProgressPhase('completed')).toBe(false);
  });
});
