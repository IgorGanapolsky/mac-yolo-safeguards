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

  it("blocks local user-machine paths before a hosted task is admitted", () => {
    const prompts = [
      "do we need this? /Users/igorganapolsky/Desktop/Screenshot 2026-08-16 at 12.09.06 PM.png",
      "inspect /Users/igorganapolsky/Desktop/Screenshot\\ 2026-08-16\\ at\\ 12.09.06\\ PM.png",
      "read /Users/igorganapolsky/Desktop/Screenshot\u00a02026-08-16.png",
      "open ~/Desktop/incident.png",
      "inspect /home/runner/private/report.txt",
      "read C:\\Users\\Igor\\Desktop\\incident.txt",
    ];

    for (const prompt of prompts) {
      const decision = evaluateCloudPromptToolPolicy(prompt);
      expect(decision).toMatchObject({ allowed: false, code: "local_only_tool", matched: "local_user_path" });
      if (!decision.allowed) {
        expect(decision.message).toContain("No file was read or searched");
      }
    }
  });

  it("does not confuse hosted workspace and URL paths with local user-machine paths", () => {
    expect(evaluateCloudPromptToolPolicy("inspect /workspace/repo/src/index.ts").allowed).toBe(true);
    expect(evaluateCloudPromptToolPolicy("review https://example.com/Users/guide").allowed).toBe(true);
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
