"use client";

import { useEffect } from "react";
import {
  createThumbGateWebMcpTools,
  type WebMcpTool,
} from "@/lib/webmcp-tools";

type ModelContext = {
  registerTool: (
    tool: WebMcpTool,
    options: { signal: AbortSignal },
  ) => Promise<void> | void;
};

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export function WebMcpInit() {
  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext) return;

    const controller = new AbortController();
    const tools = createThumbGateWebMcpTools({
      fetch: window.fetch.bind(window),
      confirm: (message) => window.confirm(message),
      navigate: (url) => window.location.assign(url),
    });
    for (const tool of tools) {
      void Promise.resolve(
        modelContext.registerTool(tool, { signal: controller.signal }),
      ).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "NotAllowedError") return;
        console.error("webmcp_tool_registration_failed", {
          tool: tool.name,
          error: error instanceof Error ? error.name : "unknown",
        });
      });
    }
    return () => controller.abort();
  }, []);

  return null;
}
