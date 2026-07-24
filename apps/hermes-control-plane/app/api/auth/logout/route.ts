import { cookies } from "next/headers";
import { clearSessionCookie, currentSession } from "@/lib/auth";
import { db, runtimeEnv } from "@/lib/runtime";
import { sha256 } from "@/lib/security";
import { revokeWorkosSession, workosLogoutUrl } from "@/lib/workos-session";

async function endSession(request: Request): Promise<Response> {
  const token = (await cookies()).get("hermes_session")?.value;
  // Capture provider sid before local delete so we can revoke WorkOS once.
  const session = token ? await currentSession() : null;
  if (token) {
    const tokenHash = await sha256(token);
    // Drop this browser session and any other rows for the same user so a
    // stale dashboard tab cannot resurrect a half-signed-out state.
    if (session?.userId) {
      await db().prepare("DELETE FROM sessions WHERE user_id = ?").bind(session.userId).run();
    } else {
      await db().prepare("DELETE FROM sessions WHERE id_hash = ?").bind(tokenHash).run();
    }
  }

  const returnTo = new URL("/?signed_out=1", request.url).toString();
  const apiKey = runtimeEnv().WORKOS_API_KEY;
  const revoke = await revokeWorkosSession(session?.workosSessionId, apiKey);

  // Prefer one-click home. Only fall back to the browser WorkOS logout hop when
  // server revoke could not run and we still have a provider session id.
  const location =
    !revoke.revoked && session?.workosSessionId
      ? workosLogoutUrl(session.workosSessionId, returnTo)
      : returnTo;

  return new Response(null, {
    status: 303,
    headers: {
      location,
      "set-cookie": clearSessionCookie(),
      "cache-control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  return endSession(request);
}

/** Allow simple link-based sign-out (mobile / accessibility). */
export async function GET(request: Request) {
  return endSession(request);
}
