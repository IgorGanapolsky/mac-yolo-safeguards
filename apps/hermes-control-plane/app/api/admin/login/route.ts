import { adminConfigured, adminSessionCookie, createAdminSession, verifyAdminCredentials } from "@/lib/admin-auth";
import { jsonError } from "@/lib/security";

export async function POST(request: Request) {
  if (!adminConfigured()) {
    return jsonError("admin is not configured (set THUMBGATE_ADMIN_EMAIL + THUMBGATE_ADMIN_PASSWORD_HASH secrets)", 503);
  }
  const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
  const email = body?.email?.trim() ?? "";
  const password = body?.password ?? "";
  if (!email || !password) return jsonError("email and password required", 400);
  const ok = await verifyAdminCredentials(email, password);
  if (!ok) return jsonError("invalid credentials", 401);
  const session = await createAdminSession();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": adminSessionCookie(session),
      "cache-control": "no-store",
    },
  });
}
