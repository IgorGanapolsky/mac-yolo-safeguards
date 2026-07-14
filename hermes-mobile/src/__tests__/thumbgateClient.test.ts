import { captureThumbgateFeedback, ThumbgateApiError } from '../services/thumbgateClient';
import { secureCredentials } from '../services/secureCredentials';
import { HERMES_MOBILE_CLOUD_URL, THUMBGATE_API_URL } from '../constants/appIdentity';

jest.mock('../services/secureCredentials', () => ({
  secureCredentials: { loadMobileToken: jest.fn().mockResolvedValue(null) },
}));

describe('captureThumbgateFeedback', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    (secureCredentials.loadMobileToken as jest.Mock).mockResolvedValue(null);
  });

  it('posts capture payload and returns accepted', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ accepted: true, feedbackId: 'fb_1' }),
    });

    const result = await captureThumbgateFeedback(
      'https://thumbgate.example.com',
      {
        signal: 'down',
        context: 'Leash rejected rm',
        whatWentWrong: 'too risky',
      },
      'sk-thumb',
    );

    expect(result.accepted).toBe(true);
    expect(result.feedbackId).toBe('fb_1');
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://thumbgate.example.com/v1/feedback/capture');
    expect(options.headers.Authorization).toBe('Bearer sk-thumb');
  });

  it('throws ThumbgateApiError on HTTP failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ detail: 'unauthorized' }),
    });

    await expect(
      captureThumbgateFeedback('https://thumbgate.example.com', {
        signal: 'up',
        context: 'ok',
      }),
    ).rejects.toBeInstanceOf(ThumbgateApiError);
  });

  it('normalizes trailing slash on base URL', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ accepted: true }),
    });

    await captureThumbgateFeedback('https://thumbgate.example.com/', {
      signal: 'down',
      context: 'test',
    });

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://thumbgate.example.com/v1/feedback/capture');
  });

  it('redacts secrets before capture', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ accepted: true }),
    });
    await captureThumbgateFeedback(
      'https://thumbgate.example.com',
      { signal: 'down', context: 'token=very-sensitive-value-12345' },
      'server-key',
    );
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.body).toContain('[REDACTED]');
    expect(options.body).not.toContain('very-sensitive-value');
  });

  it('uses the paired relay token when a production phone has no ThumbGate API key', async () => {
    (secureCredentials.loadMobileToken as jest.Mock).mockResolvedValue('paired-mobile-token');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ accepted: true }),
    });
    await captureThumbgateFeedback(THUMBGATE_API_URL, {
      signal: 'up',
      context: 'Approved verified call',
    });
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${HERMES_MOBILE_CLOUD_URL}/v1/thumbgate/capture`);
    expect(options.headers.Authorization).toBe('Mobile paired-mobile-token');
  });
});
