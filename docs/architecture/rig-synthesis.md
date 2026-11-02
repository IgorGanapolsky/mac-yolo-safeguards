# Architectural Synthesis: Rig (`rig.rs`) Patterns in `mac-yolo-safeguards`

Rig (`rig.rs`) is a modular Rust library for building LLM-powered applications and agents. This document synthesizes key architectural patterns from Rig into our agent harness and local multi-agent system (`mac-yolo-safeguards`).

## 1. Core Architectural Takeaways from Rig

1. **Separation of Portable Contracts and Orchestration (`rig-core` vs `rig-agent`)**:
   - Rig cleanly decouples provider clients, model abstractions (`Model`, `DynModel`), messages, tool traits, and vector store traits (`rig-core`) from the agent execution loop, hooks, state machines, and run builders (`rig-agent`).
   - *Application to our stack*: Ensure our agent harness separates protocol/transport definitions from runtime execution steps, allowing lightweight model substitution and dry-run state machine stepping without invoking I/O.

2. **Type-Safe by Construction Tool Definitions and Structured Outputs**:
   - Rig enforces that tool arguments and structured outputs are ordinary Rust types validated at compile time (`schemars::JsonSchema` + `serde::Deserialize`).
   - *Application to our stack*: Ensure all agent tools and JSON extraction endpoints in our local tools and MCP services use strongly typed schemas with automatic fallback/retry behavior.

3. **Deterministic Steppable State Machines (`AgentRun`)**:
   - Rig exposes the agent loop's internal decisions as `AgentRun`, enabling developers to step through turns, persist state between steps, and resume execution elsewhere.
   - *Application to our stack*: Adopt steppable, inspectable state machine records for complex multi-agent workflows (e.g., PR hygiene, automated bug remediation) so execution can be audited and paused/resumed reliably.

4. **Agents as Tools (Manager-Worker Pattern)**:
   - Rig allows an agent to be converted into a tool (`agent.into_tool()?`) so a coordinating manager agent can delegate subtasks to specialized worker agents seamlessly.
   - *Application to our stack*: Enhance our multi-agent coordination bus (`agent-mesh`) and subagent delegation workflows to treat specialized subagents as composable tool abstractions.

5. **Portable Model Type-Erasure (`DynModel`)**:
   - Rig provides `DynModel` to type-erase provider-specific model types so different providers can be shared across agents sharing the same runtime.
