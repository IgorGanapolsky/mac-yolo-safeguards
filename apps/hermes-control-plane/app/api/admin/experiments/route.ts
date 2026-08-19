/**
 * API route for A/B testing experiment management.
 *
 * GET    /api/admin/experiments              — list all experiments + status
 * POST   /api/admin/experiments              — create a new experiment
 * GET    /api/admin/experiments/:key/results — get experiment results
 *
 * Requires admin auth (see lib/admin-auth.ts).
 * All operations carry traceId from tracing.ts for correlation with request spans.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentAdminSession } from "@/lib/admin-auth";
import { startSpan, endSpan, extractTraceContext, injectTraceContext, setAttribute, setError, traceparentFor, type TraceContext } from "@/lib/tracing";
import { db } from "@/lib/runtime";
import { experiments } from "@/db/schema";
import { randomToken } from "@/lib/security";
import type { ExperimentVariant } from "@/lib/experiments";

export async function GET(request: NextRequest) {
  const span = startSpan("GET /api/admin/experiments", extractTraceContext(request.headers), {
    "http.method": "GET",
    "http.target": request.nextUrl.pathname,
  });

  try {
    if (!(await currentAdminSession())) {
      setError(span, new Error("admin auth required"));
      return NextResponse.json({ error: "admin auth required" }, { status: 401 });
    }

    const url = new URL(request.url);
    const key = url.searchParams.get("key");

    if (key) {
      // Single experiment results
      const exp = await db()
        .prepare(
          "SELECT id, key, description, status, variants, seed, created_at, updated_at FROM experiments WHERE key = ?1",
        )
        .bind(key)
        .first<{ id: string; key: string; description: string; status: string; variants: string; seed: number; created_at: number; updated_at: number }>();

      if (!exp) {
        return NextResponse.json({ error: "experiment not found" }, { status: 404 });
      }

      // Aggregate results
      const assignments = await db()
        .prepare(
          "SELECT variant, COUNT(*) as cnt FROM experiment_assignments WHERE experiment_id = ?1 GROUP BY variant",
        )
        .bind(exp.id)
        .all<{ variant: string; cnt: number }>();

      const events = await db()
        .prepare(
          "SELECT variant, event_name, COUNT(*) as cnt FROM experiment_events WHERE experiment_id = ?1 GROUP BY variant, event_name",
        )
        .bind(exp.id)
        .all<{ variant: string; event_name: string; cnt: number }>();

      const variants: Record<string, { assignments: number; events: Record<string, number> }> = {};
      for (const v of JSON.parse(exp.variants) as ExperimentVariant[]) {
        variants[v.name] = { assignments: 0, events: {} };
      }
      for (const a of (assignments.results ?? assignments)) {
        if (!variants[a.variant]) variants[a.variant] = { assignments: 0, events: {} };
        variants[a.variant].assignments = a.cnt;
      }
      for (const e of (events.results ?? events)) {
        if (!variants[e.variant]) variants[e.variant] = { assignments: 0, events: {} };
        variants[e.variant].events[e.event_name] = e.cnt;
      }

      const response = {
        id: exp.id,
        key: exp.key,
        description: exp.description,
        status: exp.status,
        variants: JSON.parse(exp.variants),
        assignmentCounts: variants,
      };

      const ended = endSpan(span, "ok");
      const headers = new Headers();
      injectTraceContext(ended, headers);
      return NextResponse.json(response, { headers });
    }

    // List all experiments
    const all = await db()
      .prepare(
        "SELECT id, key, description, status, variants, seed, created_at, updated_at FROM experiments ORDER BY created_at DESC",
      )
      .all<{ id: string; key: string; description: string; status: string; variants: string; seed: number; created_at: number; updated_at: number }>();

    const response = (all.results ?? all).map((e) => ({
      id: e.id,
      key: e.key,
      description: e.description,
      status: e.status,
      variants: JSON.parse(e.variants),
      createdAt: e.created_at,
      updatedAt: e.updated_at,
    }));

    const ended = endSpan(span, "ok");
    const headers = new Headers();
    injectTraceContext(ended, headers);
    return NextResponse.json(response, { headers });
  } catch (err) {
    setError(span, err instanceof Error ? err : new Error(String(err)));
    const ended = endSpan(span, "error", err instanceof Error ? err.message : String(err));
    const headers = new Headers();
    injectTraceContext(ended, headers);
    return NextResponse.json({ error: "internal error" }, { status: 500, headers });
  }
}

export async function POST(request: NextRequest) {
  const span = startSpan("POST /api/admin/experiments", extractTraceContext(request.headers), {
    "http.method": "POST",
    "http.target": request.nextUrl.pathname,
  });

  try {
    if (!(await currentAdminSession())) {
      setError(span, new Error("admin auth required"));
      return NextResponse.json({ error: "admin auth required" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }
    const key = String(body.key ?? "").trim();
    const description = String(body.description ?? "").trim();
    const variants: ExperimentVariant[] = (body.variants as ExperimentVariant[] | undefined) ?? [];
    const status = body.status ?? "draft";

    // Validate
    if (!key || !/^[a-z0-9_-]+$/.test(key)) {
      return NextResponse.json({ error: "key must be alphanumeric (a-z, 0-9, _, -)" }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json({ error: "description required" }, { status: 400 });
    }
    if (variants.length === 0) {
      return NextResponse.json({ error: "at least one variant required" }, { status: 400 });
    }
    const totalWeight = variants.reduce((sum, v: ExperimentVariant) => sum + v.weight, 0);
    if (Math.abs(totalWeight - 1) > 0.001) {
      return NextResponse.json({ error: `variant weights must sum to 1.0 (got ${totalWeight})` }, { status: 400 });
    }

    const now = Date.now();
    const id = `exp_${randomToken(8)}`;

    await db()
      .prepare(
        "INSERT INTO experiments (id, key, description, status, variants, seed, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
      )
      .bind(id, key, description, status, JSON.stringify(variants), Math.floor(Math.random() * 1e6), now, now)
      .run();

    setAttribute(span, "experiment.id", id);
    setAttribute(span, "experiment.key", key);

    const response = { id, key, description, status, variants, createdAt: now, updatedAt: now };

    const ended = endSpan(span, "ok");
    const headers = new Headers();
    injectTraceContext(ended, headers);
    return NextResponse.json(response, { status: 201, headers });
  } catch (err) {
    setError(span, err instanceof Error ? err : new Error(String(err)));
    const ended = endSpan(span, "error", err instanceof Error ? err.message : String(err));
    const headers = new Headers();
    injectTraceContext(ended, headers);
    return NextResponse.json({ error: "internal error" }, { status: 500, headers });
  }
}
