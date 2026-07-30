/**
 * Backend/provider failures must never be the headline of a chat bubble.
 *
 * A real user saw this verbatim on his phone (2026-07-30), after the Mac's local
 * model died mid-generation:
 *
 *   I reached the turn time limit and couldn't generate a final report Error:
 *   Error code: 500 - {'error': {'message': 'an error was encountered while
 *   running the model: unexpected EOF', 'type': 'api_error', 'param': None,
 *   'code': None}}
 *
 * That is a Python-repr provider payload — unreadable and unactionable. This
 * module maps that class of payload to short, human, actionable copy while
 * PRESERVING the raw diagnostic so the user (or a support session) can still
 * read it behind "Show technical detail". We never silently discard detail; we
 * only stop making it the headline.
 *
 * Copy rules enforced by tests in providerErrorCopy.test.ts:
 *   - never the word "USB" (Tailscale only)
 *   - "ThumbGate.app", never bare "ThumbGate"
 *   - never "not paired" / "unpaired" / "invalid" as status copy
 *   - never an upsell or unlock prompt (the app is paid, all features included)
 */

export type ProviderErrorKind =
  | 'model_stopped'
  | 'model_rate_limited'
  | 'model_error'
  | 'retries_exhausted'
  | 'turn_time_limit';

export type HumanProviderError = {
  kind: ProviderErrorKind;
  /** Short, human headline that replaces the raw payload in the bubble. */
  headline: string;
  /** The original payload, preserved verbatim for the technical-detail view. */
  detail: string;
};

/** Affordance label when the hidden detail is a provider diagnostic, not prose. */
export const PROVIDER_ERROR_EXPAND_LABEL = 'Show technical detail';
/** Default affordance label for ordinary truncated messages. */
export const MESSAGE_EXPAND_LABEL = 'Show more';

/**
 * Beyond this, the text is prose that happens to quote an error — not a payload.
 * Mirrors the cap used by safetyTimeoutRecovery for the same reason.
 */
const MAX_PAYLOAD_CHARS = 1200;

/**
 * Framing matters, not keywords. "Error code: 500 - {…}" is a payload;
 * "Error code: 500 means the server failed, so I fixed the retry" is an answer.
 * Every trigger below is a structural shape or a verbatim failure template, so
 * prose that merely *discusses* an error is never replaced.
 */
// "Error code: 500 - …" — the provider template's code + separator, not a mention.
const ERROR_CODE_TEMPLATE_RE = /\berror\s+code:\s*(\d{3})\s*[-–—]\s/i;
// Structural key/value from a serialized provider error object.
const API_ERROR_TYPE_RE = /['"]type['"]\s*:\s*['"]api_error['"]/i;
// Verbatim upstream template.
const MODEL_RUN_ERROR_RE = /\ban error was encountered while running the model\b/i;
const RETRIES_RE = /\bfailed\s+after\s+(\d+)\s+retr(?:y|ies)\b/i;
// First-person harness template, not any sentence containing the phrase.
const TURN_LIMIT_TEMPLATE_RE =
  /\b(?:reached|hit|exceeded|ran\s+past)\s+the\s+turn\s+time\s+limit\b/i;
// Corroborating only — never a trigger on its own.
const ERROR_DICT_RE = /[{[]\s*['"]error['"]\s*:/;
const UNEXPECTED_EOF_RE = /\bunexpected\s+eof\b/i;

function normalize(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function markers(body: string): {
  code: number | null;
  apiErrorType: boolean;
  modelRunError: boolean;
  /** EOF only counts inside a serialized error object — bare prose does not. */
  unexpectedEof: boolean;
  retries: number | null;
  turnLimit: boolean;
} {
  const codeMatch = ERROR_CODE_TEMPLATE_RE.exec(body);
  const retriesMatch = RETRIES_RE.exec(body);
  return {
    code: codeMatch ? Number(codeMatch[1]) : null,
    apiErrorType: API_ERROR_TYPE_RE.test(body),
    modelRunError: MODEL_RUN_ERROR_RE.test(body),
    unexpectedEof: UNEXPECTED_EOF_RE.test(body) && ERROR_DICT_RE.test(body),
    retries: retriesMatch ? Number(retriesMatch[1]) : null,
    turnLimit: TURN_LIMIT_TEMPLATE_RE.test(body),
  };
}

/**
 * True when the text is a backend/provider error payload rather than prose.
 *
 * Deliberately narrow: session-lifecycle and auth payloads (`session_not_found`,
 * `session_in_use`, `invalid_api_key`) already have dedicated recovery copy in
 * chatErrors.ts and must keep it, so a bare `{"error": {...}}` shape is NOT a
 * trigger on its own.
 */
export function isProviderErrorPayload(text: string | null | undefined): boolean {
  return classify(text) != null;
}

function classify(
  text: string | null | undefined,
): { kind: ProviderErrorKind; retries: number | null } | null {
  if (!text || !text.trim()) {
    return null;
  }
  const body = normalize(text);
  if (body.length > MAX_PAYLOAD_CHARS) {
    return null;
  }
  const found = markers(body);

  // Nothing here is a keyword match — each is payload framing or a failure
  // template. Prose that merely mentions EOF or an error code falls through.
  const isPayload =
    found.code != null ||
    found.apiErrorType ||
    found.modelRunError ||
    found.unexpectedEof ||
    found.retries != null ||
    found.turnLimit;
  if (!isPayload) {
    return null;
  }

  if (found.code === 429) {
    return { kind: 'model_rate_limited', retries: found.retries };
  }
  if (found.retries != null) {
    return { kind: 'retries_exhausted', retries: found.retries };
  }
  if (found.unexpectedEof || found.apiErrorType || found.modelRunError) {
    return { kind: 'model_stopped', retries: null };
  }
  if (found.code != null) {
    return { kind: found.code >= 500 ? 'model_stopped' : 'model_error', retries: null };
  }
  return { kind: 'turn_time_limit', retries: null };
}

function headlineFor(kind: ProviderErrorKind, retries: number | null): string {
  switch (kind) {
    case 'model_stopped':
      return "Your Mac's AI model stopped responding. Tap ↑ to try again.";
    case 'model_rate_limited':
      return "Your Mac's AI model hit its usage limit. Wait a moment, then tap ↑ to try again.";
    case 'model_error':
      return "Your Mac's AI model couldn't answer this one. Tap ↑ to try again.";
    case 'retries_exhausted': {
      const count = retries ?? 3;
      const noun = count === 1 ? 'try' : 'tries';
      return `Your Mac couldn't complete this after ${count} ${noun}. Tap ↑ to try again.`;
    }
    case 'turn_time_limit':
    default:
      return 'This turn ran past its time limit on your Mac. Tap ↑ to try again, or start a fresh chat.';
  }
}

/** Humanized headline + preserved raw detail, or null when the text is ordinary prose. */
export function humanizeProviderError(text: string | null | undefined): HumanProviderError | null {
  const classified = classify(text);
  if (!classified) {
    return null;
  }
  return {
    kind: classified.kind,
    headline: headlineFor(classified.kind, classified.retries),
    detail: (text ?? '').trim(),
  };
}

/** Headline when the text is a provider payload; the text unchanged otherwise. */
export function humanizeProviderErrorText(text: string): string {
  return humanizeProviderError(text)?.headline ?? text;
}

/** "Show technical detail" for provider diagnostics, "Show more" for prose. */
export function resolveExpandLabel(expandedContent: string | null | undefined): string {
  return isProviderErrorPayload(expandedContent)
    ? PROVIDER_ERROR_EXPAND_LABEL
    : MESSAGE_EXPAND_LABEL;
}
