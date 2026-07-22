import { cookies } from "next/headers";
import { clearSessionCookie, currentSession } from "@/lib/auth";
import { db } from "@/lib/runtime";
import { sha256 } from "@/lib/security";
import { workosLogoutUrl } from "@/lib/workos-session";

export async function POST(request: Request) {
  const token = (await cookies()).get("hermes_session")?.value;
  const session = token ? await currentSession() : null;
  if (token) await db().prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256(token)).run();
  const returnTo = new URL("/?signed_out=1", request.url).toString();
  const location = session?.workosSessionId
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
