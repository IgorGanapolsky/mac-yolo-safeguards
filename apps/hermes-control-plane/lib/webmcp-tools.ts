export type WebMcpToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

export type WebMcpExecutionOptions = {
  signal?: AbortSignal;
};

export type WebMcpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (
    input: Record<string, unknown>,
    options: WebMcpExecutionOptions,
  ) => Promise<WebMcpToolResult>;
};

type WebMcpDependencies = {
  fetch: typeof globalThis.fetch;
  confirm: (message: string) => boolean;
  navigate: (url: string) => void;
};

export const THUMBGATE_WEBMCP_TOOL_NAMES = [
  "get_hosted_hermes_plan",
  "get_workspace_status",
  "start_hosted_hermes_checkout",
] as const;

function toolResult(value: Record<string, unknown>): WebMcpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function boundedString(value: unknown, maxLength = 64): string | null {
  return typeof value === "string" ? value.slice(0, maxLength) : null;
}

function assertExactInput(
  input: Record<string, unknown> | undefined,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  const value = input ?? {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("WebMCP input must be an object");
  }
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length > 0) {
    throw new TypeError(`Unexpected input fields: ${unexpected.join(", ")}`);
  }
  return value;
}

async function readJson(response: Response, label: string): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error(`${label} is unavailable (${response.status})`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${label} returned an invalid response`);
  }
  return body as Record<string, unknown>;
}

export function createThumbGateWebMcpTools(
  dependencies: WebMcpDependencies,
): WebMcpTool[] {
  const emptyInputSchema = {
    type: "object",
    properties: {},
    additionalProperties: false,
  } as const;

  return [
    {
      name: THUMBGATE_WEBMCP_TOOL_NAMES[0],
      title: "Get hosted Hermes plan",
      description: "Read the active hosted Hermes subscription price and billing interval from ThumbGate.",
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input, { signal }) {
        assertExactInput(input, []);
        const body = await readJson(
          await dependencies.fetch("/api/billing/plan", { signal }),
          "Hosted Hermes plan",
        );
        return toolResult({
          active: body.active === true,
          unitAmount: typeof body.unitAmount === "number" ? body.unitAmount : null,
          currency: boundedString(body.currency),
          interval: boundedString(body.interval),
        });
      },
    },
    {
      name: THUMBGATE_WEBMCP_TOOL_NAMES[1],
      title: "Get workspace status",
      description: "Read whether this browser is signed in and whether its ThumbGate workspace can use hosted Hermes.",
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input, { signal }) {
        assertExactInput(input, []);
        const body = await readJson(
          await dependencies.fetch("/api/me", { signal }),
          "ThumbGate workspace status",
        );
        const organization = body.organization && typeof body.organization === "object"
          ? body.organization as Record<string, unknown>
          : {};
        const hostedRunner = body.hostedRunner && typeof body.hostedRunner === "object"
          ? body.hostedRunner as Record<string, unknown>
          : {};
        return toolResult({
          authenticated: body.authenticated === true,
          plan: boundedString(organization.plan),
          cloudAccess: organization.cloudAccess === true,
          hostedRunnerStatus: boundedString(hostedRunner.status),
        });
      },
    },
    {
      name: THUMBGATE_WEBMCP_TOOL_NAMES[2],
      title: "Start hosted Hermes checkout",
      description: "Preview or open Stripe Checkout for hosted Hermes. Execute mode always asks the user in browser first.",
      inputSchema: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["preview", "execute"],
            description: "Use preview to inspect the action or execute to request user confirmation.",
            maxLength: 7,
          },
        },
        required: ["mode"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      async execute(input, { signal }) {
        const value = assertExactInput(input, ["mode"]);
        if (value.mode !== "preview" && value.mode !== "execute") {
          throw new TypeError("mode must be preview or execute");
        }
        if (value.mode === "preview") {
          return toolResult({
            status: "preview",
            action: "Create a Stripe Checkout session and open checkout.stripe.com.",
            requiresUserConfirmation: true,
          });
        }

        const confirmed = dependencies.confirm(
          "Open Stripe Checkout for hosted Hermes? No payment is completed until you review and submit on Stripe.",
        );
        if (!confirmed) return toolResult({ status: "cancelled" });

        const body = await readJson(
          await dependencies.fetch("/api/billing/checkout", {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: "{}",
            signal,
          }),
          "Hosted Hermes checkout",
        );
        if (typeof body.url !== "string") throw new Error("Checkout response did not include a URL");
        const checkoutUrl = new URL(body.url);
        if (checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "checkout.stripe.com") {
          throw new Error("Unexpected checkout destination");
        }
        dependencies.navigate(checkoutUrl.toString());
        return toolResult({ status: "navigation_started" });
      },
    },
  ];
}
