# Hermes Mobile agent UX evidence - July 2026

## Decision

Adopt three patterns now: durable state transitions, evidence-bearing runtime validation, and compact bounded context. Do not add a new agent framework or the React Native AI SDK Profiler merely because it is fashionable; Hermes Mobile does not execute Vercel AI SDK calls on-device, so that plugin would not measure the failing gateway boundary.

The supplied Greptile PDF is an OSS-maintainer discount confirmation, not technical evidence. The supplied Callstack PDF is an Agent Conf invitation. Its Meta, eBay, Grafana, and Booking.com bullets are agenda claims; only claims corroborated by primary public material are treated as engineering evidence below.

## Source-backed patterns

| Source | Public evidence | Hermes decision |
| --- | --- | --- |
| Meta Engineering, [How Meta Used AI to Map Tribal Knowledge](https://engineering.fb.com/2026/04/06/developer-tools/how-meta-used-ai-to-map-tribal-knowledge-in-large-scale-data-pipelines/) | Concise 25-35-line navigation context, independent critic passes, path verification, and automated freshness reduced preliminary agent tool calls by about 40%. | Fresh chat should receive a bounded, cited handoff packet, not the prior full transcript or the whole Obsidian vault. Handoff freshness must be testable. |
| Meta Engineering, [Capacity Efficiency at Meta](https://engineering.fb.com/2026/04/16/developer-tools/capacity-efficiency-at-meta-how-unified-ai-agents-optimize-performance-at-hyperscale/) | Small single-purpose tools, domain skills, regression detection, and explicit validation criteria compress investigation without conflating detection with proof. | Keep connection health, send acceptance, stream activity, and reply completion as separate telemetry states. A green health probe cannot stand in for prompt durability. |
| Meta Engineering, [Ranking Engineer Agent](https://engineering.fb.com/2026/03/17/developer-tools/ranking-engineer-agent-rea-autonomous-ai-system-accelerating-meta-ads-ranking-innovation/) | Persistent experiment memory, explicit wait states, resumable execution, and guarded recovery support long-horizon work. | A new chat needs an explicit continuation handoff and source-session identity. Natural-language "pick up where you left off" must not be treated as sufficient state restoration. |
| Greptile, [AI Code Review](https://www.greptile.com/blog/ai-code-review) and [TREX](https://www.greptile.com/blog/trex) | Independent review catches cross-file logic; runtime execution adds logs, screenshots, traces, scripts, and video instead of a bare pass/fail. | The fix author must not be the only reviewer. Device evidence must accompany merge claims; skipped E2E is not a pass. |
| Greptile, [Changelog](https://www.greptile.com/changelog) | Cascading directory rules, explicit context files, memory from review feedback, and multi-repo context are bounded inputs to review. | Keep `AGENTS.md`, task ownership, Graphify, and ThumbGate lessons distinct. Do not load all historical chats or the whole vault into every turn. |
| Callstack, [AI SDK Profiler](https://www.callstack.com/blog/announcing-ai-sdk-profiler-for-react-native) | The plugin visualizes OpenTelemetry spans emitted by Vercel AI SDK requests in Rozenite and stays out of production builds. | Not a direct fit today: Hermes Mobile's failing work happens across its gateway/SSE APIs, not on-device Vercel AI SDK calls. Reuse the span model, not the dependency. |
| Callstack, [agent-device](https://github.com/callstackincubator/agent-device) | Semantic device inspection, logs, network/performance evidence, and replayable workflows for real apps. | Use release-device snapshots and replays for send acknowledgement, background completion, and fresh-user flows. Preserve the physical-phone user-activity guard. |

The conference invitation's eBay 70% alert-investigation claim, Grafana "vibes" wording, and Booking.com 40-million-line Perl migration claim were not corroborated by a primary public source in this pass. They are not used as acceptance evidence.

## Ranked Hermes changes

1. **Ship now - truthful progress state**
   - A rise in output/total tokens counts as activity; unchanged counters do not.
   - Completion removes elapsed-time and "on your computer" copy.
   - One gateway-wrapped prompt echo collapses with its one optimistic phone bubble.

2. **Next central-file change - durable send protocol**
   - Model states separately: `local_pending -> gateway_accepted -> streaming -> completed|failed`.
   - Persist an idempotency key before network send; reconcile by key, not display text.
   - Acceptance: process death or SSE loss after gateway acceptance never discards or duplicates the prompt.

3. **Next central-file change - bounded continuation handoff**
   - Generate a short source-session handoff with objective, verified results, open blockers, next action, source session id, and freshness timestamp.
   - Inject only on explicit Continue in fresh chat; never infer continuity from a vague prompt title.
   - Obsidian may store the human-readable artifact, but mobile retrieval stays bounded and cited.

4. **Production UI cleanup**
   - Hide CRON/API_SERVER/CLI sessions by default; expose them only behind a developer control.
   - Keep user title stable after first meaningful prompt and label automatic titles as generated.
   - Collapse the weak-model warning to one line by default.
   - Completion notification body uses the first privacy-safe reply sentence when the terminal event carries it.

## Acceptance metrics

- One send tap yields one durable client id, one gateway user turn, and one rendered user bubble.
- UI acknowledges local submission in under 100 ms and gateway acceptance separately when received.
- Any output-token increase refreshes the activity timestamp; five minutes of truly unchanged phase/detail/tokens triggers recovery.
- Completed notification contains no elapsed timer and no "on your computer" phrase.
- Fresh-chat continuation packet is bounded to 1,200 characters and names its source session and timestamp.
- Normal Threads view contains zero CLI/API_SERVER/CRON rows by default.
- Merge requires focused Jest, full Jest/typecheck, and non-skipped device or emulator evidence for changed UX paths.

## Release boundary

The current TypeScript-only fixes are OTA-eligible when the installed binary's runtime/channel matches. Native notification-channel importance, network security config, permissions, or package changes still require a new store binary.
