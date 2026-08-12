import { describe, expect, it } from "vitest";
import {
  evaluateCloudPromptDecisionContract,
  evaluateCloudPromptToolPolicy,
} from "./cloud-tool-policy";

describe("evaluateCloudPromptToolPolicy", () => {
  it("allows ordinary coding prompts", () => {
    expect(evaluateCloudPromptToolPolicy("Summarize the last commits and open a PR draft.").allowed).toBe(true);
  });

  it("blocks AppleScript and keychain style local-only prompts", () => {
    const applescript = evaluateCloudPromptToolPolicy("Run osascript to tell application Finder to eject disk");
    expect(applescript).toMatchObject({ allowed: false, code: "local_only_tool", matched: "applescript" });

    const keychain = evaluateCloudPromptToolPolicy("Use security find-generic-password -s hermes");
    expect(keychain).toMatchObject({ allowed: false, matched: "keychain" });
  });

  it("blocks private LAN and local Hermes gateway references", () => {
    expect(evaluateCloudPromptToolPolicy("curl http://192.168.1.20:4010/v1/models")).toMatchObject({
      allowed: false,
      matched: "private_lan",
    });
    expect(evaluateCloudPromptToolPolicy("POST to 127.0.0.1:8642/api/sessions")).toMatchObject({
      allowed: false,
      matched: "localhost_gateway",
    });
  });
});

describe("evaluateCloudPromptDecisionContract (recommend vs execute)", () => {
  const FIXED = "2026-08-12T20:15:00.000Z";

  it("allows recommend for local-only prompts but marks provisional", () => {
    const result = evaluateCloudPromptDecisionContract({
      prompt: "Run osascript to open Messages",
      mode: "recommend",
      entitled: true,
      generatedAt: FIXED,
    });
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.provisional).toBe(true);
    expect(result.matchedLocalOnly).toBe("applescript");
  });

  it("denies execute for local-only prompts on Continuity", () => {
    const result = evaluateCloudPromptDecisionContract({
      prompt: "Use security find-generic-password -s hermes",
      mode: "execute",
      entitled: true,
      generatedAt: FIXED,
    });
    expect(result.allowed).toBe(false);
    expect(result.matchedLocalOnly).toBe("keychain");
  });

  it("allows execute for ordinary coding when entitled", () => {
    const result = evaluateCloudPromptDecisionContract({
      prompt: "Summarize the last commits and open a PR draft.",
      mode: "execute",
      entitled: true,
      generatedAt: FIXED,
    });
    expect(result.allowed).toBe(true);
  });
});
