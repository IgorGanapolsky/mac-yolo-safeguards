import { cookies } from "next/headers";
import { db, runtimeEnv } from "./runtime";
import { randomToken, sha256 } from "./security";

const SESSION_COOKIE = "hermes_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AppSession {
  sessionHash: string;
  userId: string;
  organizationId: string;
  workosSessionId: string | null;
  email: string;
  name: string;
  avatarUrl: string | null;
  plan: string;
  trialEndsAt: number | null;
}

export function workosConfigured(): boolean {
  const current = runtimeEnv();
  return Boolean(current.WORKOS_CLIENT_ID && current.WORKOS_API_KEY && current.WORKOS_REDIRECT_URI);
}

export async function currentSession(): Promise<AppSession | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await db().prepare(
    `SELECT s.id_hash AS sessionHash, s.user_id AS userId, s.organization_id AS organizationId,
            s.workos_session_id AS workosSessionId,
            u.email, u.name, u.avatar_url AS avatarUrl, o.plan,
            o.trial_ends_at AS trialEndsAt
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN organizations o ON o.id = s.organization_id
      WHERE s.id_hash = ? AND s.expires_at > ?`
  ).bind(tokenHash, Date.now()).first<AppSession>();
  return row ?? null;
}

export async function requireSession(): Promise<AppSession> {
  const session = await currentSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export async function createSession(userId: string, organizationId: string, workosSessionId: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await db().prepare(
    "INSERT INTO sessions (id_hash, user_id, organization_id, workos_session_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(await sha256(token), userId, organizationId, workosSessionId, now + SESSION_TTL_MS, now).run();
  return token;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
