import { listGateRules } from '../services/gateRulesClient';

describe('gateRulesClient', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('returns demo rules in demo mode', async () => {
    const result = await listGateRules('', null, { demoMode: true });
    expect(result.rules).toHaveLength(2);
    expect(result.unavailableReason).toBeUndefined();
  });

  it('returns honest empty state when gateway has no /v1/gates', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '',
    });
    const result = await listGateRules('http://127.0.0.1:8642', 'sk-test');
    expect(result.rules).toEqual([]);
    expect(result.unavailableReason).toContain('no GET /v1/gates');
  });

  it('parses successful gateway payloads', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        rules: [{ id: 'live-1', pattern: 'curl', decision: 'block' }],
      }),
    });
    const result = await listGateRules('http://127.0.0.1:8642', 'sk-test');
    expect(result.rules).toEqual([
      expect.objectContaining({ id: 'live-1', pattern: 'curl', decision: 'block' }),
    ]);
  });
});
