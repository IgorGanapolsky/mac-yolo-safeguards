import { describe, expect, it } from "vitest";
import {
  admitDescriptionChain,
  attachAcademyDiscernment,
  gradeDiscernment,
  requireCoworkHandoff,
} from "./hosted-academy-4d";

describe("hosted-academy-4d", () => {
  it("lets chat skip the Description chain", () => {
    const chat = admitDescriptionChain({ kind: "chat" });
    expect(chat.ok).toBe(true);
    if (chat.ok) expect(chat.reason).toBe("chat_skip");
  });

  it("refuses hosted execute without observable ACs", () => {
    const denied = admitDescriptionChain({ kind: "execute" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe("description_missing");
  });

  it("admits execute when done + 1-5 ACs each have a proof surface", () => {
    const ok = admitDescriptionChain({
      kind: "execute",
      done: "Newest bubble sits next to the composer.",
      acceptance: [
        { criterion: "oldest first", proofSurface: "dashboard conversation test" },
      ],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.acceptanceCount).toBe(1);
  });

  it("denies Cowork whole-task handoff missing workspace/context/deliverable", () => {
    const denied = requireCoworkHandoff({ workspace: "hosted-vps" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.missing).toEqual(["context", "deliverable"]);
  });

  it("treats completed without five supported lenses as claimed_done not ship", () => {
    const grade = gradeDiscernment({ status: "completed", externalCheckPassed: true });
    expect(grade.outcome).toBe("claimed_done");
    expect(grade.liveClaim).toBe(false);
    expect(grade.diligenceCall).toBe("fix");
    expect(grade.completedIsNotQuality).toBe(true);
  });

  it("ships only when every lens is supported and an external check passed", () => {
    const grade = gradeDiscernment({
      status: "completed",
      externalCheckPassed: true,
      lenses: {
        correctness: "supported",
        quality: "supported",
        fit: "supported",
        experience: "supported",
        responsibility: "supported",
      },
    });
    expect(grade.diligenceCall).toBe("ship");
    expect(grade.liveClaim).toBe(true);
    expect(grade.outcome).toBe("done");
  });

  it("stops when the responsibility lens is unsupported", () => {
    expect(
      gradeDiscernment({
        lenses: { responsibility: "unsupported" },
      }).diligenceCall,
    ).toBe("stop");
  });

  it("does not ship a failed execution even when an external check passed", () => {
    const grade = gradeDiscernment({
      status: "failed",
      externalCheckPassed: true,
      lenses: {
        correctness: "supported",
        quality: "supported",
        fit: "supported",
        experience: "supported",
        responsibility: "supported",
      },
    });
    expect(grade.diligenceCall).toBe("fix");
    expect(grade.liveClaim).toBe(false);
    expect(grade.outcome).not.toBe("done");
  });

  it("does not treat receipt outcome done as academy ship without lenses", () => {
    const attached = attachAcademyDiscernment({
      outcome: "done",
      externalCheck: { passed: true },
    });
    expect(attached.liveClaim).toBe(false);
    expect(attached.diligenceCall).toBe("fix");
  });
});
