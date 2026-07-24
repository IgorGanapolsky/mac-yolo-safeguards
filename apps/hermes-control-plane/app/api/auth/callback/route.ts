import { createSession, sessionCookie } from "@/lib/auth";
import { verifySignedAuthState } from "@/lib/auth-state";
import { audit } from "@/lib/audit";
import { db, runtimeEnv } from "@/lib/runtime";
import { sha256 } from "@/lib/security";
import { workosSessionIdFromAccessToken } from "@/lib/workos-session";

interface WorkOSUser {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  profile_picture_url?: string | null;
}

interface AuthenticationResponse {
  user?: WorkOSUser;
  organization_id?: string | null;
  authentication_method?: string;
  access_token?: string;
  error?: string;
  message?: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return Response.redirect(new URL("/?auth_error=missing_callback_parameters", url.origin), 302);

  const current = runtimeEnv();
  if (!current.WORKOS_CLIENT_ID || !current.WORKOS_API_KEY) {
    return Response.redirect(new URL("/?auth_error=workos_not_configured", url.origin), 302);
  }

  // Prefer stateless signed state (no D1). Fall back to legacy auth_states rows
  // for any in-flight logins started before this deploy.
  let returnTo = "/dashboard";
  const signed = await verifySignedAuthState(state, current.WORKOS_API_KEY);
  if (signed) {
    returnTo = signed.returnTo;
  } else {
    const stateHash = await sha256(state);
    const authState = await db().prepare(
      "SELECT return_to AS returnTo FROM auth_states WHERE state_hash = ? AND expires_at > ?"
    ).bind(stateHash, Date.now()).first<{ returnTo: string }>();
    if (!authState) return Response.redirect(new URL("/?auth_error=invalid_state", url.origin), 302);
    await db().prepare("DELETE FROM auth_states WHERE state_hash = ?").bind(stateHash).run();
    returnTo = authState.returnTo;
  }
  const authResponse = await fetch("https://api.workos.com/user_management/authenticate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: current.WORKOS_CLIENT_ID,
      client_secret: current.WORKOS_API_KEY,
      grant_type: "authorization_code",
      code,
      ip_address: request.headers.get("cf-connecting-ip") ?? undefined,
      user_agent: request.headers.get("user-agent") ?? undefined,
    }),
  });
  const payload = await authResponse.json() as AuthenticationResponse;
  if (!authResponse.ok || !payload.user) {
    console.error("WorkOS callback failed", authResponse.status, payload.error ?? payload.message ?? "unknown error");
    return Response.redirect(new URL("/?auth_error=authentication_failed", url.origin), 302);
  }
  const workosSessionId = workosSessionIdFromAccessToken(payload.access_token);
  if (!workosSessionId) {
    console.error("WorkOS callback did not include a valid provider session");
    return Response.redirect(new URL("/?auth_error=invalid_provider_session", url.origin), 302);
  }

  const now = Date.now();
  const workosUser = payload.user;
  const normalizedEmail = workosUser.email.trim().toLowerCase();
  let user = await db().prepare("SELECT id FROM users WHERE workos_user_id = ?").bind(workosUser.id).first<{ id: string }>();
  if (!user) {
    // WorkOS can issue a different workos_user_id for a login that resolves to the same
    // real person (observed in production: a fresh Google sign-in minted a second id for an
    // email that already had an account). Falling back to email prevents silently forking a
    // duplicate user/org — self-heal the stored workos_user_id onto the new one instead.
    user = await db().prepare("SELECT id FROM users WHERE lower(email) = ?").bind(normalizedEmail).first<{ id: string }>();
  }
  const userId = user?.id ?? crypto.randomUUID();
  const displayName = workosUser.name?.trim() || [workosUser.first_name, workosUser.last_name].filter(Boolean).join(" ") || workosUser.email;
  if (user) {
    await db().prepare("UPDATE users SET workos_user_id = ?, email = ?, name = ?, avatar_url = ?, updated_at = ? WHERE id = ?")
      .bind(workosUser.id, workosUser.email, displayName, workosUser.profile_picture_url ?? null, now, userId).run();
  } else {
    await db().prepare(
      "INSERT INTO users (id, workos_user_id, email, name, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(userId, workosUser.id, workosUser.email, displayName, workosUser.profile_picture_url ?? null, now, now).run();
    user = { id: userId };
  }

  const membership = await db().prepare(
    `SELECT m.organization_id AS organizationId FROM memberships m
      JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = ? AND (? IS NULL OR o.workos_organization_id = ?) LIMIT 1`
  ).bind(userId, payload.organization_id ?? null, payload.organization_id ?? null).first<{ organizationId: string }>();
  let organizationId = membership?.organizationId;
  if (!organizationId) {
    const existingOrg = payload.organization_id
      ? await db().prepare("SELECT id FROM organizations WHERE workos_organization_id = ?").bind(payload.organization_id).first<{ id: string }>()
      : null;
    organizationId = existingOrg?.id ?? crypto.randomUUID();
    if (!existingOrg) {
      await db().prepare(
        "INSERT INTO organizations (id, workos_organization_id, name, plan, trial_ends_at, created_at, updated_at) VALUES (?, ?, ?, 'trial', ?, ?, ?)"
      ).bind(organizationId, payload.organization_id ?? null, `${displayName}'s workspace`, now + 14 * 24 * 60 * 60 * 1000, now, now).run();
    }
    await db().prepare(
      "INSERT OR IGNORE INTO memberships (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)"
    ).bind(crypto.randomUUID(), organizationId, userId, now).run();
  }

  const sessionToken = await createSession(userId, organizationId, workosSessionId);
  await audit({ organizationId, actorType: "user", actorId: userId, action: "auth.login", targetType: "session", metadata: { method: payload.authentication_method ?? "AuthKit" } });
  return new Response(null, {
    status: 302,
    headers: {
      location: new URL(returnTo, url.origin).toString(),
      "set-cookie": sessionCookie(sessionToken),
      "cache-control": "no-store",
    },
  });
}
