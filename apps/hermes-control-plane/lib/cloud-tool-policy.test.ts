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

  it("blocks a local-computer file path so the model can't hallucinate reading or deleting it", () => {
    // 2026-08-21: hosted agent got /Users/.../Desktop/Screenshot.png, invented an
    // `ls`, then offered to delete it. The fenced VPS cannot see the user's Mac.
    const desktop = evaluateCloudPromptToolPolicy(
      "do we need this? /Users/igorganapolsky/Desktop/Screenshot 2026-08-16 at 12.09.06 PM.png",
    );
    expect(desktop).toMatchObject({ allowed: false, code: "local_only_tool", matched: "local_filesystem_path" });
    if (!desktop.allowed) {
      expect(desktop.message).toContain("fenced VPS");
      expect(desktop.message).toContain("never read or delete");
      expect(desktop.message).not.toContain("Continuity");
      expect(desktop.message).not.toMatch(/paired local machine/i);
    }
    expect(evaluateCloudPromptToolPolicy("summarize ~/Documents/notes.md").allowed).toBe(false);
    expect(evaluateCloudPromptToolPolicy("open C:\\Users\\igor\\report.docx").allowed).toBe(false);
  });

  it("does NOT block VPS-local or relative paths (no false positive)", () => {
    expect(evaluateCloudPromptToolPolicy("read ./src/index.ts and fix the bug").allowed).toBe(true);
    expect(evaluateCloudPromptToolPolicy("cat /home/runner/work/repo/file.ts").allowed).toBe(true);
    expect(evaluateCloudPromptToolPolicy("check /tmp/output.log for the stack trace").allowed).toBe(true);
    const screenshotPrompt =
      "which project are you working on? you checked out https://github.com/IgorGanapolsky/RealEstate/pulls into local project, as well as Obsidian Vault into ~/Documents : https://github.com/IgorGanapolsky/AI-Agent-Sync";
    expect(evaluateCloudPromptToolPolicy(screenshotPrompt).allowed).toBe(true);
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
