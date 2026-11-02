# feat(agents): add fail-closed WebMCP readiness skill

<!-- source: Merged PR | id: 2139 | closed: 2026-10-29T14:02:17.964Z -->

## Question

feat(agents): add fail-closed WebMCP readiness skill

## Answer

- Audits bounded WebMCP tool definitions and journey-evaluation manifests.
- Requires explicit confirmation policy for write/external tools.
- Reports missing runtime evidence as `unverified` with a nonzero exit; static validity alone is never `ready`.
- Probes imperative and declarative WebMCP APIs in isolated headless Chrome profiles.
- Keeps ordinary DOM/CDP automation as the fallback when `document.modelContext` is unavailable.
- Mirrors a tested skill copy across the nine configured agent h

[View source](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/2139)

---
