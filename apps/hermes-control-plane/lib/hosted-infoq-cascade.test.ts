import { describe, expect, it } from "vitest";
import {
  admitHostedInfoqCascade,
  CASCADE_FAULT,
  evaluateHostedInfoqCascade,
  isolateAdmissionStep,
} from "./hosted-infoq-cascade";

describe("evaluateHostedInfoqCascade", () => {
  it("allows ordinary hosted chat and docs questions", () => {
    expect(evaluateHostedInfoqCascade("Summarize the last commits and open a PR draft.").allowed).toBe(true);
    expect(
      evaluateHostedInfoqCascade("Explain Cloudflare WriteGuard and Next.js 16.3 Instant Navigations.").allowed,
    ).toBe(true);
    expect(evaluateHostedInfoqCascade("What is Photon vs BlueBubbles in the Nous docs?").allowed).toBe(true);
  });

  it("blocks critical WriteGuard-mapped intents on the fenced VPS", () => {
    expect(evaluateHostedInfoqCascade("git push --force origin main")).toMatchObject({
      allowed: false,
      code: "force_push",
    });
    expect(evaluateHostedInfoqCascade("wrangler deploy the Worker to production from this chat")).toMatchObject({
      allowed: false,
      code: "production_deploy",
    });
    expect(
      evaluateHostedInfoqCascade("text them via Photon iMessage using hermes photon setup"),
    ).toMatchObject({ allowed: false, code: "photon_imessage" });
  });

  it("blocks live secret shapes without sending them to the runner", () => {
    const r = evaluateHostedInfoqCascade(`charge this card ${["sk", "live", "exampleSecretValue99"].join("_")}`);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.code).toBe("secret_shape");
      expect(r.message).toMatch(/Rotate/);
    }
  });

  it("fail-closes an isolated admission step instead of cascading a throw", () => {
    expect(
      isolateAdmissionStep(() => {
        throw new Error("filter boom");
      }, CASCADE_FAULT),
    ).toMatchObject({ allowed: false, code: "cascade_fault" });
    expect(admitHostedInfoqCascade("git push --force origin main")).toMatchObject({
      allowed: false,
      code: "force_push",
    });
    expect(admitHostedInfoqCascade("Summarize the last commits and open a PR draft.").allowed).toBe(true);
  });
});
