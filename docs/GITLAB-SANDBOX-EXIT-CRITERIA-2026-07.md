# GitLab Mirror Sandbox — Exit Criteria (July 2026)

**Status:** Not started. **Do not create a GitLab project unless Igor explicitly asks.**

Parent decision: [RESEARCH-GITLAB-MIGRATION-2026-07.md](./RESEARCH-GITLAB-MIGRATION-2026-07.md) — **Option A: stay on GitHub** (Igor confirmed 2026-07-13; Parallel run `trun_5c7ef1b0`).

## When to start (opt-in only)

Run a **2-week mirror pilot** only if Igor requests empirical Duo vs Copilot comparison. Scope:

- Mirror `mac-yolo-safeguards` to a GitLab sandbox namespace (e.g. `hermes-mobile-sandbox`).
- Author a `.gitlab-ci.yml` shim that invokes `eas-cli` / EAS Workflows equivalents.
- GitHub remains canonical; no cutover, no disabling GitHub Actions.

## Exit triggers (any one → stop pilot, archive sandbox)

| Trigger | Threshold | Rationale |
|---------|-----------|-----------|
| EAS-on-GitLab glue cost | **> 8 engineering hours** per trigger pattern | Mobile release spine must not depend on brittle CI glue |
| macOS runner queue p95 | **> 30 minutes** (3 consecutive runs) | Release cadence blocked by runner starvation |
| Duo credits / add-on ROI | **Unjustified** — no ≥15% PR cycle-time win vs Copilot on identical tasks | Paid add-on without measurable agentic upside |

## On exit

1. Archive or delete the GitLab sandbox project.
2. Capture metrics + lesson in ThumbGate (`signal=down` if abort was due to cost/queue).
3. Re-decision gate remains **Q1 2027** per research doc — no migration without new evidence.

## Explicit non-goals

- No repo migration off GitHub.
- No GitHub Actions disablement.
- No GitLab project creation without Igor's explicit trigger.
