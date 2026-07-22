const WORKOS_SESSION_ID = /^session_[A-Za-z0-9]+$/;

export function workosSessionIdFromAccessToken(accessToken: unknown): string | null {
  if (typeof accessToken !== "string") return null;
  const payloadSegment = accessToken.split(".")[1];
  if (!payloadSegment) return null;

  try {
    const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { sid?: unknown };
    return typeof payload.sid === "string" && WORKOS_SESSION_ID.test(payload.sid) ? payload.sid : null;
  } catch {
    return null;
  }
}

export function workosLogoutUrl(sessionId: string, returnTo: string): string {
  if (!WORKOS_SESSION_ID.test(sessionId)) throw new Error("Invalid WorkOS session ID");
  const logout = new URL("https://api.workos.com/user_management/sessions/logout");
  logout.searchParams.set("session_id", sessionId);
  logout.searchParams.set("return_to", returnTo);
  return logout.toString();
}
