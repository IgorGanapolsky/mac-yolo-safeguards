# Ready-to-post: answer for poolsideai/pool#38

**Target:** https://github.com/poolsideai/pool/issues/38 ("Every prompt results in `Error during ACP method session/prompt`")
**Posting account:** IgorGanapolsky (via Mac-side `gh` or any properly cross-owner-scoped session — this CCR session cannot post cross-owner).
**Verified this run:** issue still open, zero comments, reporter's pasted 400 body still the only detail available. Cross-checked the version-1.0.15 changelog claim against `poolsideai/pool`'s own `CHANGELOG.md` (cloned locally) — confirmed verbatim.
**Shelf life:** re-check the issue is still open/unanswered before posting; if closed or a maintainer already replied, skip.

---

This 400 is a Pydantic validation error from vLLM's OpenAI-compatible endpoint, not something on your end. Looking at the payload you pasted, the tool_call at message index 1 is `{'id': '019fdcf3-e6aa-76e5-9b65-059d74ffa3c6', 'type': 'function'}` — it's missing the `function: {name, arguments}` object entirely. The OpenAI/vLLM schema for tool_calls is a discriminated union (`ChatCompletionMessageFunctionToolCallParam` vs `ChatCompletionMessageCustomToolCallParam`), so a `type:"function"` entry with no `function` field fails validation against both branches — that's why you get 3 errors instead of one.

This lines up with the 1.0.15 changelog entry "Added support for encrypted reasoning tokens" — that's the release where this started for you. Worth checking whether the new reasoning-token serialization path is dropping the `function` field when Pool re-emits a prior assistant tool_call as part of conversation history on the next turn (message index 1 = an earlier turn being echoed back). As a workaround, downgrading to 1.0.14 should avoid it since encrypted reasoning tokens didn't exist in that build yet.
