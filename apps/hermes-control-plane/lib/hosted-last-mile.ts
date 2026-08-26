/**
 * Hosted last-mile — MotherDuck/Tower process steal for thumbgate.app.
 * Keep in lockstep with tools/hosted-tower-last-mile.js.
 * Not Tower.dev, not MotherDuck, not DuckDB, not Flights.
 */

export const HOSTED_LAST_MILE_SCHEMA = "hosted-last-mile/v1" as const;
export const STABLE_ORIGIN = "https://thumbgate.app";
const TALK_RE = /thenewstack\.io|motherduck\.com|tower\.dev|control\.tower\.dev/i;
const RENTED_RE =
  /\b(tower|motherduck|flights|duckling|e2b|openclaw|laptop|macbook|device)\b/i;
const OWNED_RE = /^(vps|cloud|hosted-vps|fenced-vps|hosted)$/i;
const PIPELINE_SKU_RE =
  /\b(tower control|python pipeline runtime|managed runtime for python|duckdb warehouse)\b/i;

export type LastMileFoundation = "owned" | "rented" | "unknown";
export type LastMileSchedule = "once" | "cron" | "none";
export type LastMileStatus = "NOT_LIVE" | "LAST_MILE_INCOMPLETE" | "NOT_OFFERED";

export type LastMileInput = {
  executor?: string | null;
  runtime?: string | null;
  sandbox?: boolean | "fenced-vps";
  schedule?: LastMileSchedule | boolean;
  scheduled?: boolean;
  credentialsBound?: boolean;
  credentials?: string;
  generatedByAgent?: boolean;
  taskId?: string | null;
  origin?: string;
  blogUrl?: string;
  talkUrl?: string;
  claimedProduct?: string;
  prompt?: string;
  workerLive?: boolean;
};

export type LastMileAttach = {
  schema: typeof HOSTED_LAST_MILE_SCHEMA;
  foundation: LastMileFoundation;
  sandbox: "fenced-vps" | "none";
  schedule: LastMileSchedule;
  credentials: "vps-bound" | "unbound";
  stableUrl: string | null;
  lastMileComplete: boolean;
  liveClaim: false;
  clonedTower: false;
  status: LastMileStatus;
  reason: string;
};

export function classifyFoundation(executor?: string | null): LastMileFoundation {
  const value = String(executor || "").trim();
  if (OWNED_RE.test(value)) return "owned";
  if (RENTED_RE.test(value)) return "rented";
  return "unknown";
}

export function stableJobUrl(taskId?: string | null, origin = STABLE_ORIGIN): string | null {
  const id = String(taskId || "").trim();
  if (!id || /[/?#\s]/.test(id)) return null;
  const base = String(origin || STABLE_ORIGIN).replace(/\/+$/, "");
  return `${base}/dashboard?task=${encodeURIComponent(id)}`;
}

export function gradeLastMile(input: LastMileInput = {}) {
  const reasons: string[] = [];
  if (TALK_RE.test(String(input.blogUrl || input.talkUrl || ""))) {
    reasons.push("talk_is_not_production");
  }
  if (PIPELINE_SKU_RE.test(String(input.claimedProduct || input.prompt || ""))) {
    reasons.push("pipeline_sku_not_offered");
  }

  const foundation = classifyFoundation(input.executor || input.runtime);
  if (foundation === "rented") reasons.push("cannot_rent_foundation");
  if (foundation === "unknown") reasons.push("foundation_unknown");

  const sandboxOn = input.sandbox === true || input.sandbox === "fenced-vps";
  const scheduleKind: LastMileSchedule =
    input.schedule === "cron"
      ? "cron"
      : input.schedule === "once" || input.scheduled === true || input.schedule === true
        ? "once"
        : "none";
  const credentialsBound = input.credentialsBound === true || input.credentials === "vps-bound";
  const generated = input.generatedByAgent === true;
  if (generated && !sandboxOn) reasons.push("agent_wrote_code_missing_sandbox");
  if (generated && scheduleKind === "none") reasons.push("agent_wrote_code_missing_schedule");
  if (generated && !credentialsBound) reasons.push("agent_wrote_code_missing_credentials");

  const url = stableJobUrl(input.taskId, input.origin);
  if (String(input.taskId || "").trim() && !url) reasons.push("unstable_job_url");
  if (!url) reasons.push("missing_stable_job_url");

  const lastMileComplete =
    foundation === "owned" &&
    sandboxOn &&
    scheduleKind !== "none" &&
    credentialsBound &&
    Boolean(url) &&
    !reasons.includes("pipeline_sku_not_offered") &&
    !reasons.includes("talk_is_not_production") &&
    !reasons.includes("cannot_rent_foundation");

  let status: LastMileStatus = "NOT_LIVE";
  if (reasons.includes("pipeline_sku_not_offered")) status = "NOT_OFFERED";
  else if (!lastMileComplete && !reasons.includes("talk_is_not_production")) {
    status = "LAST_MILE_INCOMPLETE";
  }

  return {
    schema: HOSTED_LAST_MILE_SCHEMA,
    clonedTower: false as const,
    workerLive: false as const,
    capturedRevenueUsd: 0 as const,
    liveClaim: false as const,
    foundation,
    sandbox: sandboxOn ? ("fenced-vps" as const) : ("none" as const),
    schedule: scheduleKind,
    credentials: credentialsBound ? ("vps-bound" as const) : ("unbound" as const),
    stableUrl: url,
    lastMileComplete,
    status,
    reasons,
  };
}

export function attachLastMileToReceipt(input: LastMileInput = {}): LastMileAttach {
  const grade = gradeLastMile(input);
  return {
    schema: grade.schema,
    foundation: grade.foundation,
    sandbox: grade.sandbox,
    schedule: grade.schedule,
    credentials: grade.credentials,
    stableUrl: grade.stableUrl,
    lastMileComplete: grade.lastMileComplete,
    liveClaim: false,
    clonedTower: false,
    status: grade.status,
    reason:
      grade.reasons[0] || (grade.lastMileComplete ? "owned_fenced_vps_once" : "last_mile_incomplete"),
  };
}
