import { describe, expect, it } from "vitest";
import { workosLogoutUrl, workosSessionIdFromAccessToken } from "./workos-session";

function accessToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${encoded}.signature`;
}

describe("workosSessionIdFromAccessToken", () => {
  it("extracts the WorkOS sid claim without retaining the token", () => {
    expect(workosSessionIdFromAccessToken(accessToken({ sid: "session_01HQAG1HENBZMAZD82YRXDFC0B" })))
      .toBe("session_01HQAG1HENBZMAZD82YRXDFC0B");
  });

  it.each([
    undefined,
    "",
    "not-a-jwt",
    "header.bad***payload.signature",
    accessToken({}),
    accessToken({ sid: 42 }),
    accessToken({ sid: "not-a-workos-session" }),
  ])("rejects a missing or malformed provider session", (token) => {
    expect(workosSessionIdFromAccessToken(token)).toBeNull();
  });
});

describe("workosLogoutUrl", () => {
  it("builds the provider logout redirect with a bounded return URL", () => {
    const url = new URL(workosLogoutUrl(
      "session_01HQAG1HENBZMAZD82YRXDFC0B",
      "https://thumbgate.app/?signed_out=1",
    ));
    expect(url.origin + url.pathname).toBe("https://api.workos.com/user_management/sessions/logout");
    expect(url.searchParams.get("session_id")).toBe("session_01HQAG1HENBZMAZD82YRXDFC0B");
    expect(url.searchParams.get("return_to")).toBe("https://thumbgate.app/?signed_out=1");
  });

  it("rejects an invalid provider session ID", () => {
    expect(() => workosLogoutUrl("../session", "https://thumbgate.app/")).toThrow("Invalid WorkOS session ID");
  });
});
