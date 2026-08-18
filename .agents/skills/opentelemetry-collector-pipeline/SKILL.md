---
name: opentelemetry-collector-pipeline
description: OpenTelemetry (OTel) Collector & Distributed Telemetry Engine. Ingests, batches, redacts sensitive secrets, attributes metadata, and exports high-throughput traces, metrics, and logs across Hermes Gateway, Hermes Mobile, and coding agent loops without vendor lock-in.
---

# OpenTelemetry Collector Pipeline Skill

Implements standard OpenTelemetry Collector architectural patterns (opentelemetry.io/docs/collector):
1. **Receivers**: Ingests OTLP spans, metrics, and logs from autonomous agent loops and mobile builds.
2. **Processors**:
   - Strips API keys, passwords, and JWTs via regex redaction filters before storage.
   - Enriches spans with service names, roles, git branch context, and Dogwood policy outcomes.
3. **Exporters**: Persists to unified JSONL sinks (`~/.hermes/otel/`) and forwards to PostHog / OTLP HTTP backends.

## Global System Commands

- **`bin/otel-pipeline --doctor`**: Health-checks pipeline buffers, trace counts, and metric stores.
- **`bin/otel-pipeline --export`**: Exports buffered telemetry.
- **`bin/otel-pipeline --ingest '<json>'`**: Ingests a new trace span into the pipeline.

## Verification

```bash
# Doctor Status Check
bin/otel-pipeline --doctor

# Run Automated Test Suite
node tests/test-opentelemetry-collector-pipeline.js

# Ingest test span
bin/otel-pipeline --ingest '{"name":"test.span","durationMs":10}'
```
