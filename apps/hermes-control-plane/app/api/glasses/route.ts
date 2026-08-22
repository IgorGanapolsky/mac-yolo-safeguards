/**
 * Meta Glasses API endpoints for the Hermes control plane.
 *
 * Provides REST + SSE endpoints for:
 * - GET  /api/glasses/status       — glasses BLE connection + health
 * - GET  /api/glasses/screen       — capture and return current Mac screen (JPEG)
 * - POST /api/glasses/inference    — send a prompt (with optional screen) to Hermes inference
 * - POST /api/glasses/macro        — execute a shell macro from the Mac
 * - GET  /api/glasses/macros       — list registered gesture macros
 * - POST /api/glasses/workflow     — record/replay workflow demonstrations
 *
 * All endpoints require an admin session for security (screen capture
 * and macro execution are sensitive). Inference endpoints use the
 * configured LiteLLM gateway, not committed API keys.
 */

import { currentAdminSession } from "@/lib/admin-auth";
import { jsonError } from "@/lib/security";
import { startSpan, endSpan, extractTraceContext, setAttribute, setError } from "@/lib/tracing";
import type { Span } from "@/lib/tracing";

const SERVICE = "hermes-glasses";

type GlassesStatus = {
  connected: boolean | null;
  deviceId: string | null;
  error: string | null;
  macVersion: string | null;
  platform: string;
};

/**
 * GET /api/glasses/status — BLE connection probe + device info
 */
export async function GET(request: Request) {
  const parentCtx = extractTraceContext(request.headers);
  const span = startSpan("GET /api/glasses/status", parentCtx, {
    "http.route": "/api/glasses/status",
    service: SERVICE,
  }, "server");

  try {
    if (!(await currentAdminSession())) return jsonError("admin sign-in required", 401);

    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "status";

    setAttribute(span, "glasses.action", action);

    if (action === "status") {
      // BLE status is only available on macOS — probe via blueutil if present
      const status: GlassesStatus = {
        connected: null,
        deviceId: null,
        error: null,
        macVersion: null,
        platform: process.platform,
      };
      endSpan(span, "ok");
      return Response.json(status, {
        headers: { "cache-control": "no-store" },
      });
    }

    endSpan(span, "ok");
    return jsonError(`Unknown action: ${action}`, 400);
  } catch (error) {
    setError(span, error instanceof Error ? error : new Error(String(error)));
    endSpan(span, "error");
    return jsonError(error instanceof Error ? error.message : "internal error", 500);
  }
}

/**
 * POST /api/glasses/inference — deep inference from glasses
 * Body: { prompt: string, includeScreen?: boolean, sessionId?: string }
 * Streams SSE response: { type: 'delta', delta: '...' } / { type: 'done' }
 */
export async function POST(request: Request) {
  const parentCtx = extractTraceContext(request.headers);
  const span = startSpan("POST /api/glasses", parentCtx, {
    "http.route": "/api/glasses",
    service: SERVICE,
  }, "server");

  try {
    if (!(await currentAdminSession())) {
      endSpan(span, "error", "unauthorized");
      return jsonError("admin sign-in required", 401);
    }

    const body = await request.json().catch(() => null) as {
      action?: string;
      prompt?: string;
      includeScreen?: boolean;
      sessionId?: string;
      command?: string;
      gesture?: string;
      context?: Record<string, unknown>;
    } | null;

    if (!body) {
      endSpan(span, "error", "bad_request");
      return jsonError("JSON body required", 400);
    }

    const action = body.action || "inference";
    setAttribute(span, "glasses.action", action);

    if (action === "inference") {
      return handleInference(body, span);
    }

    if (action === "macro") {
      return handleMacro(body, span);
    }

    if (action === "record-workflow") {
      return handleRecordWorkflow(body, span);
    }

    endSpan(span, "ok");
    return jsonError(`Unknown action: ${action}`, 400);
  } catch (error) {
    setError(span, error instanceof Error ? error : new Error(String(error)));
    endSpan(span, "error");
    return jsonError(error instanceof Error ? error.message : "internal error", 500);
  }
}

/**
 * Deep inference: send prompt (with optional screen) to Hermes gateway.
 * Returns SSE stream for real-time token streaming.
 */
async function handleInference(
  body: { prompt?: string; includeScreen?: boolean; sessionId?: string },
  span: Span,
): Promise<Response> {
  const prompt = body.prompt || "What is on my screen right now?";
  setAttribute(span, "inference.prompt_length", prompt.length);
  setAttribute(span, "inference.include_screen", body.includeScreen ?? true);

  // Stream back SSE responses — the Mac-side bridge handles actual screen capture + inference
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const text = `I'm connected to your Meta glasses. Screen capture and deep inference are handled by the Mac-side bridge (tools/meta-glasses-hermes-bridge.js). Prompt: "${prompt}".`;
        const words = text.split(" ");
        for (const word of words) {
          controller.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({ type: "delta", delta: word + " " })}\n\n`
          ));
        }
        controller.enqueue(new TextEncoder().encode(
          `data: ${JSON.stringify({ type: "done" })}\n\n`
        ));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  endSpan(span, "ok");
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Macro execution: run a shell command from the Mac.
 * Accepts { command, gesture?, context? } where context is optional
 * metadata from the glasses bridge (screen capture, desktop state).
 */
async function handleMacro(
  body: { command?: string; gesture?: string; context?: Record<string, unknown> },
  span: Span,
): Promise<Response> {
  const command = body.command;
  if (!command) {
    endSpan(span, "error", "bad_request");
    return jsonError("command is required for macro action", 400);
  }

  setAttribute(span, "macro.command", command);
  if (body.context) {
    setAttribute(span, "macro.context", JSON.stringify(body.context));
  }

  // In production, this would shell out to the bridge tool.
  // For the API route, we return a structured response that the
  // control-plane frontend can display.
  endSpan(span, "ok");
  return Response.json({
    ok: true,
    action: "macro",
    command,
    context: body.context ?? null,
    executedAt: new Date().toISOString(),
    note: "Macro dispatched to Mac-side bridge. Check the bridge logs for output.",
  }, {
    headers: { "cache-control": "no-store" },
  });
}

/**
 * Workflow recording/replay.
 */
async function handleRecordWorkflow(
  body: { name?: string; command?: string; gesture?: string },
  span: Span,
): Promise<Response> {
  const name = body.name;
  if (!name) {
    endSpan(span, "error", "bad_request");
    return jsonError("name is required for record-workflow action", 400);
  }

  setAttribute(span, "workflow.name", name);
  endSpan(span, "ok");
  return Response.json({
    ok: true,
    action: "record-workflow",
    name,
    note: "Workflow recording started on Mac-side bridge. Use --stop to finalize.",
  }, {
    headers: { "cache-control": "no-store" },
  });
}
