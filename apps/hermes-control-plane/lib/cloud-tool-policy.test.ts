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
      expect(desktop.message).not.toContain("paired local machine");
    }
    expect(evaluateCloudPromptToolPolicy("summarize ~/Documents/notes.md").allowed).toBe(false);
    expect(evaluateCloudPromptToolPolicy("open C:\\Users\\igor\\report.docx").allowed).toBe(false);
  });

  it("uses a GitHub repository as the VPS source while omitting local-only paths", async () => {
    const { buildHostedExecutionPrompt } = await import("./cloud-tool-policy");
    const prompt = "work in /Users/igor/Documents/RealEstate and use https://github.com/IgorGanapolsky/RealEstate";
    expect(evaluateCloudPromptToolPolicy(prompt)).toEqual({ allowed: true });

    const executionPrompt = buildHostedExecutionPrompt(prompt);
    expect(executionPrompt).toContain("https://github.com/IgorGanapolsky/RealEstate");
    expect(executionPrompt).toContain("fenced VPS");
    expect(executionPrompt).toContain("Clone or fetch");
    expect(executionPrompt).not.toContain("/Users/igor/Documents/RealEstate");
    expect(executionPrompt).not.toContain("paired");

    const pullsPrompt = buildHostedExecutionPrompt(
      "use /Users/igor/RealEstate and inspect https://github.com/IgorGanapolsky/RealEstate/pulls",
    );
    expect(pullsPrompt).toContain("Repository: https://github.com/IgorGanapolsky/RealEstate");
    expect(pullsPrompt).toContain("/pulls");

    const suffixPrompt = buildHostedExecutionPrompt(
      "In /Users/me/project, fix issue 42 in https://github.com/acme/project",
    );
    expect(suffixPrompt).toContain("fix issue 42");
    expect(suffixPrompt).not.toContain("/Users/me/project");
  });

  it("neutralizes an earlier local-only message even when another turn supplies a repository", async () => {
    const { buildHostedExecutionPrompt } = await import("./cloud-tool-policy");
    const prior = buildHostedExecutionPrompt("inspect /Users/me/Desktop/private.txt");
    expect(prior).toContain("local-only path");
    expect(prior).not.toContain("/Users/me/Desktop/private.txt");
  });

  it("does NOT block VPS-local or relative paths (no false positive)", () => {
    expect(evaluateCloudPromptToolPolicy("read ./src/index.ts and fix the bug").allowed).toBe(true);
    expect(evaluateCloudPromptToolPolicy("cat /home/runner/work/repo/file.ts").allowed).toBe(true);
    expect(evaluateCloudPromptToolPolicy("check /tmp/output.log for the stack trace").allowed).toBe(true);
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
