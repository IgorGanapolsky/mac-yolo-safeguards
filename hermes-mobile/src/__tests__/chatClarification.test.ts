import {
  listClarificationPrompts,
  parseClarificationFromContent,
  stripClarificationMarkup,
} from '../utils/chatClarification';

const OAUTH_PARTIAL =
  '<clarification>{"question":"The current setup requires manual intervention to complete X OAuth2 authentication. To proceed autonomously, I need to either: 1) Use a pre-authorized token (not recommended due to security), 2) Simulate the auth flow (not advisable as it may violate terms), or 3) Continue requiring manual auth completion. Which path should I';

const OAUTH_COMPLETE =
  '<clarification>{"question":"The current setup requires manual intervention to complete X OAuth2 authentication. To proceed autonomously, I need to either: 1) Use a pre-authorized token (not recommended due to security), 2) Simulate the auth flow (not advisable as it may violate terms), or 3) Continue requiring manual auth completion. Which path should I take?","options":["Use pre-authorized token","Simulate auth flow","Continue manual auth"]}</clarification>';

describe('chatClarification', () => {
  it('parses streaming-truncated clarification question from screenshot case', () => {
    const parsed = parseClarificationFromContent(OAUTH_PARTIAL);
    expect(parsed).not.toBeNull();
    expect(parsed?.partial).toBe(true);
    expect(parsed?.question).toContain('OAuth2 authentication');
    expect(parsed?.options.length).toBeGreaterThanOrEqual(2);
  });

  it('parses complete clarification with explicit options array', () => {
    const parsed = parseClarificationFromContent(OAUTH_COMPLETE);
    expect(parsed).toEqual({
      question:
        'The current setup requires manual intervention to complete X OAuth2 authentication. To proceed autonomously, I need to either: 1) Use a pre-authorized token (not recommended due to security), 2) Simulate the auth flow (not advisable as it may violate terms), or 3) Continue requiring manual auth completion. Which path should I take?',
      options: [
        { id: '1', label: 'Use pre-authorized token' },
        { id: '2', label: 'Simulate auth flow' },
        { id: '3', label: 'Continue manual auth' },
      ],
      partial: false,
    });
  });

  it('parses ask_user alias tag', () => {
    const parsed = parseClarificationFromContent(
      '<ask_user>{"question":"Pick a lane","choices":["A","B"]}</ask_user>',
    );
    expect(parsed?.question).toBe('Pick a lane');
    expect(parsed?.options).toEqual([
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
    ]);
  });

  it('strips clarification markup instead of showing raw XML JSON', () => {
    expect(stripClarificationMarkup(OAUTH_PARTIAL)).toBe('');
    expect(stripClarificationMarkup(OAUTH_COMPLETE)).toBe('');
    expect(stripClarificationMarkup('Before\n' + OAUTH_COMPLETE + '\nAfter')).toBe('Before\n\nAfter');
  });

  it('lists unresolved clarification prompts until user replies', () => {
    const messages = [
      { role: 'assistant', content: OAUTH_COMPLETE },
      { role: 'user', content: 'hello' },
    ];
    expect(listClarificationPrompts(messages).size).toBe(1);

    const resolved = [
      { role: 'assistant', content: OAUTH_COMPLETE },
      { role: 'user', content: 'Simulate auth flow' },
    ];
    expect(listClarificationPrompts(resolved).size).toBe(0);
  });
});
