import { describe, expect, it } from "vitest";
import { evaluateCloudPromptToolPolicy, LOCAL_ONLY_PROMPT_PATTERNS } from "./cloud-tool-policy";

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

  it("blocks macOS UI helpers, simctl, Chrome profile, and docker.sock", () => {
    expect(evaluateCloudPromptToolPolicy("open -a 'Google Chrome' and click Publish")).toMatchObject({
      allowed: false,
      matched: "macos_ui",
    });
    expect(evaluateCloudPromptToolPolicy("xcrun simctl boot 'iPhone 16'")).toMatchObject({
      allowed: false,
      matched: "simctl",
    });
    expect(evaluateCloudPromptToolPolicy("Drive the logged-in Chrome profile via claude-in-chrome")).toMatchObject({
      allowed: false,
      matched: "browser_profile",
    });
    expect(evaluateCloudPromptToolPolicy("curl --unix-socket /var/run/docker.sock http://localhost/containers/json")).toMatchObject({
      allowed: false,
      matched: "local_docker_sock",
    });
  });

  it("keeps every LOCAL_ONLY pattern id unique", () => {
    const ids = LOCAL_ONLY_PROMPT_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
