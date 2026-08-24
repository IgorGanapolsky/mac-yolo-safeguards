import { base64Url, timingSafeEqual } from "./security";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const RUNNER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;

export interface RunnerSignatureInput {
  runnerId: string;
  timestamp: number;
  method: string;
  pathname: string;
  body: string;
}

function signaturePayload(input: RunnerSignatureInput): string {
  return [input.timestamp, input.runnerId, input.method.toUpperCase(), input.pathname, input.body].join("\n");
}

export async function signRunnerRequest(secret: string, input: RunnerSignatureInput): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `v1=${base64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signaturePayload(input))))}`;
}

export async function verifyRunnerRequest(
  request: Request,
  body: string,
  secret: string | undefined,
  now = Date.now(),
): Promise<{ ok: true; runnerId: string } | { ok: false; reason: string }> {
  if (!secret) return { ok: false, reason: "runner authentication is not configured" };
  const runnerId = request.headers.get("x-hermes-runner") ?? "";
  const timestamp = Number(request.headers.get("x-hermes-timestamp"));
  const supplied = request.headers.get("x-hermes-signature") ?? "";
  if (!RUNNER_ID_PATTERN.test(runnerId)) return { ok: false, reason: "invalid runner identity" };
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, reason: "runner signature expired" };
  }
  const pathname = new URL(request.url).pathname;
  const expected = await signRunnerRequest(secret, {
    runnerId,
    timestamp,
    method: request.method,
    pathname,
    body,
  });
  if (!timingSafeEqual(supplied, expected)) return { ok: false, reason: "runner signature invalid" };
  return { ok: true, runnerId };
}
