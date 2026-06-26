import { isChatAtTop, isChatNearBottom, isInvertedChatNearLatest } from '../utils/chatScrollSync';

describe('chatScrollSync', () => {
  it('detects near-bottom when within threshold', () => {
    expect(isChatNearBottom(400, 580, 1000, 120)).toBe(true);
    expect(isChatNearBottom(400, 200, 1000, 120)).toBe(false);
  });

  it('treats short transcripts as near-bottom', () => {
    expect(isChatNearBottom(400, 0, 200)).toBe(true);
  });

  it('detects scroll-at-top for pull-to-refresh', () => {
    expect(isChatAtTop(0)).toBe(true);
    expect(isChatAtTop(40)).toBe(false);
  });

  it('detects inverted list near latest messages', () => {
    expect(isInvertedChatNearLatest(0)).toBe(true);
    expect(isInvertedChatNearLatest(200)).toBe(false);
  });
});
