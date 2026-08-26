/**
 * Hosted cost isolation — MotherDuck homepage process steal for thumbgate.app.
 * Keep in lockstep with tools/hosted-motherduck-cost-isolation.js.
 * Not MotherDuck, DuckDB, Ducklings, Flights, Dives, or JWT mint.
 */

export const HOSTED_COST_ISOLATION_SCHEMA = "hosted-cost-isolation/v1" as const;
export const BOUND_SKU = "hosted-10" as const;
export const SKU_CAP_USD = 10 as const;
export const SOURCE = "https://motherduck.com/";

const TALK_RE = /motherduck\.com|thenewstack\.io|tower\.dev/i;
const FOREIGN_SKU_RE =
  /\b(giga|duckling|duckdb|warehouse|flights|dives|iceberg|motherduck|python pipeline)\b/i;
const BOUND_SKU_RE = /^(hosted-10|hosted|vps|fenced-vps|hosted-vps|\$?10)$/i;
const DUCKLING_ISOLATION_RE = /\b(duckling|per-agent|hypertenan|own isolated)\b/i;
const JWT_MINT_RE = /new\.motherduck\.com/i;

export type IsolationSku = "hosted-10" | "foreign" | "unknown";
export type IsolationMode = "shared-fenced-vps" | "claimed-duckling" | "unknown";
export type IsolationStatus = "NOT_LIVE" | "ISOLATION_INCOMPLETE" | "NOT_OFFERED";

export type CostIsolationInput = {
  requestedSku?: string | null;
  claimedProduct?: string | null;
  sku?: string | null;
  requestedUsd?: number | null;
  claimedIsolation?: string | null;
  isolation?: string | null;
  claimedIdleShutdown?: boolean;
  claimedIdleShutdownMs?: number | null;
  agentTenantId?: string | null;
  boundTenantId?: string | null;
  blogUrl?: string | null;
  talkUrl?: string | null;
  homepageUrl?: string | null;
  prompt?: string | null;
  mintUrl?: string | null;
};

export type CostIsolationAttach = {
  schema: typeof HOSTED_COST_ISOLATION_SCHEMA;
  boundSku: typeof BOUND_SKU;
  skuCapUsd: typeof SKU_CAP_USD;
  isolation: "shared-fenced-vps" | "claimed-duckling";
  idleShutdownImplemented: false;
  isolated: boolean;
  liveClaim: false;
  clonedMotherDuck: false;
  clonedDucklings: false;
  status: IsolationStatus;
  reason: string;
};

export type AgentFacingCatalog = {
  motherduckMcp: false;
  fuzzyWarehouseCatalog: false;
  summarizeCommentGuidelines: false;
  divesShares: false;
  hostedChat: true;
  hostedApprovals: true;
  fencedVps: true;
  boundSku: typeof BOUND_SKU;
  costIsolationAnalog: true;
};

export function classifySku(requested?: string | null): IsolationSku {
  const value = String(requested || "").trim();
  if (!value) return "hosted-10";
  if (BOUND_SKU_RE.test(value)) return "hosted-10";
  if (FOREIGN_SKU_RE.test(value)) return "foreign";
  return "unknown";
}

export function isolationMode(claimed?: string | null): IsolationMode {
  const value = String(claimed || "").trim();
  if (!value) return "shared-fenced-vps";
  if (DUCKLING_ISOLATION_RE.test(value)) return "claimed-duckling";
  if (/shared|fenced|vps/i.test(value)) return "shared-fenced-vps";
  return "unknown";
}

export function agentFacingCatalog(): AgentFacingCatalog {
  return {
    motherduckMcp: false,
    fuzzyWarehouseCatalog: false,
    summarizeCommentGuidelines: false,
    divesShares: false,
    hostedChat: true,
    hostedApprovals: true,
    fencedVps: true,
    boundSku: BOUND_SKU,
    costIsolationAnalog: true,
  };
}

export function gradeCostIsolation(input: CostIsolationInput = {}) {
  const reasons: string[] = [];
  if (TALK_RE.test(String(input.blogUrl || input.talkUrl || input.homepageUrl || ""))) {
    reasons.push("talk_is_not_production");
  }
  if (JWT_MINT_RE.test(String(input.claimedProduct || input.prompt || input.mintUrl || ""))) {
    reasons.push("jwt_mint_not_offered");
  }

  const sku = classifySku(input.requestedSku || input.claimedProduct || input.sku);
  if (sku === "foreign") reasons.push("sku_not_offered");
  if (sku === "unknown") reasons.push("sku_unknown");

  const requestedUsd = Number(input.requestedUsd);
  if (Number.isFinite(requestedUsd) && requestedUsd > SKU_CAP_USD) {
    reasons.push("sku_cap_10");
  }

  const isolation = isolationMode(input.claimedIsolation || input.isolation);
  if (isolation === "claimed-duckling") reasons.push("not_per_agent_duckling");

  const idleMs = Number(input.claimedIdleShutdownMs);
  if (
    input.claimedIdleShutdown === true ||
    (Number.isFinite(idleMs) && idleMs > 0 && idleMs <= 1000)
  ) {
    reasons.push("idle_shutdown_not_duckling");
  }

  const agentTenant = String(input.agentTenantId || "").trim();
  const boundTenant = String(input.boundTenantId || "").trim();
  if (agentTenant && boundTenant && agentTenant !== boundTenant) {
    reasons.push("cross_tenant_sku_escalation");
  }

  const isolated =
    sku === "hosted-10" &&
    isolation === "shared-fenced-vps" &&
    !reasons.includes("sku_not_offered") &&
    !reasons.includes("sku_cap_10") &&
    !reasons.includes("not_per_agent_duckling") &&
    !reasons.includes("idle_shutdown_not_duckling") &&
    !reasons.includes("cross_tenant_sku_escalation") &&
    !reasons.includes("jwt_mint_not_offered") &&
    !reasons.includes("talk_is_not_production");

  let status: IsolationStatus = "NOT_LIVE";
  if (reasons.includes("sku_not_offered") || reasons.includes("jwt_mint_not_offered")) {
    status = "NOT_OFFERED";
  } else if (!isolated && !reasons.includes("talk_is_not_production")) {
    status = "ISOLATION_INCOMPLETE";
  }

  return {
    schema: HOSTED_COST_ISOLATION_SCHEMA,
    clonedMotherDuck: false as const,
    clonedDucklings: false as const,
    clonedFlights: false as const,
    clonedDives: false as const,
    workerLive: false as const,
    capturedRevenueUsd: 0 as const,
    liveClaim: false as const,
    boundSku: BOUND_SKU,
    skuCapUsd: SKU_CAP_USD,
    requestedSku: sku,
    isolation: isolation === "claimed-duckling" ? ("claimed-duckling" as const) : ("shared-fenced-vps" as const),
    idleShutdownImplemented: false as const,
    isolated,
    status,
    reasons,
    catalog: agentFacingCatalog(),
  };
}

export function attachCostIsolationToReceipt(input: CostIsolationInput = {}): CostIsolationAttach {
  const grade = gradeCostIsolation(input);
  return {
    schema: grade.schema,
    boundSku: grade.boundSku,
    skuCapUsd: grade.skuCapUsd,
    isolation: grade.isolation,
    idleShutdownImplemented: false,
    isolated: grade.isolated,
    liveClaim: false,
    clonedMotherDuck: false,
    clonedDucklings: false,
    status: grade.status,
    reason: grade.reasons[0] || (grade.isolated ? "hosted_10_shared_vps" : "isolation_incomplete"),
  };
}
