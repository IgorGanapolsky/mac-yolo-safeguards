/** Codex-style diff preview for mobile approval surfaces. */

import { redactSecrets } from './sessionContinuityHandoff';

/**
 * PII shapes that are not credentials but must never leak out of a diff preview
 * (lock-screen / shoulder-surf surface). Credential masking is delegated to
 * redactSecrets() so both the vault handoff and the approval UI share one redactor.
 */
const DIFF_PII_PATTERNS: RegExp[] = [
  // Email addresses (git author lines, seeded fixtures, contact records).
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
];

/** Mask secrets + PII inside diff text. Line structure is preserved. */
export function redactDiffContent(diff: string): string {
  let out = redactSecrets(diff);
  for (const pattern of DIFF_PII_PATTERNS) {
    out = out.replace(pattern, '[redacted]');
  }
  return out;
}

/**
 * Apply the user's "Redact PII & Secrets" setting to diff text before display.
 * Fails closed: callers that cannot resolve the setting get masked output.
 */
export function prepareDiffForDisplay(diff: string, redactPii = true): string {
  return redactPii ? redactDiffContent(diff) : diff;
}

export function hasDiffContent(diff: string | undefined | null): boolean {
  const trimmed = diff?.trim() ?? '';
  return trimmed.length > 0 && trimmed !== '""' && trimmed !== '{}';
}

export function formatDiffPreview(diff: string, maxLines = 14): string {
  const lines = diff.replace(/\r\n/g, '\n').split('\n');
  if (lines.length <= maxLines) {
    return lines.join('\n');
  }
  return `${lines.slice(0, maxLines).join('\n')}\n… (${lines.length - maxLines} more lines on computer)`;
}

export function diffStats(diff: string): { additions: number; deletions: number } | null {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) {
      continue;
    }
    if (line.startsWith('+')) {
      additions += 1;
    } else if (line.startsWith('-')) {
      deletions += 1;
    }
  }
  if (additions === 0 && deletions === 0) {
    return null;
  }
  return { additions, deletions };
}
