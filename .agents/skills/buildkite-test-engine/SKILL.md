---
name: buildkite-test-engine
description: Buildkite-Style Test Engine, Flaky Quarantine & Dynamic Pipeline DAG Generator. Isolates flaky non-deterministic tests, splits test suites across parallel workers, and dynamically plans CI DAGs based on git diffs.
---

# Buildkite Test Engine & Dynamic Pipeline Skill

Implements the high-ROI patterns stolen from Buildkite Platform (buildkite.com):
1. **Flaky Test Quarantine**: Prevents transient network/ADB mobile flakes from failing master/PR builds while tracking flake velocity.
2. **Auto-Retry with Quarantine Guard**: Automatically retries quarantined tests with backoff.
3. **Dynamic Test Splitter**: Divides test suites across N parallel runner slots for minimal wall-clock duration.
4. **Diff-Aware Dynamic Pipeline DAGs**: Generates targeted execution steps based on modified directories.

## Global System Commands

- **`bin/bk-test-engine --doctor`**: Probes quarantine registry and flaky test counts.
- **`bin/bk-test-engine --split <N>`**: Splits tests into N balanced worker groups.
- **`bin/bk-dynamic-pipeline`**: Generates a dynamic diff-aware execution DAG.

## Verification

```bash
# Doctor Status Check
bin/bk-test-engine --doctor

# Run Automated Test Suites
node tests/test-buildkite-test-engine.js
node tests/test-buildkite-dynamic-pipeline.js

# Generate dynamic pipeline DAG
bin/bk-dynamic-pipeline
```
