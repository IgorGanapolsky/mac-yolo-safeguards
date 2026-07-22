import {
  nextOutboundEpoch,
  planProfileSwitchChatReset,
  shouldAcceptOutboundMutation,
  shouldResetChatOnProfileSwitch,
} from '../utils/profileSwitchChatReset';
import { shouldPreserveTranscriptOnSessionChange } from '../utils/disconnectMessagePreserve';

describe('profileSwitchChatReset', () => {
  it('requires a synchronous UI clear when switching to a different Mac', () => {
    expect(shouldResetChatOnProfileSwitch('mac_book', 'mac_mini')).toBe(true);
    const plan = planProfileSwitchChatReset({
      fromProfileId: 'mac_book',
      toProfileId: 'mac_mini',
    });
    expect(plan).toEqual({
      clearUiBeforeAwait: true,
      bumpOutboundEpoch: true,
      intentionalProfileSwitch: true,
    });
  });

  it('does not reset when tapping the already-active profile', () => {
    expect(shouldResetChatOnProfileSwitch('mac_mini', 'mac_mini')).toBe(false);
    expect(
      planProfileSwitchChatReset({
        fromProfileId: 'mac_mini',
        toProfileId: 'mac_mini',
      }),
    ).toBeNull();
  });

  it('drops stale outbound mutations after the switch epoch bumps', () => {
    const sendEpoch = 3;
    const afterSwitch = nextOutboundEpoch(sendEpoch);
    expect(
      shouldAcceptOutboundMutation({
        mutationEpoch: sendEpoch,
        activeEpoch: afterSwitch,
      }),
    ).toBe(false);
    expect(
      shouldAcceptOutboundMutation({
        mutationEpoch: afterSwitch,
        activeEpoch: afterSwitch,
      }),
    ).toBe(true);
  });

  it('never preserves machine-A optimistic bubbles across an intentional profile switch', () => {
    expect(
      shouldPreserveTranscriptOnSessionChange({
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'make money today',
            outboundStatus: 'pending',
          },
        ],
        pendingOutboundSends: 1,
        isSending: true,
        hasActiveRun: true,
        intentionalProfileSwitch: true,
      }),
    ).toBe(false);
  });

  it('still preserves optimistic bubbles on false disconnect when not switching Macs', () => {
    expect(
      shouldPreserveTranscriptOnSessionChange({
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'make money today',
            outboundStatus: 'pending',
          },
        ],
        pendingOutboundSends: 1,
        isSending: true,
        hasActiveRun: false,
        intentionalProfileSwitch: false,
      }),
    ).toBe(true);
  });
});
