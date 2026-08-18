/**
 * Task error rendering for Hermes Web.
 *
 * z.ai Coding Plan 429 code 1310 ("Weekly/Monthly Limit Exhausted") is an
 * upstream glm-coding quota, not the $10 Pro VPS run cap. Show a retry notice
 * and NEVER lock the composer — the user must always be able to type.
 */

export const UPSTREAM_QUOTA_RETRY_MESSAGE = "Upstream coding quota hit — retried on SuperGrok";

export function isZaiWeeklyQuotaError(error: string | null | undefined): boolean {
  const text = String(error || "");
  if (!text) return false;
  if (/Weekly\/Monthly Limit Exhausted/i.test(text)) return true;
  if (/\bcode["\s:]*1310\b/i.test(text)) return true;
  if (/\b429\b/.test(text) && /limit exhausted|weekly\/monthly|z\.?ai|glm-coding/i.test(text)) return true;
  return false;
}

export function formatTaskError(error: string | null | undefined): string {
  if (isZaiWeeklyQuotaError(error)) return UPSTREAM_QUOTA_RETRY_MESSAGE;
  return String(error || "");
}

/** Quota / cloud_pending / failed must never disable the prompt input. */
export function composerLockForTaskError(_error: string | null | undefined): boolean {
  return false;
}
