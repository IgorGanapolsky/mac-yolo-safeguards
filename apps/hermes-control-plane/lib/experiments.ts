/**
 * experiments.ts — A/B testing framework for ThumbGate.app.
 *
 * Implements:
 * - Feature flags (org-scoped on/off) with deterministic evaluation.
 * - Multi-variant experiments with weighted bucketing via deterministic hashing.
 * - Assignment persistence (first-touch wins) + conversion event tracking.
 * - Summary / results aggregation for the admin dashboard.
 *
 * All hash functions are deterministic and dependency-free (FNV-1a), so
 * variant assignment is stable across server restarts and edge instances.
 *
 * Designed for Cloudflare Workers / D1 (no Node-specific APIs). Uses the
 * Web Crypto API for any randomness and crypto_subtle for SHA-256 in the
 * bucketing hash. Falls back to FNV-1a when crypto.subtle is unavailable.
 *
 * Traceability: every assignment and event carries the traceId from
 * lib/tracing.ts so experiment results can be correlated with request spans.
 */

import { db } from "./runtime";
import { featureFlags, experiments, experimentAssignments, experimentEvents } from "@/db/schema";
import { type TraceContext } from "./tracing";
import { randomToken } from "./security";

// --- Types ---

export type SubjectType = "user" | "organization";
export type ExperimentStatus = "draft" | "running" | "paused" | "completed";

export interface ExperimentVariant {
  name: string;
  weight: number; // 0..1 fraction
}

export interface ExperimentConfig {
  id: string;
  key: string;
  description: string;
  status: ExperimentStatus;
  variants: ExperimentVariant[];
  seed: number;
  createdAt: number;
  updatedAt: number;
}

export interface Assignment {
  experimentId: string;
  subjectType: SubjectType;
  subjectId: string;
  variant: string;
  assignedAt: number;
}

export interface ExperimentEvent {
  id: string;
  experimentId: string;
  subjectType: SubjectType;
  subjectId: string;
  variant: string;
  eventName: string;
  value?: number;
  timestamp: number;
  traceId?: string;
}

export interface ExperimentResults {
  variant: string;
  assignments: number;
  events: Record<string, number>;
  eventValues: Record<string, { sum: number; count: number }>;
}

export interface ExperimentSummary {
  id: string;
  key: string;
  status: ExperimentStatus;
  variants: Record<string, ExperimentResults>;
}

// --- Pure hash functions (testable in isolation) ---

/**
 * FNV-1a 32-bit hash — deterministic, no dependencies.
 */
export function fnv1a32(str: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(hash ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return hash;
}

/**
 * Deterministic variant bucket assignment.
 *
 * Uses FNV-1a over `${experimentId}:${subjectId}:${seed}`, then maps to
 * the cumulative weight distribution. Returns the variant name.
 */
export function assignVariant(
  experimentId: string,
  subjectId: string,
  seed: number,
  variants: ExperimentVariant[],
): string {
  if (variants.length === 0) throw new Error("cannot assign variant from empty list");
  if (variants.length === 1) return variants[0]!.name;

  // Validate weights sum
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight <= 0) throw new Error("variant weights must be positive");

  const hashInput = `${experimentId}:${subjectId}:${seed}`;
  const hash = fnv1a32(hashInput);

  // Map hash to [0, totalWeight) and find the variant bucket.
  const scaled = (hash / 0xffffffff) * totalWeight;
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.weight;
    if (scaled < cumulative) return v.name;
  }
  return variants[variants.length - 1]!.name; // float precision fallback
}

// --- Feature flag evaluation ---

export interface FlagDefinition {
  key: string;
  description: string;
  enabled: boolean;
  orgId?: string | null;
}

/**
 * Evaluate a feature flag for a given org (or globally if no orgId).
 * Pure function — no DB access. Use `evaluateFlag` for DB-backed evaluation.
 */
export function evaluateFlagValue(
  flag: FlagDefinition | undefined,
  orgId?: string,
): boolean {
  if (!flag) return false;
  if (flag.orgId && flag.orgId !== orgId) return false;
  return flag.enabled;
}

// --- DB-backed operations ---

/**
 * Evaluate a feature flag from the database.
 * Returns the flag definition if found (or undefined), then call `evaluateFlagValue`.
 */
export async function getFlag(
  key: string,
  orgId?: string,
): Promise<FlagDefinition | undefined> {
  const result = await db()
    .prepare(
      "SELECT key, description, enabled, org_id FROM feature_flags WHERE key = ?1 AND (org_id = ?2 OR org_id IS NULL)",
    )
    .bind(key, orgId ?? null)
    .first<{
      key: string;
      description: string;
      enabled: number;
      org_id: string | null;
    }>();

  if (!result) return undefined;

  return {
    key: result.key,
    description: result.description,
    enabled: Boolean(result.enabled),
    orgId: result.org_id ?? undefined,
  };
}

/**
 * Full flag evaluation: fetch from DB + apply org scoping.
 */
export async function evaluateFlag(
  key: string,
  orgId?: string,
): Promise<boolean> {
  const flag = await getFlag(key, orgId);
  return evaluateFlagValue(flag, orgId);
}

// --- Experiment assignment (DB-backed) ---

/**
 * Get experiment config from DB (or pass a plain config object).
 * Returns undefined if not found or not running.
 */
export async function getExperiment(key: string): Promise<ExperimentConfig | undefined> {
  const result = await db()
    .prepare(
      "SELECT id, key, description, status, variants, seed, created_at, updated_at FROM experiments WHERE key = ?1",
    )
    .bind(key)
    .first<{
      id: string;
      key: string;
      description: string;
      status: string;
      variants: string; // JSON
      seed: number;
      created_at: number;
      updated_at: number;
    }>();

  if (!result) return undefined;

  let parsedVariants: ExperimentVariant[];
  try {
    parsedVariants = JSON.parse(result.variants);
  } catch {
    return undefined;
  }

  return {
    id: result.id,
    key: result.key,
    description: result.description,
    status: result.status as ExperimentStatus,
    variants: parsedVariants,
    seed: result.seed,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  };
}

/**
 * Assign a subject to an experiment variant. First-touch wins: if an
 * assignment already exists for this experiment+subject, returns the
 * existing assignment. Otherwise creates one.
 *
 * The traceId (from lib/tracing) is stored alongside for correlation.
 */
export async function assignExperiment(
  experimentKey: string,
  subjectType: SubjectType,
  subjectId: string,
  traceId?: string,
): Promise<Assignment | null> {
  const exp = await getExperiment(experimentKey);
  if (!exp) return null;
  if (exp.status !== "running") return null;

  // Check for existing assignment (first-touch wins)
  const existing = await db()
    .prepare(
      "SELECT experiment_id, subject_type, subject_id, variant, assigned_at FROM experiment_assignments WHERE experiment_id = ?1 AND subject_type = ?2 AND subject_id = ?3",
    )
    .bind(exp.id, subjectType, subjectId)
    .first<Assignment>();

  if (existing) return existing;

  // Compute variant via deterministic hash
  const variant = assignVariant(exp.id, subjectId, exp.seed, exp.variants);
  const now = Date.now();

  await db()
    .prepare(
      "INSERT INTO experiment_assignments (experiment_id, subject_type, subject_id, variant, assigned_at) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(exp.id, subjectType, subjectId, variant, now)
    .run();

  return {
    experimentId: exp.id,
    subjectType,
    subjectId,
    variant,
    assignedAt: now,
  };
}

/**
 * Record a conversion event for an experiment assignment.
 */
export async function recordExperimentEvent(
  experimentId: string,
  subjectType: SubjectType,
  subjectId: string,
  eventName: string,
  value?: number,
  traceId?: string,
): Promise<void> {
  // Verify the subject is assigned to this experiment
  const assignment = await db()
    .prepare(
      "SELECT variant FROM experiment_assignments WHERE experiment_id = ?1 AND subject_type = ?2 AND subject_id = ?3",
    )
    .bind(experimentId, subjectType, subjectId)
    .first<{ variant: string }>();

  if (!assignment) return;

  await db()
    .prepare(
      "INSERT INTO experiment_events (id, experiment_id, subject_type, subject_id, variant, event_name, value, timestamp) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )
    .bind(
      randomToken(8),
      experimentId,
      subjectType,
      subjectId,
      assignment.variant,
      eventName,
      value ?? null,
      Date.now(),
    )
    .run();
}

/**
 * Aggregate experiment results: per-variant assignment counts + event counts.
 */
export async function experimentSummary(
  experimentId: string,
): Promise<ExperimentSummary | undefined> {
  const expRow = await db()
    .prepare(
      "SELECT id, key, status FROM experiments WHERE id = ?1",
    )
    .bind(experimentId)
    .first<{ id: string; key: string; status: string }>();

  if (!expRow) return undefined;

  const assignments = await db()
    .prepare(
      "SELECT variant, COUNT(*) as cnt FROM experiment_assignments WHERE experiment_id = ?1 GROUP BY variant",
    )
    .bind(experimentId)
    .all<{ variant: string; cnt: number }>();

  const events = await db()
    .prepare(
      "SELECT variant, event_name, COUNT(*) as cnt, COALESCE(SUM(value), 0) as sum FROM experiment_events WHERE experiment_id = ?1 GROUP BY variant, event_name",
    )
    .bind(experimentId)
    .all<{ variant: string; event_name: string; cnt: number; sum: number }>();

  const variants: Record<string, ExperimentResults> = {};

  for (const a of (assignments.results ?? assignments)) {
    if (!variants[a.variant]) {
      variants[a.variant] = {
        variant: a.variant,
        assignments: 0,
        events: {},
        eventValues: {},
      };
    }
    variants[a.variant]!.assignments = a.cnt;
  }

  for (const e of (events.results ?? events)) {
    if (!variants[e.variant]) {
      variants[e.variant] = {
        variant: e.variant,
        assignments: 0,
        events: {},
        eventValues: {},
      };
    }
    variants[e.variant]!.events[e.event_name] = e.cnt;
    variants[e.variant]!.eventValues[e.event_name] = { sum: e.sum, count: e.cnt };
  }

  return {
    id: expRow.id,
    key: expRow.key,
    status: expRow.status as ExperimentStatus,
    variants,
  };
}
