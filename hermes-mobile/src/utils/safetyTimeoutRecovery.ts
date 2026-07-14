/**
 * Detect model/gateway "safety timeout" refusal copy (often from poisoned mega-session
 * history or old Browser Session Safety Lock turns) and map to human recovery UX.
 */

export const SAFETY_TIMEOUT_HUMAN_MESSAGE =
  'Your computer paused this step — continuing automatically…';

/** Gateway auto-continue message sent when the phone should nudge the Mac to resume. */
export const SAFETY_TIMEOUT_AUTO_CONTINUE_TEXT = 'continue';

const SAFETY_TIMEOUT_MARKERS = [
  'safety timeout',
  'safety lock',
  'browser session safety',
  'interrupted further progress',
  'resume with `hermes continue`',
  "resume with 'hermes continue'",
  'resume with hermes continue',
  'hermes continue`',
] as const;

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function isSafetyTimeoutAssistantMessage(text: string | undefined | null): boolean {
  if (!text?.trim()) {
    return false;
  }
  const body = normalize(text);
  if (body.length > 1200) {
    return false;
  }
  return SAFETY_TIMEOUT_MARKERS.some((marker) => body.includes(marker));
}

export function humanizeSafetyTimeoutMessage(text: string): string {
  if (!isSafetyTimeoutAssistantMessage(text)) {
    return text;
  }
  return SAFETY_TIMEOUT_HUMAN_MESSAGE;
}

/** Phone should auto-send "continue" when the last assistant turn is a safety-timeout stall. */
export function shouldAutoContinueAfterSafetyTimeout(input: {
  assistantText: string | undefined | null;
  macHttpOk: boolean;
  isDemo: boolean;
  isSending: boolean;
  recoveriesUsed: number;
  maxRecoveries?: number;
}): boolean {
  if (input.isDemo || !input.macHttpOk || input.isSending) {
    return false;
  }
  const max = input.maxRecoveries ?? 2;
  if (input.recoveriesUsed >= max) {
    return false;
  }
  return isSafetyTimeoutAssistantMessage(input.assistantText);
}
