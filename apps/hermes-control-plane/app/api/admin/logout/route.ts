import { clearAdminSessionCookie } from "@/lib/admin-auth";

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": clearAdminSessionCookie(),
      "cache-control": "no-store",
    },
  });
}
