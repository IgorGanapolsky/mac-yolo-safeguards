import { createSignedAuthState } from "@/lib/auth-state";
import { runtimeEnv } from "@/lib/runtime";

export async function GET(request: Request) {
  const current = runtimeEnv();
  if (!current.WORKOS_CLIENT_ID || !current.WORKOS_API_KEY || !current.WORKOS_REDIRECT_URI) {
    return Response.json({ error: "WorkOS AuthKit is not configured on this deployment" }, { status: 503 });
  }
  const requestUrl = new URL(request.url);
  const requestedReturn = requestUrl.searchParams.get("return_to") ?? "/dashboard";
  const returnTo = requestedReturn.startsWith("/") && !requestedReturn.startsWith("//") ? requestedReturn : "/dashboard";

  // Stateless signed OAuth state — no D1 write on the login hot path.
  const state = await createSignedAuthState(returnTo, current.WORKOS_API_KEY);

  // Ordinary sign-in: AuthKit without max_age. WorkOS treats max_age=0 as
  // step-up reauthentication and may skip the multi-provider chooser.
  // See https://workos.com/docs/authkit/reauthentication
  const authorization = new URL("https://api.workos.com/user_management/authorize");
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("client_id", current.WORKOS_CLIENT_ID);
  authorization.searchParams.set("redirect_uri", current.WORKOS_REDIRECT_URI);
  authorization.searchParams.set("provider", "authkit");
  authorization.searchParams.set("state", state);
  return Response.redirect(authorization, 302);
}
