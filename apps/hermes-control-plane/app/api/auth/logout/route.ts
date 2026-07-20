import { cookies } from "next/headers";
import { clearSessionCookie } from "@/lib/auth";
import { db } from "@/lib/runtime";
import { sha256 } from "@/lib/security";

export async function POST(request: Request) {
  const token = (await cookies()).get("hermes_session")?.value;
  if (token) await db().prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256(token)).run();
  const response = Response.redirect(new URL("/", request.url), 303);
  response.headers.append("set-cookie", clearSessionCookie());
  return response;
}
