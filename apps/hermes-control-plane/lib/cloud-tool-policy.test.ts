import { describe, expect, it } from "vitest";
import {
  evaluateCloudPromptToolPolicy,
  promptRequiresHostedBrowser,
  requiredHostedSidecars,
} from "./cloud-tool-policy";

describe("evaluateCloudPromptToolPolicy", () => {
  it("allows ordinary coding prompts", () => {
    expect(evaluateCloudPromptToolPolicy("Summarize the last commits and open a PR draft.").allowed).toBe(true);
  });

  it("blocks AppleScript and keychain style local-only prompts", () => {
    const applescript = evaluateCloudPromptToolPolicy("Run osascript to tell application Finder to eject disk");
    expect(applescript).toMatchObject({ allowed: false, code: "local_only_tool", matched: "applescript" });
    if (!applescript.allowed) {
      expect(applescript.message).not.toContain("Keep the Mac online");
      expect(applescript.message).not.toContain("Continuity");
    }

    const keychain = evaluateCloudPromptToolPolicy("Use security find-generic-password -s hermes");
    expect(keychain).toMatchObject({ allowed: false, matched: "keychain" });
    if (!keychain.allowed) {
      expect(keychain.message).not.toContain("Keep the Mac online");
      expect(keychain.message).not.toContain("Continuity");
    }
  });

  it("blocks private LAN and local Hermes gateway references", () => {
    const lan = evaluateCloudPromptToolPolicy("curl http://192.168.1.20:4010/v1/models");
    expect(lan).toMatchObject({
      allowed: false,
      matched: "private_lan",
    });
    if (!lan.allowed) {
      expect(lan.message).not.toContain("Keep the Mac online");
      expect(lan.message).not.toContain("Continuity");
    }
    const gateway = evaluateCloudPromptToolPolicy("POST to 127.0.0.1:8642/api/sessions");
    expect(gateway).toMatchObject({
      allowed: false,
      matched: "localhost_gateway",
    });
    if (!gateway.allowed) {
      expect(gateway.message).not.toContain("Keep the Mac online");
      expect(gateway.message).not.toContain("Continuity");
    }
  });

  it("blocks host-mouse grabs on the user machine", () => {
    const xdo = evaluateCloudPromptToolPolicy("Use xdotool to move the user cursor");
    expect(xdo).toMatchObject({ allowed: false, code: "local_only_tool", matched: "host_mouse" });
    const click = evaluateCloudPromptToolPolicy("Run cliclick to click the host screen");
    expect(click).toMatchObject({ allowed: false, matched: "host_mouse" });
  });
});

describe("requiredHostedSidecars", () => {
  it("does not require a hosted browser for an ordinary PR draft", () => {
    const prompt = "open a PR draft";
    expect(promptRequiresHostedBrowser(prompt)).toBe(false);
    expect(requiredHostedSidecars(prompt)).toEqual(["runner", "model"]);
  });

  it("requires a hosted browser sidecar when the prompt contains the first tight cue", () => {
    const prompt = "Use playwright to collect traces";
    expect(promptRequiresHostedBrowser(prompt)).toBe(true);
    expect(requiredHostedSidecars(prompt)).toEqual(["runner", "model", "browser"]);
  });
});
