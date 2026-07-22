import { db, runtimeEnv } from "@/lib/runtime";
import { randomToken, sha256 } from "@/lib/security";

export async function GET(request: Request) {
  const current = runtimeEnv();
  if (!current.WORKOS_CLIENT_ID || !current.WORKOS_API_KEY || !current.WORKOS_REDIRECT_URI) {
    return Response.json({ error: "WorkOS AuthKit is not configured on this deployment" }, { status: 503 });
  }
  const requestUrl = new URL(request.url);
  const requestedReturn = requestUrl.searchParams.get("return_to") ?? "/dashboard";
  const returnTo = requestedReturn.startsWith("/") && !requestedReturn.startsWith("//") ? requestedReturn : "/dashboard";
  const state = randomToken(24);
  const now = Date.now();
  await db().batch([
    db().prepare("INSERT INTO auth_states (state_hash, return_to, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .bind(await sha256(state), returnTo, now + 10 * 60 * 1000, now),
    db().prepare("DELETE FROM auth_states WHERE expires_at < ?").bind(now),
  ]);
  const authorization = new URL("https://api.workos.com/user_management/authorize");
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("client_id", current.WORKOS_CLIENT_ID);
  authorization.searchParams.set("redirect_uri", current.WORKOS_REDIRECT_URI);
  authorization.searchParams.set("provider", "authkit");
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("max_age", "0");
  return Response.redirect(authorization, 302);
}
