import { describe, expect, it } from "vitest";
import { createSignedAuthState, verifySignedAuthState } from "./auth-state";

describe("signed auth state", () => {
  it("round-trips return_to without D1", async () => {
    const secret = "test-workos-secret-material";
    const state = await createSignedAuthState("/dashboard/lessons", secret);
    expect(state.includes(".")).toBe(true);
    const verified = await verifySignedAuthState(state, secret);
    expect(verified).toEqual({ returnTo: "/dashboard/lessons" });
  });

  it("rejects tampered state and open redirects", async () => {
    const secret = "test-workos-secret-material";
    const state = await createSignedAuthState("/dashboard", secret);
    const [payload] = state.split(".");
    const bad = `${payload}.AAAA`;
    expect(await verifySignedAuthState(bad, secret)).toBeNull();
    const external = await createSignedAuthState("https://evil.example/", secret);
    const verified = await verifySignedAuthState(external, secret);
    expect(verified?.returnTo).toBe("/dashboard");
  });
});
