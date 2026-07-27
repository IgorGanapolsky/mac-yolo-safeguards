# Tinker-Yolo full-tool runtime research — July 2026

Parallel deep-research run: `trun_8d4d975cbb0e4c1db0f23b5cf8df5831`

## Verdict

`tinker-yolo` reported no filesystem, tools, or internet because the wrapper
started `ollama run`, which is a chat client. A model may produce tool-call
syntax, but a host agent still has to declare schemas, parse calls, execute the
named functions, append tool results to conversation history, and continue the
loop. The installed Qwen tag is capable: a no-cost local `/api/chat` probe with
a `get_working_directory` schema returned a native structured `tool_calls`
object. The missing component was the dispatcher, not the model or API key.

The production architecture is therefore:

```text
user -> tinker-yolo REPL -> local agent loop -> Ollama /api/chat
                               |                    |
                               |                    +-- Qwen tool decision
                               +-- file/shell/web execution + receipts
```

This is local and free. Tinker authentication is irrelevant to this path.

## What the official material establishes

1. The [Tinker quickstart](https://tinker-docs.thinkingmachines.ai/tinker/quickstart/)
   describes hosted training and sampling clients. It does not install a local
   terminal or filesystem agent.
2. The official [Tinker cookbook](https://github.com/thinking-machines-lab/tinker-cookbook)
   contains an experimental `tinker_cookbook.tool_use` environment. Its
   `AgentToolMessageEnv` accepts host-provided tools, validates function names
   and JSON arguments, executes calls, appends tool results, and enforces turn
   and call limits. That is the same missing host-side responsibility.
3. The cookbook's end-to-end tool test explicitly covers `Qwen/Qwen3-8B` with
   the Qwen3 renderer. Renderer choice matters for remote Tinker sampling and
   training, but Ollama already returned native calls from the installed local
   quantization.
4. [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)
   uses JSON-schema `tools` and returns `message.tool_calls`; the host executes
   each call and sends a `role=tool` result back to `/api/chat`.
5. [Inkling](https://thinkingmachines.ai/inkling/) is designed for agentic
   coding and tool use, but its 975B total parameters cannot reside on either
   24 GB-class Mac. Inkling is a remote, metered Tinker brain here—not a local
   runtime.

## Chosen implementation

| Concern | Decision |
|---|---|
| Default brain | Existing local `qwen3-hermes-tinker:q4` through Ollama |
| Agent loop | Standard-library Python, non-streaming `/api/chat`, native tool calls plus Qwen `<tool_call>` fallback |
| Filesystem | Read, list, ripgrep search, atomic write, exact replacement; direct paths remain under the starting workspace |
| Execution | Bounded `/bin/zsh -c` with cwd validation, process-group timeout, output caps, and secret-like environment variables removed |
| Internet | Structured HTTP fetch and DuckDuckGo HTML search; shell networking remains available |
| Reliability | Maximum turns/tool calls, third-identical-call breaker, tool errors returned to the model, and one automatic correction for false “no access” claims |
| Audit | Mode-0600, hash-chained metadata receipts; file contents and command output are not persisted |
| Project rules | Bounded, secret-redacted `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` injection |
| Remote Inkling | Existing explicit `ask` route only; paid approval and cost cap remain mandatory |
| Training/upload | Existing proof/train/deploy approval and data-upload gates remain unchanged |

## Threat model and limits

- Web, file, and command output are untrusted data. They never modify the
  system prompt or tool catalogue.
- JSON tool arguments are dispatched by exact function name. Free-form prose is
  never executed. Tagged-call parsing is limited to `<tool_call>` JSON.
- Direct filesystem functions reject `..`, absolute-path, and symlink escapes
  outside the workspace. `run_shell` intentionally has normal local-account
  authority because this is a yolo coding agent; its working directory is
  workspace-scoped and its environment excludes secret-like variables.
- Commands have a ten-minute hard maximum and a two-minute default. A timeout
  terminates the process group rather than only the shell parent.
- Network and shell output is bounded and common secret forms are redacted
  before returning to the model.
- This is not a security boundary against a deliberately malicious local
  account. It is a bounded autonomous coding runtime comparable in intent to
  other local yolo wrappers.

## Evidence gates

- Hermetic tests must prove every tool class, native and tagged calls, false
  no-access recovery, loop breaking, timeouts, environment stripping, receipt
  privacy, and wrapper dispatch.
- A live local run must make the model call filesystem, shell, and web tools and
  verify the artifact rather than merely answer that it could.
- The installed wrapper and agent source must match the merged commit on both
  Macs.
- No remote Tinker request, dataset upload, or paid model process is allowed in
  these proofs.

## Primary sources

- [Tinker quickstart](https://tinker-docs.thinkingmachines.ai/tinker/quickstart/)
- [Tinker cookbook repository](https://github.com/thinking-machines-lab/tinker-cookbook)
- [Tinker cookbook tool-use package](https://github.com/thinking-machines-lab/tinker-cookbook/tree/main/tinker_cookbook/tool_use)
- [Inkling](https://thinkingmachines.ai/inkling/)
- [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)
- [Ollama chat API](https://docs.ollama.com/api/chat)
- [Qwen3](https://github.com/QwenLM/Qwen3)
- [OpenAI Codex CLI](https://github.com/openai/codex)
- [Claude Code security and permissions](https://docs.anthropic.com/en/docs/claude-code/security)
