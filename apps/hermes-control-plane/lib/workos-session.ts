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

/**
 * End the WorkOS session server-side so the browser only needs one hop back to ThumbGate.
 * Browser-only WorkOS logout redirects often feel like "I have to press Sign out twice"
 * when the provider page fails, stalls, or the local session had no stored sid.
 */
export async function revokeWorkosSession(
  sessionId: string | null | undefined,
  apiKey: string | null | undefined,
): Promise<{ revoked: boolean; reason?: string }> {
  if (!sessionId || !WORKOS_SESSION_ID.test(sessionId)) {
    return { revoked: false, reason: "missing_or_invalid_session_id" };
  }
  if (!apiKey?.trim()) {
    return { revoked: false, reason: "missing_api_key" };
  }
  try {
    const response = await fetch("https://api.workos.com/user_management/sessions/revoke", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey.trim()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ session_id: sessionId }),
      signal: AbortSignal.timeout(8_000),
    });
    if (response.ok || response.status === 404) {
      // 404 = already gone — treat as success for logout UX
      return { revoked: true };
    }
    return { revoked: false, reason: `http_${response.status}` };
  } catch (error) {
    return {
      revoked: false,
      reason: error instanceof Error ? error.message : "revoke_failed",
    };
  }
}
