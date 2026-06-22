import { coerceMessageId, idHasPrefix } from '../utils/messageIds';

describe('messageIds', () => {
  it('coerces numeric gateway ids to strings', () => {
    expect(coerceMessageId(42)).toBe('42');
    expect(coerceMessageId('msg-1')).toBe('msg-1');
    expect(coerceMessageId(undefined, 0)).toBe('0');
  });

  it('idHasPrefix never throws on non-string ids', () => {
    expect(idHasPrefix(42, 'asst-')).toBe(false);
    expect(idHasPrefix('asst-99', 'asst-')).toBe(true);
    expect(idHasPrefix(undefined, 'asst-')).toBe(false);
  });
});
