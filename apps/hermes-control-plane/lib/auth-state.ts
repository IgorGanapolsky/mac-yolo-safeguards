import { base64Url, fromBase64Url, randomToken } from "./security";

const encoder = new TextEncoder();
const STATE_TTL_MS = 10 * 60 * 1000;

interface AuthStatePayload {
  r: string;
  e: number;
  n: string;
}

function normalizeReturnTo(returnTo: string): string {
  return returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/dashboard";
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(payloadB64: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return base64Url(sig);
}

/**
 * Stateless OAuth state (no D1 write on /api/auth/login).
 * Signed with WORKOS_API_KEY material so we need no extra secret.
 */
export async function createSignedAuthState(returnTo: string, secret: string): Promise<string> {
  const payload: AuthStatePayload = {
    r: normalizeReturnTo(returnTo),
    e: Date.now() + STATE_TTL_MS,
    n: randomToken(16),
  };
  const payloadB64 = base64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await sign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

export async function verifySignedAuthState(
  state: string,
  secret: string,
): Promise<{ returnTo: string } | null> {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return null;
  const expected = await sign(payloadB64, secret);
  if (expected.length !== signature.length) return null;
  let ok = 0;
  for (let i = 0; i < expected.length; i += 1) {
    ok |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  if (ok !== 0) return null;
  try {
    const json = new TextDecoder().decode(fromBase64Url(payloadB64));
    const payload = JSON.parse(json) as AuthStatePayload;
    if (typeof payload.e !== "number" || payload.e < Date.now()) return null;
    if (typeof payload.r !== "string") return null;
    return { returnTo: normalizeReturnTo(payload.r) };
  } catch {
    return null;
  }
}
