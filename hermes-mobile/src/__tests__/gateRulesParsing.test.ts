import { parseGateRulesPayload } from '../utils/gateRulesParsing';

describe('parseGateRulesPayload', () => {
  it('parses bare arrays', () => {
    expect(
      parseGateRulesPayload([
        { id: 'r1', pattern: 'npm test', decision: 'allow', tool_name: 'Bash' },
      ]),
    ).toEqual([
      {
        id: 'r1',
        pattern: 'npm test',
        toolName: 'Bash',
        decision: 'allow',
        scope: undefined,
        createdAt: undefined,
        source: undefined,
      },
    ]);
  });

  it('parses { rules: [] } envelopes', () => {
    expect(parseGateRulesPayload({ rules: [{ id: 'x', command: 'rm -rf', action: 'block' }] })).toEqual([
      {
        id: 'x',
        pattern: 'rm -rf',
        toolName: undefined,
        decision: 'block',
        scope: undefined,
        createdAt: undefined,
        source: undefined,
      },
    ]);
  });

  it('maps approve to allow', () => {
    expect(parseGateRulesPayload([{ id: 'a', pattern: 'git push', verdict: 'approve' }])[0].decision).toBe(
      'allow',
    );
  });

  it('returns empty list for unknown payloads', () => {
    expect(parseGateRulesPayload({})).toEqual([]);
    expect(parseGateRulesPayload(null)).toEqual([]);
  });
});
