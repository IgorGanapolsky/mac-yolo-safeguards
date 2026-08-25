/**
 * Hosted Academy 4D — Claude Academy process steal for thumbgate.app.
 * Keep in lockstep with tools/hosted-academy-4d.js.
 * Not Academy courses, not Claude Cowork/Code/Tag.
 */

export const HOSTED_ACADEMY_4D_SCHEMA = "hosted-academy-4d/v1";
export const ACADEMY_LENSES = [
  "correctness",
  "quality",
  "fit",
  "experience",
  "responsibility",
] as const;

export type AcademyLens = (typeof ACADEMY_LENSES)[number];
export type DiligenceCall = "ship" | "fix" | "stop";

export type DescriptionAdmission =
  | {
      ok: true;
      reason: "chat_skip" | "ok";
      descriptionRequired: boolean;
      liveClaim: false;
      done?: string;
      acceptanceCount?: number;
    }
  | {
      ok: false;
      reason: "description_missing" | "acceptance_count" | "acceptance_incomplete";
      descriptionRequired: true;
      liveClaim: false;
      message: string;
    };

export type CoworkHandoff =
  | {
      ok: true;
      reason: "ok";
      liveClaim: false;
      workspace: string;
      context: string;
      deliverable: string;
    }
  | {
      ok: false;
      reason: "cowork_incomplete";
      missing: string[];
      liveClaim: false;
      message: string;
    };

export type DiscernmentGrade = {
  ok: true;
  completedIsNotQuality: true;
  lenses: Record<AcademyLens, string>;
  unsupported: AcademyLens[];
  externalCheckPassed: boolean;
  diligenceCall: DiligenceCall;
  liveClaim: boolean;
  quality: "supported" | "claimed_only";
  outcome: "done" | "claimed_done" | "open";
};

function isChatKind(kind: string | undefined): boolean {
  const k = String(kind || "chat").toLowerCase();
  return k === "chat" || k === "ask" || k === "summarize";
}

export function admitDescriptionChain(input: {
  kind?: string;
  done?: string;
  acceptance?: Array<{ criterion?: string; proofSurface?: string; proof?: string }>;
} = {}): DescriptionAdmission {
  const kind = String(input.kind || "chat").toLowerCase();
  if (isChatKind(kind)) {
    return { ok: true, reason: "chat_skip", descriptionRequired: false, liveClaim: false };
  }
  const done = String(input.done || "").trim();
  const acceptance = Array.isArray(input.acceptance) ? input.acceptance : [];
  if (!done) {
    return {
      ok: false,
      reason: "description_missing",
      descriptionRequired: true,
      liveClaim: false,
      message:
        "Hosted execute needs one-sentence done plus 1–5 observable ACs before the VPS acts.",
    };
  }
  if (acceptance.length < 1 || acceptance.length > 5) {
    return {
      ok: false,
      reason: "acceptance_count",
      descriptionRequired: true,
      liveClaim: false,
      message: "Description chain needs 1–5 observable acceptance criteria.",
    };
  }
  for (const ac of acceptance) {
    const criterion = String(ac?.criterion || "").trim();
    const proof = String(ac?.proofSurface || ac?.proof || "").trim();
    if (!criterion || !proof) {
      return {
        ok: false,
        reason: "acceptance_incomplete",
        descriptionRequired: true,
        liveClaim: false,
        message: "Each AC needs an observable criterion and a named proof surface.",
      };
    }
  }
  return {
    ok: true,
    reason: "ok",
    descriptionRequired: true,
    liveClaim: false,
    done,
    acceptanceCount: acceptance.length,
  };
}

const EXECUTE_KINDS = new Set(["execute", "run", "agent", "task"]);

/**
 * Admission-path wrapper. Composer/chat clients omit `kind` and stay on
 * chat_skip. Explicit execute-class kinds must pass done + ACs before persist.
 */
export function admitHostedTaskDescription(input: {
  kind?: string;
  done?: string;
  acceptance?: Array<{ criterion?: string; proofSurface?: string; proof?: string }>;
} = {}): DescriptionAdmission {
  const raw = String(input.kind || "chat").toLowerCase();
  const kind = EXECUTE_KINDS.has(raw) ? "execute" : raw;
  return admitDescriptionChain({
    kind,
    done: input.done,
    acceptance: input.acceptance,
  });
}

export function requireCoworkHandoff(input: {
  workspace?: string;
  context?: string;
  deliverable?: string;
} = {}): CoworkHandoff {
  const workspace = String(input.workspace || "").trim();
  const context = String(input.context || "").trim();
  const deliverable = String(input.deliverable || "").trim();
  const missing: string[] = [];
  if (!workspace) missing.push("workspace");
  if (!context) missing.push("context");
  if (!deliverable) missing.push("deliverable");
  if (missing.length) {
    return {
      ok: false,
      reason: "cowork_incomplete",
      missing,
      liveClaim: false,
      message: "Whole-task hosted handoff needs workspace, context, and deliverable.",
    };
  }
  return { ok: true, reason: "ok", liveClaim: false, workspace, context, deliverable };
}

export function gradeDiscernment(input: {
  lenses?: Partial<Record<AcademyLens, string>>;
  externalCheckPassed?: boolean;
  status?: string;
} = {}): DiscernmentGrade {
  const lensesIn = input.lenses || {};
  const lenses = {} as Record<AcademyLens, string>;
  const unsupported: AcademyLens[] = [];
  for (const name of ACADEMY_LENSES) {
    const v = String(lensesIn[name] || "unknown");
    lenses[name] = v;
    if (v !== "supported") unsupported.push(name);
  }
  const externalCheckPassed = Boolean(input.externalCheckPassed);
  const status = String(input.status || "");
  const failed = status === "failed" || status === "claimed_failed";
  const completed = status === "completed" || status === "done";

  let diligenceCall: DiligenceCall = "fix";
  if (lenses.responsibility === "unsupported") diligenceCall = "stop";
  else if (failed) diligenceCall = "fix";
  else if (completed && unsupported.length === 0 && externalCheckPassed) diligenceCall = "ship";

  const liveClaim = diligenceCall === "ship";
  let outcome: DiscernmentGrade["outcome"] = "open";
  if (failed) outcome = "open";
  else if (liveClaim) outcome = "done";
  else if (completed || status === "claimed_done") outcome = "claimed_done";
  return {
    ok: true,
    completedIsNotQuality: true,
    lenses,
    unsupported,
    externalCheckPassed,
    diligenceCall,
    liveClaim,
    quality: liveClaim ? "supported" : "claimed_only",
    outcome,
  };
}

export function attachAcademyDiscernment(receiptLike: {
  outcome?: string;
  externalCheck?: { passed?: boolean | null } | null;
  lenses?: Partial<Record<AcademyLens, string>>;
}): DiscernmentGrade {
  const outcome = String(receiptLike?.outcome || "");
  const externalCheckPassed = Boolean(receiptLike?.externalCheck && receiptLike.externalCheck.passed === true);
  return gradeDiscernment({
    status: outcome,
    externalCheckPassed,
    lenses: receiptLike?.lenses,
  });
}
