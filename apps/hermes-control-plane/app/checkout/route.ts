import { currentSession } from "@/lib/auth";

export async function GET() {
  let signedIn = false;
  try {
    signedIn = Boolean(await currentSession());
  } catch {
    signedIn = false;
  }
  if (signedIn) {
    return new Response(null, {
      status: 307,
      headers: { Location: "/dashboard" },
    });
  }
  return new Response(null, {
    status: 307,
    headers: { Location: "/api/auth/login?return_to=/dashboard" },
  });
}

export const HEAD = GET;
