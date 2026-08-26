import { describe, expect, it } from "vitest";
import {
  attachLastMileToReceipt,
  classifyFoundation,
  gradeLastMile,
  stableJobUrl,
} from "./hosted-last-mile.ts";

describe("hosted last-mile", () => {
  it("treats Tower/Mac as a rented foundation", () => {
    expect(classifyFoundation("tower")).toBe("rented");
    expect(classifyFoundation("vps")).toBe("owned");
    const rented = gradeLastMile({
      executor: "motherduck",
      generatedByAgent: true,
      sandbox: true,
      schedule: "once",
      credentialsBound: true,
      taskId: "t1",
    });
    expect(rented.lastMileComplete).toBe(false);
    expect(rented.reasons).toContain("cannot_rent_foundation");
    expect(rented.liveClaim).toBe(false);
  });

  it("requires sandbox, schedule, and credentials when an agent wrote the code", () => {
    const grade = gradeLastMile({
      executor: "vps",
      generatedByAgent: true,
    });
    expect(grade.status).toBe("LAST_MILE_INCOMPLETE");
    expect(grade.reasons).toEqual(
      expect.arrayContaining([
        "agent_wrote_code_missing_sandbox",
        "agent_wrote_code_missing_schedule",
        "agent_wrote_code_missing_credentials",
        "missing_stable_job_url",
      ]),
    );
  });

  it("issues a stable dashboard URL and never claims LIVE", () => {
    expect(stableJobUrl("abc")).toBe("https://thumbgate.app/dashboard?task=abc");
    const attach = attachLastMileToReceipt({
      runtime: "vps",
      sandbox: true,
      schedule: "once",
      credentialsBound: true,
      generatedByAgent: true,
      taskId: "abc",
      workerLive: true,
    });
    expect(attach.stableUrl).toBe("https://thumbgate.app/dashboard?task=abc");
    expect(attach.lastMileComplete).toBe(true);
    expect(attach.liveClaim).toBe(false);
    expect(attach.clonedTower).toBe(false);
  });

  it("does not treat the New Stack article as production", () => {
    const talk = gradeLastMile({
      blogUrl: "https://thenewstack.io/motherduck-tower-acquisition-python/",
      executor: "vps",
      sandbox: true,
      schedule: "once",
      credentialsBound: true,
      taskId: "talk",
    });
    expect(talk.lastMileComplete).toBe(false);
    expect(talk.reasons).toContain("talk_is_not_production");
  });
});
