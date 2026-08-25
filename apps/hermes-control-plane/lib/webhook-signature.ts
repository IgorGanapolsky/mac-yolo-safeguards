/**
 * Payment-provider webhook signature verification.
 *
 * Extracted from the route handler so it is unit-testable, and fixed for two
 * defects that made every live delivery fail with 401:
 *
 * 1. Rotation headers were rejected. During a signing-secret rotation the
 *    provider signs the payload with BOTH the old and the new secret and sends
 *    every candidate in one header (`t=..,v1=<a>,v1=<b>`). The previous parser
 *    used Object.fromEntries, which keeps only the LAST value for a repeated
 *    key, so whenever the matching signature was not the last one listed,
 *    verification failed for every event until the rotation window closed.
 *
 * 2. Missing configuration was indistinguishable from a bad signature. Both
 *    returned 401, so an unset secret looked identical to an attack in the
 *    provider dashboard. They are now separate outcomes.
 */

export type SignatureOutcome =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "malformed_header" | "timestamp_outside_tolerance" | "no_matching_signature" };

/** Provider default: reject payloads whose timestamp is more than 5 minutes old. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export interface ParsedSignatureHeader {
  timestamp: string | null;
  /** Every v1 candidate, in header order. A rotation sends more than one. */
  signatures: string[];
}

/**
 * Parse the signature header, preserving ALL v1 candidates.
 * Tolerates whitespace around separators; ignores unknown schemes (v0 etc).
 */
export function parseSignatureHeader(header: string): ParsedSignatureHeader {
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const rawItem of header.split(",")) {
    const item = rawItem.trim();
    const separator = item.indexOf("=");
    if (separator <= 0) continue;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (!value) continue;
    if (key === "t") { if (timestamp === null) timestamp = value; }
    else if (key === "v1") signatures.push(value);
  }
  return { timestamp, signatures };
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export async function verifyWebhookSignature(
  payload: string,
  header: string | null,
  secret: string | undefined,
  now: number = Date.now(),
): Promise<SignatureOutcome> {
  if (!secret) return { ok: false, reason: "not_configured" };
  if (!header) return { ok: false, reason: "malformed_header" };

  const { timestamp, signatures } = parseSignatureHeader(header);
  if (!timestamp || !signatures.length) return { ok: false, reason: "malformed_header" };

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return { ok: false, reason: "malformed_header" };
  if (Math.abs(now / 1000 - timestampSeconds) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp_outside_tolerance" };
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signedPayload = new TextEncoder().encode(`${timestamp}.${payload}`);

  // Check every candidate: during rotation only one of them is ours, and it is
  // not necessarily the last one in the header.
  for (const candidate of signatures) {
    const bytes = hexToBytes(candidate);
    if (!bytes) continue;
    if (await crypto.subtle.verify("HMAC", key, bytes, signedPayload)) return { ok: true };
  }
  return { ok: false, reason: "no_matching_signature" };
}
