import {
  PROVIDER_ERROR_EXPAND_LABEL,
  humanizeProviderError,
  humanizeProviderErrorText,
  isProviderErrorPayload,
} from '../utils/providerErrorCopy';
import { humanizeChatError } from '../utils/chatErrors';
import {
  formatExpandedMessageContent,
  formatMessageForDisplay,
  prepareMessageForChatDisplay,
  prepareMessagesForDisplay,
} from '../utils/chatMessageDisplay';
import { isFalseUnpairedStatusCopy } from '../utils/connectionStatusContract';
import { fetchTelegramInboxMessages } from '../services/telegramInbox';
import * as hermesChatClient from '../services/hermesChatClient';

jest.mock('../services/hermesChatClient');

/**
 * Verbatim text a real user saw in a chat bubble on an Android phone (2026-07-30).
 * The Mac's model died mid-generation and the harness dumped a Python-repr payload.
 */
const SCREENSHOT_BUBBLE =
  "I reached the turn time limit and couldn't generate a final report Error: Error code: 500 - " +
  "{'error': {'message': 'an error was encountered while running the model: unexpected EOF', " +
  "'type': 'api_error', 'param': None, 'code': None}}";

const ALL_KIND_SAMPLES = [
  SCREENSHOT_BUBBLE,
  "Error code: 500 - {'error': {'message': 'unexpected EOF', 'type': 'api_error'}}",
  'Error code: 429 - {"error": {"message": "rate limit exceeded", "type": "api_error"}}',
  'Error code: 400 - {"error": {"message": "bad request", "type": "invalid_request_error"}}',
  'API call failed after 3 retries.',
  'I reached the turn time limit and could not produce a final report.',
];

describe('providerErrorCopy — detection', () => {
  it('detects the exact payload the user saw on his phone', () => {
    expect(isProviderErrorPayload(SCREENSHOT_BUBBLE)).toBe(true);
  });

  it('detects bare provider markers', () => {
    expect(isProviderErrorPayload("{'error': {'type': 'api_error'}}")).toBe(true);
    expect(isProviderErrorPayload('Error code: 503 - upstream unavailable')).toBe(true);
    expect(
      isProviderErrorPayload('an error was encountered while running the model: unexpected EOF'),
    ).toBe(true);
    expect(isProviderErrorPayload('API call failed after 3 retries')).toBe(true);
    expect(isProviderErrorPayload('I reached the turn time limit and stopped.')).toBe(true);
  });

  it('does not fire on ordinary assistant prose', () => {
    expect(isProviderErrorPayload('Done — I pushed the branch and opened PR #42.')).toBe(false);
    expect(isProviderErrorPayload('')).toBe(false);
    expect(isProviderErrorPayload(undefined)).toBe(false);
    expect(
      isProviderErrorPayload('I hit an error in the build script and fixed the import path.'),
    ).toBe(false);
  });

  it('does not hijack session-lifecycle payloads owned by chatErrors', () => {
    expect(isProviderErrorPayload('{"error": {"code": "session_not_found"}}')).toBe(false);
    expect(isProviderErrorPayload('{"error": {"code": "session_in_use"}}')).toBe(false);
    expect(isProviderErrorPayload('{"error": {"code": "invalid_api_key"}}')).toBe(false);
  });

  // PR #1250 review: the length cap alone let short prose be swallowed.
  it('requires payload framing — short prose explaining an error is not replaced', () => {
    expect(
      isProviderErrorPayload('Error code: 500 means the server failed; I fixed the retry.'),
    ).toBe(false);
    expect(
      isProviderErrorPayload('A 500 Error code: usually points at the upstream, not your app.'),
    ).toBe(false);
    expect(
      isProviderErrorPayload('I hit an unexpected EOF parsing the log and fixed the reader.'),
    ).toBe(false);
    expect(
      isProviderErrorPayload('The turn time limit is configurable in the harness settings.'),
    ).toBe(false);
    expect(
      isProviderErrorPayload('Retries are capped at 3; the API call failed after 3 retries.'),
    ).toBe(true);
  });

  it('ignores long prose that merely quotes an error code', () => {
    const essay = `${'Here is a long explanation of HTTP status codes. '.repeat(40)} Error code: 500 means server error.`;
    expect(isProviderErrorPayload(essay)).toBe(false);
  });
});

describe('providerErrorCopy — classification and copy', () => {
  it('headlines the model failure (root cause) for the screenshot payload', () => {
    const humanized = humanizeProviderError(SCREENSHOT_BUBBLE);
    expect(humanized).not.toBeNull();
    expect(humanized?.kind).toBe('model_stopped');
    expect(humanized?.headline).toBe(
      "Your Mac's AI model stopped responding. Tap ↑ to try again.",
    );
  });

  it('preserves the raw payload as technical detail — never discards the diagnostic', () => {
    const humanized = humanizeProviderError(SCREENSHOT_BUBBLE);
    expect(humanized?.detail).toBe(SCREENSHOT_BUBBLE);
    expect(humanized?.detail).toContain('unexpected EOF');
    expect(humanized?.detail).toContain('api_error');
  });

  it('maps a 429 to a usage-limit message, not "stopped responding"', () => {
    const humanized = humanizeProviderError(
      'Error code: 429 - {"error": {"message": "rate limit exceeded", "type": "api_error"}}',
    );
    expect(humanized?.kind).toBe('model_rate_limited');
    expect(humanized?.headline).toBe(
      "Your Mac's AI model hit its usage limit. Wait a moment, then tap ↑ to try again.",
    );
  });

  it('maps a non-429 4xx to a generic model error', () => {
    const humanized = humanizeProviderError(
      'Error code: 400 - {"error": {"message": "bad request", "type": "invalid_request_error"}}',
    );
    expect(humanized?.kind).toBe('model_error');
    expect(humanized?.headline).toBe(
      "Your Mac's AI model couldn't answer this one. Tap ↑ to try again.",
    );
  });

  it('counts the retries the Mac actually burned', () => {
    const humanized = humanizeProviderError('API call failed after 3 retries');
    expect(humanized?.kind).toBe('retries_exhausted');
    expect(humanized?.headline).toBe(
      "Your Mac couldn't complete this after 3 tries. Tap ↑ to try again.",
    );
    expect(humanizeProviderError('API call failed after 1 retry')?.headline).toBe(
      "Your Mac couldn't complete this after 1 try. Tap ↑ to try again.",
    );
  });

  it('maps a bare turn time limit with no provider payload', () => {
    const humanized = humanizeProviderError(
      'I reached the turn time limit and could not produce a final report.',
    );
    expect(humanized?.kind).toBe('turn_time_limit');
    expect(humanized?.headline).toBe(
      'This turn ran past its time limit on your Mac. Tap ↑ to try again, or start a fresh chat.',
    );
  });

  it('returns null for prose so callers can pass it through untouched', () => {
    expect(humanizeProviderError('All done.')).toBeNull();
    expect(humanizeProviderErrorText('All done.')).toBe('All done.');
  });

  it('exposes a technical-detail affordance label', () => {
    expect(PROVIDER_ERROR_EXPAND_LABEL).toBe('Show technical detail');
  });
});

describe('providerErrorCopy — standing product constraints', () => {
  const headlines = ALL_KIND_SAMPLES.map((sample) => humanizeProviderError(sample)?.headline ?? '');

  it('produces a headline for every sampled failure class', () => {
    expect(headlines).toHaveLength(ALL_KIND_SAMPLES.length);
    for (const headline of headlines) {
      expect(headline.length).toBeGreaterThan(0);
    }
  });

  it('never says USB — Tailscale only', () => {
    for (const headline of headlines) {
      expect(headline).not.toMatch(/\busb\b/i);
    }
  });

  it('never writes bare ThumbGate', () => {
    for (const headline of headlines) {
      expect(headline).not.toMatch(/ThumbGate(?!\.app)/);
    }
  });

  it('never says not paired / unpaired / invalid as status copy', () => {
    for (const headline of headlines) {
      expect(isFalseUnpairedStatusCopy(headline)).toBe(false);
    }
  });

  it('never prompts for a purchase or unlock', () => {
    for (const headline of headlines) {
      expect(headline).not.toMatch(/upgrade|unlock|subscribe|purchase|pro plan|\$\d/i);
    }
  });

  it('never leaks provider jargon into the headline', () => {
    for (const headline of headlines) {
      expect(headline).not.toMatch(/api_error|unexpected eof|error code|\{'error'|"error":/i);
      expect(headline).not.toMatch(/\bgateway\b|\bollama\b|\bstack trace\b/i);
    }
  });
});

describe('chat bubble rendering pipeline', () => {
  it('never renders the raw provider payload as the bubble preview', () => {
    const preview = formatMessageForDisplay(SCREENSHOT_BUBBLE);
    expect(preview).not.toContain('unexpected EOF');
    expect(preview).not.toContain('api_error');
    expect(preview).not.toContain('Error code: 500');
    expect(preview).toBe("Your Mac's AI model stopped responding. Tap ↑ to try again.");
  });

  it('keeps the raw payload reachable behind the expand affordance', () => {
    const expanded = formatExpandedMessageContent(SCREENSHOT_BUBBLE);
    expect(expanded).toContain('unexpected EOF');
    expect(expanded).toContain('api_error');
  });

  it('marks the bubble as expandable so the technical detail is one tap away', () => {
    const display = prepareMessageForChatDisplay(SCREENSHOT_BUBBLE);
    expect(display.content).toBe("Your Mac's AI model stopped responding. Tap ↑ to try again.");
    expect(display.truncated).toBe(true);
    expect(display.rawContent).toContain('unexpected EOF');
  });

  it('never rewrites what the user typed, even when it looks like a payload', () => {
    expect(formatMessageForDisplay(SCREENSHOT_BUBBLE, { isUser: true })).toContain(
      'unexpected EOF',
    );
    expect(prepareMessageForChatDisplay(SCREENSHOT_BUBBLE, { isUser: true }).content).toContain(
      'api_error',
    );
  });

  it('leaves normal assistant prose untouched', () => {
    expect(formatMessageForDisplay('Pushed the fix and opened PR #1223.')).toBe(
      'Pushed the fix and opened PR #1223.',
    );
  });

  // The production path: ChatScreen hydrates gateway history through this.
  it('humanizes assistant history from the gateway but not the user turn', () => {
    const [userTurn, assistantTurn] = prepareMessagesForDisplay([
      { id: 'u1', role: 'user', content: `What does this mean? ${SCREENSHOT_BUBBLE}` },
      { id: 'a1', role: 'assistant', content: SCREENSHOT_BUBBLE },
    ] as never);

    expect(userTurn.content).toContain('unexpected EOF');
    expect(assistantTurn.content).toBe(
      "Your Mac's AI model stopped responding. Tap ↑ to try again.",
    );
    expect(assistantTurn.rawContent).toContain('unexpected EOF');
    expect(assistantTurn.truncated).toBe(true);
  });
});

// PR #1250 review: the Telegram inbox prepares content/rawContent/truncated up
// front and ChatMessageBubble trusts those fields, so the role must be applied here.
describe('Telegram inbox display prep', () => {
  it('humanizes the assistant turn and leaves the user turn verbatim', async () => {
    (hermesChatClient.listMessages as jest.Mock).mockResolvedValueOnce([
      {
        role: 'user',
        content: `Why did this happen? ${SCREENSHOT_BUBBLE}`,
        created_at: '2026-07-30T10:00:00Z',
      },
      { role: 'assistant', content: SCREENSHOT_BUBBLE, created_at: '2026-07-30T10:01:00Z' },
    ]);

    const result = await fetchTelegramInboxMessages(
      'http://127.0.0.1:8642',
      [{ id: 'tg-1', source: 'telegram', last_active: 1785400000 }] as never,
      'test-key',
      1,
    );

    const userTurn = result.messages.find((m) => m.role === 'user');
    const assistantTurn = result.messages.find((m) => m.role === 'assistant');
    expect(userTurn?.content).toContain('unexpected EOF');
    expect(assistantTurn?.content).toBe(
      "Your Mac's AI model stopped responding. Tap ↑ to try again.",
    );
    expect(assistantTurn?.rawContent).toContain('unexpected EOF');
  });
});

describe('humanizeChatError — thrown provider payloads', () => {
  it('humanizes a provider payload thrown as an Error', () => {
    const humanized = humanizeChatError(new Error(SCREENSHOT_BUBBLE), 'Something went wrong.');
    expect(humanized.kind).toBe('operational');
    expect(humanized.message).toBe("Your Mac's AI model stopped responding. Tap ↑ to try again.");
  });

  it('humanizes a pure-JSON provider payload thrown as an Error', () => {
    const humanized = humanizeChatError(
      new Error('{"error": {"message": "unexpected EOF", "type": "api_error"}}'),
      'Something went wrong.',
    );
    expect(humanized.message).toBe("Your Mac's AI model stopped responding. Tap ↑ to try again.");
  });

  it('still routes session and auth payloads to their own copy', () => {
    expect(
      humanizeChatError(new Error('{"error": {"code": "session_not_found"}}'), 'fallback').message,
    ).toContain('That chat was removed');
    expect(
      humanizeChatError(new Error('{"error": {"code": "invalid_api_key"}}'), 'fallback').kind,
    ).toBe('auth');
  });
});
