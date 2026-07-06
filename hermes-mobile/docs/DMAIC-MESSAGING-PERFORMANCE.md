# DMAIC Messaging Performance

Hermes chat-send performance uses a DMAIC loop so send UX changes can be judged from measured latency instead of screenshots alone.

## Define

The user-visible send path has three budgets:

- Accepted by computer: 1000 ms
- First assistant response: 2500 ms
- Completed or failed: 15000 ms

These are product budgets, not correctness gates. A breach should identify where the experience feels stuck: delivery, first response, or completion.

## Measure

`streamSessionChat` records one `chat_send_performance` event per send attempt. The event does not include prompt text or assistant text.

Recorded fields:

- `transport`: `fetch-sse` or `xhr-sse`
- `status`: `success`, `failed`, or `timeout`
- `message_length`
- `has_system_message`
- `accepted_ms`
- `first_response_ms`
- `completed_ms`
- `budget_breach_count`
- `slowest_stage`
- `error_name`
- `error_kind`

## Analyze

Use the stage fields to separate UX problems:

- High `accepted_ms`: phone-to-computer delivery or connection routing problem.
- High `first_response_ms`: model startup, queueing, or prompt/context overhead.
- High `completed_ms`: long tool work, model generation, or blocked agent loop.
- `timeout`: the user needs explicit stop/retry recovery, not a generic spinner.

## Improve

The first high-ROI changes are:

- Stop presenting relay pairing as required for Chat when the direct computer link is the real path.
- Replace generic "Hermes is working" notification copy with structured run state: what, where, elapsed time, and one action.
- Keep foreground notifications suppressed except for required foreground-service status.
- Measure every send before judging whether notification copy or routing changes improved the experience.

## Control

Regression coverage:

- `src/__tests__/chatSendPerformance.test.ts`
- `src/__tests__/hermesGatewayClient.test.ts`
- `src/__tests__/chatErrors.test.ts`

Before claiming a messaging UX fix, run the focused suites and then `npm run typecheck`. For device truth, read `docs/proofs/continuous/latest.json` and report the actual `e2e` value.
