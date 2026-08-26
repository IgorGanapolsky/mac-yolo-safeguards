"use client";

import { useEffect } from "react";
import { buildWebMcpTools } from "@/lib/webmcp-tools.mjs";

interface ModelContextLike {
  registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => Promise<void>;
}

/**
 * Registers read-only WebMCP tools when the browser exposes
 * document.modelContext (Chrome 149+ origin trial). No-ops everywhere else.
 * Mounted from the root layout; renders nothing.
 */
export function WebMcpTools() {
  useEffect(() => {
    const modelContext = (
      document as Document & { modelContext?: ModelContextLike }
    ).modelContext;
    if (!modelContext || typeof modelContext.registerTool !== "function") return;
    const controller = new AbortController();
    for (const tool of buildWebMcpTools({})) {
      void modelContext
        .registerTool(tool, { signal: controller.signal })
        .catch(() => {});
    }
    return () => {
      controller.abort();
    };
  }, []);
  return null;
}
