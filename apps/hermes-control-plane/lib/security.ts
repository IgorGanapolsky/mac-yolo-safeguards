const encoder = new TextEncoder();

export function randomToken(bytes = 32): string {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  return base64Url(raw);
}

export function base64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function sha256(value: string): Promise<string> {
  return base64Url(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export async function publicKeyFingerprint(jwk: JsonWebKey): Promise<string> {
  return sha256(canonicalJson(jwk));
}

export function displayFingerprint(fingerprint: string): string {
  return fingerprint.slice(0, 20).toUpperCase().match(/.{1,4}/g)?.join(" ") ?? fingerprint;
}

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

/** Constant-time string comparison (length mismatch short-circuits, which is safe to leak). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Strip null bytes, collapse whitespace, trim, and cap length for user-supplied free text. */
export function sanitizeText(value: string, maxLen: number): string {
  return value.replaceAll("\u0000", "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}
