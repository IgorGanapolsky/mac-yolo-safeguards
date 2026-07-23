import { cookies } from "next/headers";
import { runtimeEnv } from "./runtime";
import { randomToken, sha256 } from "./security";

const ADMIN_COOKIE = "tg_admin_session";
const ADMIN_TTL_MS = 12 * 60 * 60 * 1000; // 12h

/**
 * Admin password is NEVER stored in git.
 * Set Cloudflare secrets:
 *   THUMBGATE_ADMIN_EMAIL
 *   THUMBGATE_ADMIN_PASSWORD_HASH  (format: hexSalt:hexScryptHash, scrypt N=16384 r=8 p=1 keylen=64)
 */

export function adminConfigured(): boolean {
  const env = runtimeEnv() as RuntimeEnvWithAdmin;
  return Boolean(env.THUMBGATE_ADMIN_EMAIL?.trim() && env.THUMBGATE_ADMIN_PASSWORD_HASH?.trim());
}

interface RuntimeEnvWithAdmin {
  THUMBGATE_ADMIN_EMAIL?: string;
  THUMBGATE_ADMIN_PASSWORD_HASH?: string;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function scryptHash(password: string, saltHex: string): Promise<string> {
  // Cloudflare Workers: use Web Crypto subtle if available, else node crypto via nodejs_compat
  const { scrypt } = await import("node:crypto");
  const { promisify } = await import("node:util");
  const scryptAsync = promisify(scrypt);
  const salt = Buffer.from(saltHex, "hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return derived.toString("hex");
}

export async function verifyAdminCredentials(email: string, password: string): Promise<boolean> {
  const env = runtimeEnv() as RuntimeEnvWithAdmin;
  const expectedEmail = env.THUMBGATE_ADMIN_EMAIL?.trim().toLowerCase();
  const packed = env.THUMBGATE_ADMIN_PASSWORD_HASH?.trim();
  if (!expectedEmail || !packed) return false;
  if (email.trim().toLowerCase() !== expectedEmail) return false;
  const [saltHex, hashHex] = packed.split(":");
  if (!saltHex || !hashHex) return false;
  try {
    const candidate = await scryptHash(password, saltHex);
    return timingSafeEqual(candidate, hashHex);
  } catch {
    return false;
  }
}

export async function createAdminSession(): Promise<string> {
  const token = randomToken();
  // Stateless signed cookie value: token.hash(admin-email+token) is overkill; store hashed token in memory-less
  // cookie as opaque token with HMAC of env salt. For Workers, use sha256(token + password_hash) as signature.
  const env = runtimeEnv() as RuntimeEnvWithAdmin;
  const sig = await sha256(`${token}:${env.THUMBGATE_ADMIN_PASSWORD_HASH ?? ""}`);
  return `${token}.${sig}`;
}

export function adminSessionCookie(value: string): string {
  return `${ADMIN_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ADMIN_TTL_MS / 1000}`;
}

export function clearAdminSessionCookie(): string {
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function currentAdminSession(): Promise<boolean> {
  if (!adminConfigured()) return false;
  const jar = await cookies();
  const raw = jar.get(ADMIN_COOKIE)?.value;
  if (!raw || !raw.includes(".")) return false;
  const [token, sig] = raw.split(".");
  if (!token || !sig) return false;
  const env = runtimeEnv() as RuntimeEnvWithAdmin;
  const expected = await sha256(`${token}:${env.THUMBGATE_ADMIN_PASSWORD_HASH ?? ""}`);
  return timingSafeEqual(sig, expected);
}

export async function requireAdmin(): Promise<void> {
  if (!(await currentAdminSession())) {
    throw new Error("ADMIN_UNAUTHORIZED");
  }
}
