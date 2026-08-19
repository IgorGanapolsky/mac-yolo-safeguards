/**
 * Hosted edit/context policy.
 * Prefer a hash-anchored span over line numbers.
 * Fail closed on over-budget dumps. Not a VS Code plugin.
 */

export const HOSTED_CONTEXT_BUDGET_BYTES = 24_000;

export function snippetHash(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const value = String(text ?? "");
  for (let i = 0; i < value.length; i += 1) {
    hash ^= BigInt(value.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function admitHostedContext(input: { bytes?: number } = {}): { ok: true } | { ok: false; reason: "over_budget"; message: string } {
  const bytes = Number(input.bytes ?? 0);
  if (bytes > HOSTED_CONTEXT_BUDGET_BYTES) {
    return {
      ok: false,
      reason: "over_budget",
      message: "Prompt is over the hosted context budget. Send the hash-anchored span, not the whole file.",
    };
  }
  return { ok: true };
}

export function applyHashAnchoredReplace(input: {
  content?: string;
  before?: string;
  after?: string;
  expectedHash?: string;
} = {}):
  | { ok: true; content: string; hash: string }
  | { ok: false; reason: "hash_mismatch" | "not_found" | "ambiguous" | "missing_span" } {
  const content = String(input.content ?? "");
  const before = String(input.before ?? "");
  const after = String(input.after ?? "");
  if (!before) return { ok: false, reason: "missing_span" };
  const hash = snippetHash(before);
  if (input.expectedHash && input.expectedHash !== hash) {
    return { ok: false, reason: "hash_mismatch" };
  }
  const parts = content.split(before);
  if (parts.length < 2) return { ok: false, reason: "not_found" };
  if (parts.length > 2) return { ok: false, reason: "ambiguous" };
  return { ok: true, content: `${parts[0]}${after}${parts[1]}`, hash };
}
