# Deep Research: Mobile E2E Testing & Instrumentation Standards (July 2026)

**Run ID**: `trun_fc3268d892f541d68b274ac5c4f8c04a`  
**Date**: July 2026  

---

## Executive Summary & Findings

1. **Testing Architecture (70 / 20 / 10 Pyramid)**:
   - **Unit Tests (~70%)**: Jest 30, fast pure-function and hook tests.
   - **Component Tests (~20%)**: React Native Testing Library (RNTL) with `accessibilityLabel` and `testID` queries.
   - **E2E Tests (~10%)**: Maestro UI automation for revenue-critical user flows (onboarding, pairing, gateway health, chat messaging, and settings edge cases).

2. **Instrumentation & Telemetry**:
   - OpenTelemetry JS SDK for React Native (`@opentelemetry/sdk-trace-web` + OTLP HTTP exporter).
   - Structured JSON logging with trace context (`test.id`, `device.model`, `os.version`, `app.build`, `git.sha`).
   - Sentry & Embrace session observability for production crash and error telemetry.

3. **Deterministic Verification Loop**:
   - Zero manual steps; automated CLI execution (`npm test` + `npm run e2e:fresh-user`).
