# Decision-Grade Architecture for Preventing AI System Regressions Across 5 Layers

## Executive Summary

- **Eval Debt is the silent killer**: Stale eval suites produce false confidence; CI eval suites with LLM-diverse oracles and coverage gating on test-data fingerprints catch regressions before they reach users. Treat every PR touching an AI agent as gated on behavioral invariants, the same way PRs touching network code are gated on chaos tests.
- **Single-token MCP bindings close confused-deputy**: The MCP spec mandates OAuth 2.1 with audience-bound tokens and forbids token passthrough; binding every MCP access token to one server and validating per request eliminates delegate confusion that compounds across the five layers.
- **Worktree cleanup must be Safe-by-Construction**: Cleanup automations that delete active agent sessions cause lost progress and corrupt runs; per-session isolation tags, tombstoned worktrees, and explicit enter/exit operations prevent cleanup from racing with live work.
- **RAG recall drifts twice**: Embedding-model upgrades and corpus changes independently shift vector geometry; pin both the embedding model and chunking version in production, and run daily offline retrieval regression against a frozen gold set with recall@K and citation-fidelity gates.
- **Six-layer OTel trace schema is the spine**: OpenTelemetry GenAI semantic conventions now cover LLM calls, agent orchestration, MCP tool calls, content capture, and evaluation all on the same trace; emitting a single span tree across mobile, gateway, and backend collapses 5 separate incident timelines into one.
- **Offline-to-online is the deployment contract**: A three-phase pipeline (offline regression -> shadow/canary -> online control-chart monitoring) with the production trace feeding the next offline run is the only pattern that prevents drift between local tests, physical-device E2E, CI, and live user outcome proof.
- **Agent ownership belongs in metadata, not folklore**: Without single-owner metadata, agents produce overlapping commitments and policy thrash; an explicit ownership registry combined with change-review policy closes accountability gaps before they become incidents.
- **Tool side effects need a CI mock mirror**: Agents that over-trust effectful tools cause destructive operations; mocking each tool in CI with assertion-only side effects, and gating CI on tool-call-shape invariants, prevents blind tool deference.
- **React Native + Hermes-gateway differs from web**: The gap between local unit tests, physical-device E2E, CI, deployment, and live user outcome is wider on mobile because Wi-Fi, Hermes engine, and native bridge expose different bugs; the 30/60/90 implementation must close each gap explicitly, not treat "it works in CI" as a done criterion.

## Section 1: RAG Systems - Preventing Citation and Recall Drift

**Why this architecture?** RAG systems cannot be unit-tested the way traditional CRUD can because correctness is a probabilistic composition of retrieval and generation; a fixed eval set, fixed retrieval pipeline, and fixed LLM-as-judge oracle give you repeatable signal. Without that, every prompt tweak is an A/B test against unmeasured production user pain.

**What can fail?** Top failure modes documented across Dan Woolridge's "RAG in Production" pitfalls and the Getdevstudio 2026 enterprise KB architecture include: (a) **embedding drift** when an upstream embedding model is silently upgraded and vector geometry changes, degrading recall silently ([22]); (b) **citation/recall drift** when chunking or reranker versions change between indexes ([7]); (c) **stale retrieval tests** that pass on toy corpora and fail on real long-tail documents; (d) **prompt-stale oracle fallbacks** where the LLM-as-judge gets bumped but the eval set is not re-baselined.

**How do you measure it?** Use the RAG triad - Context Relevance, Faithfulness, Answer Relevance - in production-grade libraries. Ragas and TruLens provide implementations; DeepEval adds G-Eval for custom criteria. Concrete metrics and gates:
| Metric | Target | Hard gate |
|---|---|---|
| Context recall@K | >=0.80 on gold set | Hard |
| Faithfulness (RAG triad) | >=0.90 | Hard |
| Citation fidelity | >=0.95 cited claims supported | Hard |
| Embedding cosine drift vs frozen gold | <=0.04 cumulative | Diagnostic, alert at 0.06 |
| Answer relevance | >=0.85 | Hard, recent update may loosen to 0.80 |
Sources: [15], [76], [80].

**How do you secure it?** Pin the embedding model and reranker version in production; rejecting unannounced vendor updates because vector geometry shifting silently is more than an observability problem, it is a security-adjacent one (citations become wrong). Enforce input sanitization against retrieval-poisoning attacks, apply content allowlists for ingested sources, and version-lock the chunker and metadata extractor so golden evals remain valid.

**How do you deploy it?** Promote through three rings (the [61]):
1. **Offline**: Run the frozen gold set against the candidate pipeline, fail CI if any hard gate drops below threshold.
2. **Shadow/Canary**: 5% of production traffic scored by both old and new pipelines; promote only if no hard-gate regression and embedding cosine drift <= baseline+0.02.
3. **Online monitoring**: Daily offline replay of the day's traffic against the gold set; weekly embedding-drift checkpoint.

**How do you know it works?** Three signals: a release only ships if every hard gate passes; live embedding-drift alert fires before recall drops; the retrieval gold-set success rate stays within +/-0.03 of baseline for 14 days. If any drifts, auto-rollback via the canary hook.

## Section 2: AI Agents with Tools - Preventing Tool-Side-Effect and Ownership Regressions

**Why this architecture?** Tool-using agents turn probabilistic LLMs into state-changing systems; a regression is no longer "wrong answer" but "wrong file deleted". Agent tool calls must be treated as production transactions - versioned, sandboxed, and observable - not as natural-language intents.

**What can fail?** From the [57] catalog:
- **Tool Side Effects / Blind Tool Deference**: Agents overtrust callable tools and execute side-effecting operations incorrectly; causes destructive actions, data leakage, cascade failures.
- **Agent Extension Conflicts**: Skills/extensions individually pass evals but interact with context-budget contention, vocabulary collisions, and silent guidance conflicts.
- **Agent Sprawl**: Unmanaged sub-agent proliferation causes routing degradation and orphaned skill counts.
- **Agent Ownership Conflicts**: Multiple owners over the same agent cause config thrash and unresolved incidents.
- **Stale Test Preservation**: Tests that no longer exercise real edge cases or are weak/no-op produce false confidence.
- **Eval Debt**: Missing or stale eval suites cause long undetected degradations.

**How do you measure it?** Four hard gates and four diagnostics:
| Signal | Type | Target |
|---|---|---|
| Tool-call shape invariants (per tool JSON-schema) | Hard gate | CI, blocks merge |
| Side-effect reversal rate on prod-mirrored mocks | Hard gate | >=99% CI pass |
| Agent behavior drift vs frozen baseline | Diagnostic | <=0.05 score delta |
| Tool-call step count variance (composite test) | Hard gate | within +/-2 steps |
| Orphaned skill count in registry | Diagnostic | zero growth weekly |
| Skill-extension conflict log correlations | Diagnostic | zero per release |
| Approval-rate for agent-created approvals | Hard gate | zero without human |
Sources: [57], [56].

**How do you secure it?** Tools must carry an explicit permission scope, be mocked in CI with assertion-only side effects, and run under per-tool sandboxes. Confused-deputy prevention follows the same audience-binding discipline as MCP (Section 4). Tool errors must never be allowed to trigger downstream actions; verification step before every effectful call.

**How do you deploy it?** Apply the agent eval harness pattern: trace replay on a frozen gold set; tool-call shape invariants in CI. The [38] recommends production-backed staging data fed into offline runs so unit tests cover real workflow variants.

**How do you know it works?** Hard gates: (a) tool-shape invariants pass in CI; (b) side-effect reversal rate >=99%; (c) approval-rate for agent-created approvals stays at zero without independent human sign-off. Diagnostic signal: agent-behavior drift alert. Failure pattern: ship a release, then degrade for three days because no baseline replay caught the shift.

## Section 3: Multi-Agent Engineering Workflows - Cleanup and Ownership Without Corruption

**Why this architecture?** Multiple agents writing to the same repo is a coordination problem disguised as a code problem; without isolation per session and explicit ownership, cleanup becomes a foot-gun that deletes active worktrees and corrupts long-running runs.

**What can fail?** From [57]:
- **Worktree Cleanup Deleting Active Sessions**: Cleanup sweeps remove active runs along with stale ones.
- **Agent Sprawl** + **Agent Ownership Conflicts**: Without an ownership registry, multi-agent workflows produce configuration thrash and accountability gaps.
- **Agent-Laundered Bug Reports**: Agents close or file issues that hide failures.
- **Abandonment**: Agents leave sessions half-done without explicit exit.

Git worktree specifics: by the [31] and [33], typical conflicts include lock files, index.lock collisions, branch conflicts, merge failures, and stale worktrees. Per the [48], `.worktreeinclude` lets you auto-copy gitignored `.env` files into fresh worktrees, and linked worktrees carry a `.git` file pointing to the central gitdir.

**How do you measure it?** Two hard gates and one diagnostic:
| Signal | Type | Target |
|---|---|---|
| Tombstone wait time before cleanup (hours) | Hard gate | >=24h from session deactivation |
| Orphaned session count after every sweep | Hard gate | zero |
| Commit authorship overlap on overlapping files | Diagnostic | spy by single-owner rule |
| Cleanup-skip rate on active sessions | Diagnostic | 100% (never delete live) |

**How do you secure it?** Per-session isolation: each agent gets its own worktree + branch + commit-author identity. Tombstoning: cleanup only runs against sessions in `DEACTIVATED` state for >=24h. The [48] confirms worktrees are fresh checkouts, so untracked files (env, secrets) must be explicitly copied, not assumed. Per the [146], the operating rule is "global rule that decides when to delegate code edits to a sub-agent, when to put that agent in a worktree, and how to integrate the result."

**How do you deploy it?** Pattern from the [95]: a durable task board shared across profiles, with named agents, dispatcher loop, worker lifecycle, and an orchestrator pattern. The reference details "task, run, assignee, and dispatcher" semantics; workers carry lifecycle guidance template `KANBAN_GUIDANCE` auto-injected as system prompt. Failed-retry and circuit-breaker patterns are documented worker behaviors.

**How do you know it works?** Hard gate: cleanup never deletes an active session (100% skip rate). Diagnostic: commit authorship overlap fires when two agents edit the same file within 24h, escalated to single-owner resync. Failure pattern: cleanup automation races with live worker and destroys 30 minutes of progress.

## Section 4: MCP-Based Enterprise Integrations - Confused-Deputy and Token Discipline

**Why this architecture?** MCP normalizes how agents reach enterprise systems, but the same primitives that make integration easy also make confused-deputy attacks trivial: a token issued for one server can be replayed against another if the gateway doesn't bind the audience. Without binding every MCP token to a single server, the entire enterprise perimeter becomes an authorization-free zone for any agent that can produce a request.

**What can fail?** Per the [73], MCP follows OAuth 2.1 with authorization code + PKCE; servers must validate the token (introspection allowed); servers must publish a Protected Resource Metadata (RFC 9728) document. The spec explicitly:
- forbids token passthrough
- requires per-request token validation
- requires audience binding so the access token itself names the intended destination
- forbids tying authorization to the `Mcp-Session-Id`, which is "untrusted input"
- mandates least-privilege scopes rather than catch-all

Concretely enumerated threats from [4]:
- Confused-deputy: agent misuses privileged backend with a borrowed identity
- Token passthrough: servers forward upstream tokens without re-validation
- Session-based authorization: trusting session IDs as identity

Per [118], the attack pattern is "the application is the deputy because it is acting at the request of the user; confused because it was tricked into making a request on behalf of a malicious application." Azure APIM mitigation is documented at [117]: enforce per-client consent prompts and proxy Dynamic Client Registration through Azure APIM.

**How do you measure it?**
| Signal | Type | Target |
|---|---|---|
| Audience claim matches server (token-by-server) | Hard gate | 100% |
| Token-passthrough test pass rate | Hard gate | 0 violations in CI |
| Session-ID as identity test | Hard gate | 0 in any test |
| Scope granularity coverage (catch-all detection) | Hard gate | zero catch-all scopes live |
| PRM (RFC 9728) document freshness | Diagnostic | <=24h stale |

**How do you secure it?** Implement audience-bound tokens; one MCP access token = one server. Run token introspection per request so revocation propagates instantly. Publish PRM so clients can discover authorization server location. Standard security tools don't test for token-passthrough, so you must write the regression tests explicitly per [4].

**How do you deploy it?** Tiered promotion: (1) unit-level confused-deputy tests per server fixture; (2) integration tests against a published PRM; (3) live proxy via an API gateway that enforces audience binding. Rollback: revoke the audience binding so the old client cannot re-mint tokens.

**How do you know it works?** Hard gate: every MCP token-issuing server passes audience-binding and token-introspection tests in CI. Diagnostic: cross-server call attempts logged as security events. Failure pattern: a paper-grade OAuth integration that passes browser tests but fails on cross-server token reuse against prod targets.

## Section 5: Production AI Systems - Eval/Observability as the Deployment Contract

**Why this architecture?** AI applications release continuously but do not verify themselves; the offline-to-online eval pipeline is therefore the contract that binds every layer together. Without it, the only thing that proves correctness is the user complaint that proves failure.

**What can fail?** Six concrete failure classes:
1. Stale evals masking drift
2. Shadow metrics diverging from production KPIs without alerts
3. Eval-debt when teams skip writing regression tests for new agent paths
4. LLM-as-judge bias (position bias per [101])
5. Telemetry pipeline breakage causing silent drift in production for days
6. Trace schemas that diverge between teams, breaking cross-layer incident response

**How do you measure it?** The [61] documents a three-phase pipeline with three concrete control surfaces:
| Phase | Tool | Output feeds next phase |
|---|---|---|
| Offline regression | Fixed dataset, fixed checks, fixed thresholds ([107]) | Canary release |
| Canary / shadow | 5% traffic, control-chart thresholds | Online monitoring |
| Online monitoring | Alert threshold, baseline refresh schedule | Next offline run |

The [38] recommends production-backed staging data to unit-test against real workflow variants. The [23] says Openlayer "monitors embedding-based systems for drift, retrieval accuracy regression, and context quality degradation with real-time alerts."

**How do you secure it?** Content-capture controls per the [81] determine what is recorded in traces; production cuts default to PII-redacted capture. Eval suites must be held under change-control so a prompt-injection attack cannot poison the oracle. LLM judges must use deterministic seeds, calibrated rubrics, and pairwise counter-balancing to defeat position bias per [102].

**How do you deploy it?** Six OTel GenAI layers - LLM client, agent orchestration, MCP tool calls, content capture, evaluation - all upper-layer conventions are still in experimental status as of March 2026 per [81]. Every layer emits the same span tree so a single trace ties together mobile action, gateway dispatch, MCP call, LLM call, eval score.

**How do you know it works?** Hard gate: every release ships with shadow-score delta and embedding-drift delta both inside tolerance. Diagnostic: alert threshold computed via control chart on baseline; refresh baseline when the distribution shifts. Failure pattern: ship, then discover three days later that telemetry was broken and you have no signal.

## Section 6: Decision Matrix - Hard Gates vs Diagnostic Signals

Hard gates block the release; diagnostic signals produce investigation tickets. Use this in any review.

| Layer | Hard gate | Diagnostic signal |
|---|---|---|
| RAG | Recall@K >=0.80, faithfulness >=0.90, citation fidelity >=0.95 | Embedding cosine drift, daily drift alert at 0.06 |
| Agents w/ tools | Tool-shape invariants, side-effect reversal >=99%, approval-rate = 0 alone | Agent behavior drift <=0.05, orphaned skill count, skill-extension conflict log |
| Multi-agent | Tombstone wait >=24h, orphaned session count = 0 | Commit authorship overlap, cleanup-skip rate |
| MCP | Audience binding 100%, token-passthrough tests 0, session-ID-as-id 0 | PRM document freshness, cross-server call attempts |
| Production eval | Offline gates pass, shadow delta in tolerance | Control-chart alert thresholds, baseline refresh fires |
Source synthesis: AgentPatterns.ai anti-patterns, MCP official auth spec, OTel GenAI conventions, kindatechnical pipeline, Datadog offline eval, AgentPatterns anti-patterns stacked with [58].

## Section 7: Unified Control Plane - Five Layers, One Spine

The [68] defines the architecture as unifying "connection, identity, policy, and observability across every AI agent in the enterprise." The [30] gives a working example: "unified control plane to trace and evaluate agent behavior without guesswork," combining observability, automated and human-in-the-loop evaluations, and an adaptive AI gateway.

Three concrete integrations close the spine:

1. **OpenTelemetry GenAI span as backbone**: per [81], the GenAI SIG semantic conventions now cover agent orchestration, MCP tool calling, content capture, and quality evaluation all in the same trace. The [124] confirms `langfuse.trace.metadata.*` namespace maps onto filterable metadata.

2. **Eval pipeline as contract**: offline replay -> shadow/canary -> online control chart, with the [61] feedback loop where production data feeds the next offline run; baseline refresh policy when the distribution shifts; alert thresholds computed via control chart.

3. **Hard-gate enforcement at the policy layer**: a single service that owns the per-layer hard-gate set, called from the CI system, the canary pipeline, and the promotion pipeline. Anything that touches an AI agent goes through it; anything that doesn't is unowned.

Decision matrix: hard gates are enforced by the policy layer (block); diagnostics are surfaced by the observability layer (alert); corrections are made by the eval pipeline (loop back).

## Section 8: 30/60/90-Day Implementation Sequence for React Native + Hermes Mobile Gateway

Architecture assumption: React Native client on iOS/Android with Hermes engine, Mac gateway running Hermes-style agent + Kanban orchestrator, REST/MCP integration to enterprise systems. Following the [86]: "AI SRE adoption succeeds when teams treat it as an operational rollout, not a feature launch." Per Rootly's three phases adapted to this 5-layer stack:

**Days 1-30: Foundations - Close the Local-vs-Live Gap**

Goals:
- Closed CI signal: every PR touching AI logic runs offline evals
- Tool-call mocks live in CI
- Worktree isolation + tombstoning in place
- Mobile E2E frame: [112] running locally + a small physical-device set

Hard gates:
- Tool-shape invariants enforced in CI
- Worktree cleanup never deletes an active session
- Offline eval suite exists for RAG triad and one agent path
- Hermes desktop gateway running as a [63] (with known `StartLimitBurst=5` failure-mode pattern documented in [130])

Diagnostics: orphaned session count, tool-call shape variance, benchmark suite timing.

Failure pattern: shipping AI without offline evals, discovering breakage from user complaints.

**Days 31-60: Shadow Production - Close the CI-vs-Shadow Gap**

Goals:
- OpenTelemetry GenAI span tree emitted from mobile, gateway, MCP server, and backend
- Embedding-model pinning enforced; reranker version published per index
- Canary release live with 5% traffic and dual scoring
- MCP token issuance through APIM-style proxy with per-server audience binding

Hard gates:
- Audience binding 100% in CI token-passthrough tests
- Shadow delta inside tolerance; promotion blocked otherwise
- Mobile E2E covers the Hermes gateway dispatch path end-to-end on one Android and one iOS device
- Mobile-side instrumentation carries trace-id continuity to gateway

Diagnostics: embedding cosine drift daily; control-chart alert thresholds.

Failure pattern: shadow without telemetry continuity - incidents show the mobile user, the gateway, the MCP call, and the LLM call as four separate timelines.

**Days 61-90: Online Loop - Close the Shadow-vs-Live-Outcomes Gap**

Goals:
- Online control-chart monitoring with auto-refreshed baseline
- Live user outcome proof: trace-to-outcome joins for the last 14 days
- Stale-eval detection: an audit job that flags evals identical to v1 of themselves for >=30 days
- Multi-agent ownership registry live, with single-owner enforcement on shared files

Hard gates:
- Approval-rate for agent-created approvals still 0 without human sign-off
- Eval coverage gate on any new agent path; no path ships without a corresponding frozen eval
- Embedding drift alert at 0.06 topics on first occurrence

Diagnostics: orphaned skill count; agent-behavior drift; command-and-control alert routing.

Failure pattern: assuming "no complaints this week" means "it works." With telemetry alone you measure traffic, not value. Live outcome joins like completion-rate and re-engagement are the only signals that matter.

## Synthesis

Five layers, one spine. The decisive contrasts that hold across layers:

1. **Mechanism**: hard-gate enforcement is identical across all five layers - policy layer + span evidence + eval oracle. Where they differ is what the gate measures. RAG measures recall/faithfulness; agents measure tool shape and side-effect reversal; multi-agent measures tombstone wait and authorship; MCP measures audience and scope; production measures shadow delta and embedding drift. The mechanism is the same; the metric is the same kind of thing (binary compliance), not a score.

2. **Scope**: the five layers span different blast radii. An MCP confused-deputy bug compromises enterprise perimeter; an RAG citation drift damages a single answer's correctness but not other users; an agent tool side-effect can be local. Therefore, the promote-to-production gates should be ordered by blast radius - MCP and agent side-effects warrant stricter gates than RAG drift.

3. **Trade-offs**: the offline-to-online pipeline trades compute (replay) and engineering time (eval suites + mocks + tombstones) for regression catching. The alternative is shipping with confidence derived only from CI unit tests, which is provably insufficient per [107] and [109] ("every week, engineering teams ship AI agent changes that silently break behavioral properties").

4. **Evidence base**: the framework that wins is the one with multi-source backing. The OTel GenAI conventions are experimental per [81]; MCP spec is normative per [73]; the agent anti-pattern catalog is community-curated per [57] plus [58]. Choose normative bits for gates; choose experimental bits for diagnostics.

5. **Time horizon**: every layer is converging on the same model - five years from now, the offline-to-online contract plus OTel GenAI spans plus per-server MCP audience will be table stakes. Today, they are pre-emptive controls that catch regressions competitors miss.

Cross-cutting non-obvious tensions:
- **Stale-test preservation vs eval coverage gate**: a coverage gate can lock in staleness by counting *passes* not *diversity*. Audit the test set for fingerprint duplicates and retire them; gate on assertion density, not test count.
- **Cleanup automation vs worktree corruption**: cleanup is a feature; corruption is a regression of the feature. Tombstone + audit solve it; never let cleanup run against `active=true` sessions.
- **RAG citation vs recall**: high recall with low citation fidelity is the most dangerous RAG state because the model cites confidently wrong sources. Citation-fidelity is therefore a hard gate, recall a diagnostic.
- **Agent ownership vs agent autonomy**: ownership metadata is for accountability, not control - the agent still runs. The tension is whether the metadata gates deploys or just routes reverts. Gate deploys; route reverts via single-owner.
- **MCP audience binding vs federated identity**: in federated enterprise identity, audiences multiply; a token issued for one server may legitimately need to call a chained service. Resolve by per-hop audience binding, not by relaxing the audience rule.
- **Local tests to physical-device E2E to CI to deployment to live outcome**: each transition is a gate. The 30/60/90 sequence above gates each transition, and the live outcome proof at day 90 is the only signal that closes the loop. Without it, you measure development effort, not user value.

## References

1. *MCP Security Risks & Best Practices: Enterprise Guide - Truefoundry*. https://www.truefoundry.com/blog/mcp-security-risks-best-practices
2. *MCP security best practices expose the confused deputy risk*. https://nhimg.org/articles/mcp-security-best-practices-expose-the-confused-deputy-risk
3. *MCP Security: Risks and Best Practices Explained*. https://www.nudgesecurity.com/post/mcp-security-risks-mcp-server-exposure-and-best-practices-for-the-ai-agent-era
4. *MCP Security Testing: Tools and Methodologies - Aembit*. http://aembit.io/blog/mcp-security-testing
5. *MCP confused deputy risk: what IAM teams need to enforce*. https://nhimg.org/community/nhi-best-practices/mcp-confused-deputy-risk-what-iam-teams-need-to-enforce
6. *RAG Anti-patterns in the Wild, and How to Fix Them*. https://maven.com/p/35585d/rag-anti-patterns-in-the-wild-and-how-to-fix-them
7. *Enterprise RAG Knowledge Base Architecture (2026): 8 ...*. https://getdevstudio.com/blog/enterprise-rag-knowledge-base-architecture
8. *RAG in Production: Avoiding Common Pitfalls — dan\woolr*. http://www.danieljwoolridge.com/blog/2025/4/24/rag-in-production-avoiding-common-pitfalls
9. *Chunking Strategies for RAG: A Practical Guide to High ...*. https://medium.com/%40kanavkalra87/chunking-strategies-for-rag-a-practical-guide-to-high-accuracy-retrieval-in-production-llm-systems-48dd60cb8d60
10. *Vector Drift in Azure AI Search: Three Hidden Reasons Your RAG ...*. https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/vector-drift-in-azure-ai-search-three-hidden-reasons-your-rag-accuracy-degrades-/4493031
11. *RAG Evaluation 2026: Methods, Metrics, Frameworks*. https://datavlab.ai/post/rag-evaluation-methods-metrics-2026-guide
12. *RAG Evaluation Metrics: Measure And Improve Systems*. http://customgpt.ai/rag-evaluation-metrics
13. *RAG Evals: Retrieval Relevance, Grounding, and Citation Fidelity*. http://vikasgoyal.github.io/agentic/observe/rag-evals.html
14. *A complete guide to RAG evaluation: metrics, testing and best practices*. http://evidentlyai.com/llm-guide/rag-evaluation
15. *Ragas*. http://docs.ragas.io/en/stable
16. *Mobile CI/CD built for React Native - expo.dev*. https://expo.dev/services/workflows
17. *E2E Testing React Native with Maestro: A Practical Guide*. https://dev.to/peakiqofficial/e2e-testing-react-native-with-maestro-a-practical-guide-1g79
18. *Maestro-compatible E2E test runner for React Native. - GitHub*. https://github.com/enzomanuelmangano/ennio
19. *Methodical Software | Technical awareness for project planning*. http://methodical.software/
20. *The Best Mobile E2E Testing Frameworks in 2026 - QA Wolf*. https://www.qawolf.com/blog/best-mobile-app-testing-frameworks-2026
21. *Common Challenges in RAG and How to Solve Them in Production ...*. https://unstructured.io/insights/rag-pipeline-challenges-from-data-ingestion-to-retrieval
22. *The Embeddings Drift Problem & Why Your RAG Retrieval Quality ...*. https://pithycyborg.substack.com/p/the-embeddings-drift-problem-and
23. *Embedding models guide March 2026*. http://openlayer.com/blog/post/what-are-embedding-models-complete-guide
24. *RAG Is Blind to Time — I Built a Temporal Layer to Fix It in Production*. https://towardsdatascience.com/rag-is-blind-to-time-i-built-a-temporal-layer-to-fix-it-in-production
25. *Embedding Models and Rerankers: The Overlooked Accuracy Layer in ...*. https://vdf.ai/blog/embedding-models-rerankers-private-rag-on-premises
26. *Agent observability: The complete guide for 2026 - Articles ...*. https://www.braintrust.dev/articles/agent-observability-complete-guide-2026
27. *AI observability tools: A buyer's guide to monitoring AI ...*. https://www.braintrust.dev/articles/best-ai-observability-tools-2026
28. *Eval-driven development: Build and evaluate reliable AI agents*. https://developers.redhat.com/articles/2026/03/23/eval-driven-development-build-evaluate-ai-agents
29. *Hamming AI | Enterprise Voice Agent Testing & Production Monitoring*. http://hamming.ai/
30. *Respan (formerly Keywords AI) gives teams a unified control plane to trace and evaluate agent behavior without guesswork, automatically surface issues,*. http://ycombinator.com/companies/respan
31. *Git Worktree for Multi-Agent Dev: Setup Guide | Termdock*. https://www.termdock.com/blog/git-worktree-multi-agent-setup
32. [[Literature Review] Isolation as a First-Class Principle for ...](https://www.themoonlight.io/review/isolation-as-a-first-class-principle-for-llm-agent-system-safety-concepts-taxonomy-challenges-and-future-directions)
33. *Git Worktree Conflicts with Multiple AI Agents: Diagnosis and Fixes*. https://www.termdock.com/en/blog/git-worktree-conflicts-ai-agents
34. *Isolation as a First-Class Principle for LLM-Agent System ...*. https://www.roboticscenter.ai/research/papers/isolation-as-a-first-class-principle-for-llm-agent-system-safety-concepts-taxonomy-challen-2607
35. *The Hermes Kanban: A Complete Guide to Multi-Agent Task ...*. https://magnus919.com/2026/05/the-hermes-kanban-a-complete-guide-to-multi-agent-task-orchestration
36. *Offline vs. online evaluation at the application layer: a ...*. https://rhesis.ai/post/offline-vs-online-evaluation-llm-applications
37. *Offline vs Online LLM Evals - Max Petrusenko*. https://www.maxpetrusenko.com/blog/offline-vs-online-llm-evals
38. *Offline evaluation for AI agents: Best practices - Datadog*. https://www.datadoghq.com/blog/offline-llm-evaluations
39. *Offline Eval to Online Monitoring Pipeline - kindatechnical()*. https://kindatechnical.com/testing-non-deterministic-systems/offline-eval-to-online-monitoring-pipeline.html
40. *eval-gate/src/evalgate/shadow at main · AndyUneducated/eval ...*. https://github.com/AndyUneducated/eval-gate/tree/main/src/evalgate/shadow
41. *How we scored #1 on Terminal-Bench (52%) - Warp*. http://warp.dev/blog/terminal-bench
42. *Terminal-Bench*. https://www.tbench.ai/
43. *Terminal-Bench Hard Benchmark Leaderboard*. http://artificialanalysis.ai/evaluations/terminalbench-hard
44. *Terminal-Bench: Benchmarking Agents on Hard, Realistic Tasks ...*. https://arxiv.org/html/2601.11868v1
45. [[2601.11868] Terminal-Bench: Benchmarking Agents on Hard ...](https://arxiv.org/abs/2601.11868)
46. *Git Worktree for AI Agents: Enabling Parallel Development ...*. https://docs.bswen.com/blog/2026-03-30-git-worktree-ai-agents
47. *Git Worktrees for AI Coding: How to Run Multiple Agents ...*. https://www.mindstudio.ai/blog/git-worktrees-parallel-ai-coding-agents
48. *Run parallel sessions with worktrees*. http://code.claude.com/docs/en/worktrees
49. *I implemented parallel agents using separate Git worktrees ...*. https://www.reddit.com/r/AI_Agents/comments/1ovut68/i_implemented_parallel_agents_using_separate_git
50. *Add ExitWorktree tool to complement EnterWorktree #29436*. http://github.com/anthropics/claude-code/issues/29436
51. *title: Authorization description: Add OAuth 2.1 authorization to your MCP server using Cloudflare Access, third-party providers, or your own identity system. image: https://developers.cloudflare.com/dev-products-preview.png*. http://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization
52. *MCP Docs – Model Context Protocol （MCP）*. https://modelcontextprotocol.info/docs
53. *Roots - Model Context Protocol*. https://modelcontextprotocol.io/specification/2025-06-18/client/roots
54. *MCP Best Practices: Architecture & Implementation Guide*. https://modelcontextprotocol.info/docs/best-practices
55. *MCP Servers - docs.sentry.io*. https://docs.sentry.io/ai/monitoring/mcp
56. *AI Agent Reliability 2026: Failure Modes + Observability*. https://stackpulsar.com/blog/ai-agent-reliability-monitoring
57. *AI Agent Development Anti-Patterns and Failure Modes - AgentPatterns.ai*. http://agentpatterns.ai/anti-patterns
58. *Taxonomy of Failure Modes in Agentic AI Systems - v2*. https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/microsoft/bade/documents/products-and-services/en-us/security/Taxonomy-of-Failure-Modes-in-Agentic-AI-Systems-v2-0.pdf
59. *AI Agent Testing & Validation Platform — Chronicle Labs*. http://chronicle-labs.com/
60. *Agentic AI Enterprise 2026: Why 79% of Deployments Never ...*. https://thebriefscript.com/agentic-ai-enterprise-2026-deployment-gap
61. *kindatechnical() - Offline Eval to Online Monitoring Pipeline*. http://kindatechnical.com/testing-non-deterministic-systems/offline-eval-to-online-monitoring-pipeline.html
62. *Hermes V1 in React Native 0.82 — Unlocking Faster Startup ...*. https://medium.com/react-native-journal/hermes-v1-in-react-native-0-82-unlocking-faster-startup-times-bfd0cf1b107c
63. *hermes gateway start/install fails on macOS with launchctl ...*. https://github.com/NousResearch/hermes-agent/issues/11323
64. *Releases · react/react-native*. https://github.com/react/react-native/releases
65. *Hermes ABI Mismatch Expo SDK 54 Fix Guide - weblineglobal.com*. https://www.weblineglobal.com/blog/fix-hermes-abi-mismatch-expo-sdk-54
66. *Hermes Agent Gateway Setup for Telegram and Slack*. https://evomap.ai/blog/hermes-agent-gateway-telegram-slack
67. *Platform Engineer (SRE) - AI Control Plane @ Speakeasy*. https://jobs.ashbyhq.com/Speakeasy/43904ba3-3792-4cc4-b097-6e98ca9a1b4b/application
68. *AI control plane: the architecture for AI governance and security*. http://speakeasy.com/resources/ai-control-plane
69. *Respan: The Unified Agent Control Plane | Gradient Ventures*. http://gradient.com/blog/posts/respan-seed
70. *The AI control plane to secure every agent ... - Speakeasy*. http://speakeasy.com/product/ai-control-plane
71. *Bind Every MCP Token to One Server - Zuplo*. https://zuplo.com/blog/bind-mcp-tokens-to-one-server
72. *Authorization with the MCP server failed. You can check your credentials and permissions. If this persists, share this reference with support: `ofid_…` · Issue #327 · anthropics/claude-ai-mcp · GitHub*. http://github.com/anthropics/claude-ai-mcp/issues/327
73. *Understanding Authorization in MCP*. http://modelcontextprotocol.io/docs/tutorials/security/authorization
74. *MCP 2025-03-26 Spec Breakdown: OAuth Authentication, Remote ...*. https://qubittool.com/blog/mcp-2025-spec-oauth-remote-agent-skills
75. *Model Context Protocol (MCP): Understanding security risks and controls*. http://redhat.com/en/blog/model-context-protocol-mcp-understanding-security-risks-and-controls
76. *TruLens: Evals and Tracing for Agents*. https://www.trulens.org/
77. *trulens-eval*. https://pypi.org/project/trulens-eval
78. *Stop RAG Regressions: RAGAS, DeepEval & TruLens*. https://www.bestaiweb.ai/how-to-build-a-rag-evaluation-harness-with-ragas-deepeval-and-trulens-in-2026
79. *Production RAG in 2025: Evaluation Suites, CI/CD Quality ...*. https://dextralabs.com/blog/production-rag-in-2025-evaluation-cicd-observability
80. *RAGAS, TruLens, DeepEval: LLM Evaluation Frameworks (2026)*. http://atlan.com/know/llm-evaluation-frameworks-compared
81. *How OpenTelemetry Traces LLM Calls, Agent Reasoning, and MCP ...*. http://greptime.com/blogs/2026-05-09-opentelemetry-genai-semantic-conventions
82. *Datadog Agent Observability natively supports OpenTelemetry GenAI Semantic Conventions | Datadog*. http://datadoghq.com/blog/llm-otel-semantic-convention
83. *OpenTelemetry GenAI Semantic Conventions - The Standard for ...*. http://dev.to/x4nent/opentelemetry-genai-semantic-conventions-the-standard-for-llm-observability-1o2a
84. *LLM Observability in 2026: Tracing, Evaluation, and the ...*. https://1337skills.com/blog/2026-06-18-llm-observability-2026-tracing-evaluation-phoenix-langfuse
85. *OpenTelemetry GenAI Semantic Conventions | MLflow AI Platform*. http://mlflow.org/docs/latest/genai/tracing/opentelemetry/genai-semconv
86. *Rootly Guide | AI SRE Guide - AI SRE Implementation Guide: A 90-Day Rollout Plan*. http://rootly.com/ai-sre-guide/implementation-guide
87. *Zurich Insurance scales Cytora AI platform across global underwriting operations - Reinsurance News*. http://reinsurancene.ws/zurich-insurance-scales-cytora-ai-platform-across-global-underwriting-operations
88. *Scaling AI in Marketing — A Strategic Plan for Enterprises*. http://typeface.ai/blog/ai-adoption-plan-for-marketing
89. *Zurich expands agentic AI rollout with Cytora partnership - FinTech Global*. http://fintech.global/2026/05/18/zurich-expands-agentic-ai-rollout-with-cytora-partnership
90. *4 Phase Enterprise AI Rollout Framework for Marketing Teams*. http://typeface.ai/blog/4-phases-of-enterprise-ai-rollout-for-marketers
91. *Judgment Labs — The continuous-improvement stack for agents*. http://judgmentlabs.ai/
92. *Contact — Mindoverflow.ai*. http://mindoverflow.ai/contact
93. *Judgment Labs | software_development, ai, devtools ...*. http://standout.work/companies/judgment-labs
94. *regression-detection · GitHub Topics · GitHub*. https://github.com/topics/regression-detection?o=asc&s=stars
95. *Kanban (Multi-Agent Board) | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban
96. *Hermes Agent Documentation | Hermes Agent*. https://hermes-agent.nousresearch.com/docs
97. *Kanban tutorial | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban-tutorial
98. *Agent 37 - Managed OpenClaw & Hermes Hosting*. http://agent37.com/
99. *LLM as a Judge: The Complete Evaluation Guide (2026)*. http://qaskills.sh/blog/llm-as-judge-evaluation-guide-2026
100. *LLM-as-a-judge*. https://llm-as-a-judge.github.io/
101. *Judging the Judges: A Systematic Study of Position Bias in ...*. https://aclanthology.org/2025.ijcnlp-long.18
102. *LLM As a Judge: Tutorial and Best Practices - Patronus AI*. https://www.patronus.ai/llm-testing/llm-as-a-judge
103. *A survey on LLM-as-a-judge - ScienceDirect.com*. https://www.sciencedirect.com/science/article/pii/S2666675825004564
104. *Architecture | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/developer-guide/architecture
105. *Hermes Agent Masterclass: Build Autonomous AI Workflows*. http://udemy.com/course/hermes-agent-masterclass-build-autonomous-ai-workflows
106. *hermes-agent/skills/devops/kanban-worker/SKILL.md at main ...*. https://github.com/NousResearch/hermes-agent/blob/main/skills/devops/kanban-worker/SKILL.md
107. *LLM eval harness: catch regressions in CI | Boundev*. https://www.boundev.ai/blog/llm-eval-ci-regression-model-updates
108. *Regression Testing LLM Systems in CI/CD - DeepEval*. https://deepeval.com/guides/guides-regression-testing-in-cicd
109. *About — Maida.AI*. http://maida.ai/about
110. *regrada*. http://regrada.com/
111. *CI/CD for LLM apps: Run tests with Evidently and GitHub ...*. https://www.evidentlyai.com/blog/llm-unit-testing-ci-cd-github-actions
112. *React Native Automation: Setup Guide - Maestro*. https://maestro.dev/insights/react-native-automation-setup-guide
113. *Maestro: BrowserStack vs Your Own Devices - DeviceLab*. http://devicelab.dev/blog/maestro-browserstack-vs-own-devices
114. *React Native | Maestro Docs*. https://docs.maestro.dev/get-started/supported-platform/react-native
115. *Parallel UI Testing for Mobile & Web | Maestro Cloud*. http://maestro.dev/cloud
116. *End-to-End UI Testing for Mobile Apps with Maestro*. http://maestro.dev/insights/end-to-end-ui-testing-for-mobile-apps-with-maestro
117. *Confused Deputy Attacks In MCP, Solved With Azure APIM*. https://den.dev/blog/mcp-confused-deputy-api-management
118. *confused-deputy-attack*. https://cornucopia.owasp.org/taxonomy/attacks/confused-deputy-attack
119. *Prompt Injection Defense: The Complete 2026 Security Guide*. https://sureprompts.com/blog/prompt-injection-defense-complete-guide-2026
120. *Prompt Injection in 2026: 7 Attack Patterns We See*. https://cybersecify.com/blog/prompt-injection-2026-attack-patterns
121. *Langfuse*. http://platform.tracxn.com/a/d/company/644588a72dcfa96a0f6ccdc1/langfuse#a:about
122. *title: "AI Agent Observability, Tracing & Evaluation with Langfuse" date: 2025/03/16 description: "Trace, monitor, evaluate, and test AI agents in production. Learn about agent observability strategies, evaluation techniques, and how to use Langfuse with LangGraph, OpenAI Agents, Pydantic AI, CrewAI, and more." ogImage: /images/blog/ai-agent-observability/ai-agent-observability.png tag: agents, guide, evaluation author: Jannik*. http://langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse
123. *LLM Observability & Application Tracing (Open Source)*. http://langfuse.com/docs/observability/overview
124. *title: OpenTelemetry (OTEL) for LLM Observability description: Connect Langfuse to OpenTelemetry (OTEL) and send OTLP traces from your application or collector to Langfuse. sidebarTitle: OpenTelemetry logo: /images/integrations/opentelemetry_icon.svg*. http://langfuse.com/integrations/native/opentelemetry
125. *Langfuse*. http://ycombinator.com/companies/langfuse
126. *hermes-agent/README.md at main · NousResearch ... - GitHub*. https://github.com/NousResearch/hermes-agent/blob/main/README.md
127. *Hermes Agent | Nous Research*. http://hermes-agent.nousresearch.com/
128. *Hermes Agent 中文文档、安装教程与社区*. https://hermesagent.org.cn/
129. *Hermes Agent | OpenRouter*. http://openrouter.ai/apps/hermes-agent
130. *Gateway service: exit code mismatch causes StartLimitBurst=5 ...*. https://github.com/NousResearch/hermes-agent/issues/14051
131. *Gateway crashes on Telegram Bad Gateway (502) — reconnect ...*. https://github.com/NousResearch/hermes-agent/issues/3173
132. [[Gateway] Stuck session resumes on restart — creates ...](https://github.com/NousResearch/hermes-agent/issues/7536)
133. *Installation | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/getting-started/installation
134. *Specification - Model Context Protocol*. https://modelcontextprotocol.io/specification/2025-11-25
135. *Model Context Protocol (MCP) explained: A practical ...*. http://codilime.com/blog/model-context-protocol-explained
136. *The MCP Protocol Handbook: Every JSON-RPC Method Explained*. https://mcp-find.org/blog/mcp-protocol-handbook
137. *Specification - Model Context Protocol*. https://modelcontextprotocol.io/specification/2025-06-18
138. *DeepEval - The LLM Evaluation Framework*. http://docs.confident-ai.com/
139. *G-Eval | DeepEval - The LLM Evaluation Framework*. https://deepeval.com/docs/metrics-llm-evals
140. *Top 5 LLM Evaluation Frameworks in 2026, Compared - DeepEval*. http://deepeval.com/blog/top-5-llm-evaluation-frameworks
141. *List of available metrics*. http://docs.ragas.io/en/stable/concepts/metrics/available_metrics
142. *Introduction to LLM Evaluation Metrics - DeepEval*. https://deepeval.com/docs/metrics-introduction
143. *Taming Git Worktrees: From Chaos to a Clean Hub Structure*. http://medium.com/%40drmikecrowe/taming-git-worktrees-from-chaos-to-a-clean-hub-structure-badc9b4f0200
144. *Another Git process seems to be running in this repository*. https://stackoverflow.com/questions/38004148/another-git-process-seems-to-be-running-in-this-repository
145. *http://git-scm.com/docs/git-worktree*. http://git-scm.com/docs/git-worktree
146. *Sharing my Claude Code rules: agent safety and worktree isolation*. https://blog.nghia-pham.com/blog/claude-code-rules-agent-safety-worktree-isolation
147. *Per-worktree local exclusion - git*. http://stackoverflow.com/questions/48779515/per-worktree-local-exclusion
148. *Agent Evaluation - GitHub Pages*. http://awslabs.github.io/agent-evaluation
149. *Speeding up the iteration cycle with Offline Replay ...*. https://medium.com/pinterest-engineering/experiment-without-the-wait-speeding-up-the-iteration-cycle-with-offline-replay-experimentation-7a4a95fa674b
150. *Offline Evaluation of Multi-Armed Bandit Algorithms in Python ...*. https://jamesrledoux.com/algorithms/offline-bandit-evaluation
151. *Evals - Lindy Documentation*. https://docs.lindy.ai/fundamentals/lindy-101/evals
