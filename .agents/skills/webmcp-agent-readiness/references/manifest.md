# Readiness manifest and runtime evidence

The readiness manifest is a ThumbGate audit artifact. `tools` contains WebMCP
fields; `policies` contains our safety classification and must not be copied
into `document.modelContext.registerTool()` as if it were standard WebMCP.

## Manifest

```json
{
  "version": 1,
  "site": "https://example.com/consult",
  "tools": [
    {
      "name": "get_service_options",
      "title": "Get service options",
      "description": "Return services that match the customer request.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "need": {
            "type": "string",
            "description": "What the customer needs.",
            "maxLength": 500
          }
        },
        "required": ["need"],
        "additionalProperties": false
      },
      "annotations": { "readOnlyHint": true }
    },
    {
      "name": "book_consult",
      "title": "Book consultation",
      "description": "Prepare a consultation booking after the user confirms.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "slot": {
            "type": "string",
            "description": "Selected appointment slot identifier.",
            "maxLength": 100
          }
        },
        "required": ["slot"],
        "additionalProperties": false
      },
      "annotations": { "readOnlyHint": false }
    }
  ],
  "policies": {
    "get_service_options": {
      "effect": "read",
      "confirmation": "not_applicable"
    },
    "book_consult": {
      "effect": "consequential",
      "confirmation": "required"
    }
  },
  "journeys": [
    {
      "id": "book-consult-preview",
      "prompt": "Find the right service and prepare a consultation for tomorrow.",
      "expectedCalls": ["get_service_options", "book_consult"],
      "expectedArguments": [
        { "need": "consultation" },
        { "slot": "tomorrow" }
      ],
      "mode": "preview",
      "performanceBudget": {
        "maxDurationMs": 5000,
        "maxToolCalls": 2,
        "maxEstimatedCostUsd": 0.05
      }
    }
  ]
}
```

Policy values:

- `effect`: `read`, `write`, or `consequential`.
- `confirmation`: `not_applicable`, `agent_decides`, or `required`.
- `mode`: `read_only`, `preview`, or `sandbox`.

`preview` must leave a consequential side effect unexecuted. `sandbox` may
verify the side effect only when the runtime evidence also says its environment
is `sandbox`.

## Runtime evidence

Generate `manifestSha256` by running the static audit and copying the reported
digest into the runtime collector. The collector must also hash its raw capture
file into `artifactSha256`; the audit CLI recomputes that hash from `--artifact`.
Do not hand-edit old evidence to match a new manifest or capture.

```json
{
  "manifestSha256": "<64 lowercase hex characters>",
  "site": "https://example.com/consult",
  "capturedAt": "2026-08-26T21:44:00.000Z",
  "collector": {
    "name": "model-context-tool-inspector",
    "version": "1.0.0"
  },
  "artifactSha256": "<SHA-256 of the raw browser capture>",
  "browser": {
    "name": "Chrome",
    "version": "149.0.0.0",
    "webmcpEnabled": true,
    "originIsolated": true,
    "toolsPermission": true
  },
  "registeredTools": ["get_service_options", "book_consult"],
  "environment": "production",
  "journeys": {
    "book-consult-preview": {
      "status": "pass",
      "calls": ["get_service_options", "book_consult"],
      "arguments": [
        { "need": "consultation" },
        { "slot": "tomorrow" }
      ],
      "confirmationRequired": true,
      "confirmationObserved": false,
      "sideEffect": "not_executed",
      "durationMs": 1200,
      "estimatedCostUsd": 0.01,
      "unnecessarySteps": 0
    }
  }
}
```

The default freshness window is 24 hours. A runtime tool list must match the
manifest's evaluated page state exactly; evaluate different dynamic states with
separate manifests or captures.

For a `preview` journey, `confirmationRequired=true` proves the action would be
gated, while `confirmationObserved=false` and `sideEffect=not_executed` prove no
confirmation or consequential action was fabricated. A `sandbox` journey must
instead record `confirmationObserved=true`, `environment=sandbox`, and
`sideEffect=verified`.
