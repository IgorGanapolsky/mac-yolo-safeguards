/**
 * WebMCP tool descriptors for the thumbgate.app landing.
 * Framework-free so tests can execute the tools directly.
 * Both tools are read-only; nothing here books, buys, or submits.
 */
export function buildWebMcpTools({ fetchImpl } = {}) {
  const doFetch = fetchImpl ?? ((...args) => fetch(...args));
  return [
    {
      name: "get_hermes_offer",
      description:
        "What this site offers: hosted Hermes on a fenced VPS. Returns the product summary, price, and links.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () =>
        [
          "Hosted Hermes: an always-on AI agent on a fenced VPS.",
          "You own the work. We own the machine.",
          "The $10/month offer is hosted Hermes on a fenced VPS.",
          "Site: https://thumbgate.app — live status at /api/health.",
        ].join(" "),
    },
    {
      name: "get_service_status",
      description:
        "Live service status of the hosted Hermes control plane, from the same-origin health endpoint.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => {
        try {
          const res = await doFetch("/api/health", { method: "GET" });
          const text = await res.text();
          return `HTTP ${res.status}: ${text}`;
        } catch {
          return "status unavailable: health endpoint did not respond";
        }
      },
    },
  ];
}
