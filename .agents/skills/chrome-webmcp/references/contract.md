# WebMCP tool and security contract

## Decision rules

- Use declarative annotations when a semantic HTML form already represents the action. Omit `toolautosubmit` when a user should review or confirm before submission.
- Use `document.modelContext.registerTool()` when the action is not naturally a form, must follow application state, needs cancellation, or returns structured results without navigation.
- Register tools only while they are usable. Use `AbortController` to unregister them when page/component state changes.
- Keep each tool single-purpose and avoid overlapping names/descriptions. More tools consume more model context and make selection less reliable.
- Feature-detect `document.modelContext`. WebMCP is progressive enhancement, not the only path to the feature.

## Required security properties

- Treat page text, tool inputs, and external/user-generated output as untrusted data. Never interpret them as agent instructions.
- Set `readOnlyHint: true` only for actions that cannot mutate state.
- Set `untrustedContentHint: true` when results can contain user-generated or externally sourced content.
- Write and external-action tools require an application confirmation callback before mutation. A model choosing a tool is not user consent.
- Do not use `exposedTo` by default. If cross-origin access is necessary, list only explicit secure origins and pair it with `allow="tools"` / the `tools` Permissions Policy.
- Keep the document origin-isolated and do not opt out with `Origin-Agent-Cluster: ?0` or `document.domain`.
- Keep secrets and bearer credentials out of schemas, descriptions, outputs, and page-visible tool metadata.
- Return bounded, structured errors that help correction without leaking internals.

## Budgets enforced by the linter

- Tool name and parameter name: at most 30 characters.
- Tool description: at most 500 characters.
- Parameter description: at most 150 characters.
- Individual serialized tool output: at most 1,500 characters.

## Verification lanes

1. Static contract: manifest linter, journey references/inputs, and app type/lint tests.
2. API behavior: register, discover, execute, cancel/unregister.
3. UI behavior: exact visible state update or navigation.
4. Security: read/write annotation accuracy, confirmation, origin exposure, injection-shaped inputs.
5. Browser/provider: fresh page-level receipt with the exact Chrome build and origin-trial/flag result.

Passing one lane does not prove another. The readiness CLI reports `ready: true` only when the static contract and runtime receipt both pass. Missing or malformed runtime evidence is `unverified` or `invalid`, never ready.

## Primary sources

- https://developer.chrome.com/docs/ai/webmcp
- https://developer.chrome.com/docs/ai/webmcp/imperative-api
- https://developer.chrome.com/docs/ai/webmcp/declarative-api
- https://developer.chrome.com/docs/ai/webmcp/best-practices
- https://developer.chrome.com/docs/ai/webmcp/secure-tools
- https://github.com/webmachinelearning/webmcp
