#!/usr/bin/env python3
"""Contract tests for the Hermes OpenAI->Ollama shim.

Why this exists: on 2026-07-29 the shim silently dropped `tools` from requests
and `tool_calls` from responses, so every local agent (grok-yolo, hermes-yolo,
tinker chats) emitted prose and never executed anything for six days. Nothing
failed loudly — the HTTP contract stayed valid, only the agent loop died. These
tests pin the tool-call round trip in both directions.

No network and no server: the module is imported and its pure functions are
exercised directly.
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
import unittest

REPO = pathlib.Path(__file__).resolve().parents[1]
SHIM_SOURCE = REPO / "tools" / "ollama-openai-shim.py"
DEPLOYED_SHIM = pathlib.Path.home() / ".hermes" / "bin" / "ollama_openai_shim.py"


def load_shim():
    spec = importlib.util.spec_from_file_location("hermes_ollama_shim", SHIM_SOURCE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


shim = load_shim()


class ToolCallMappingTest(unittest.TestCase):
    def test_openai_tool_calls_convert_to_ollama_shape(self):
        converted = shim._openai_tool_calls_to_ollama([
            {
                "id": "call_abc1",
                "type": "function",
                "function": {"name": "get_weather", "arguments": '{"city":"Boston"}'},
            }
        ])
        self.assertEqual(len(converted), 1)
        self.assertEqual(converted[0]["id"], "call_abc1")
        # Ollama wants a dict, not the OpenAI JSON string.
        self.assertEqual(converted[0]["function"]["arguments"], {"city": "Boston"})

    def test_unparseable_arguments_are_preserved_not_dropped(self):
        converted = shim._openai_tool_calls_to_ollama([
            {"function": {"name": "f", "arguments": "not json"}}
        ])
        self.assertEqual(converted[0]["function"]["arguments"], {"_raw": "not json"})

    def test_ollama_tool_calls_convert_to_openai_shape(self):
        converted = shim._ollama_tool_calls_to_openai([
            {"function": {"name": "get_weather", "arguments": {"city": "Boston"}}}
        ])
        self.assertEqual(len(converted), 1)
        call = converted[0]
        self.assertEqual(call["type"], "function")
        self.assertEqual(call["index"], 0)
        self.assertTrue(call["id"], "an id must be synthesised when Ollama omits one")
        # OpenAI wants a JSON string, not a dict.
        self.assertEqual(json.loads(call["function"]["arguments"]), {"city": "Boston"})

    def test_empty_and_malformed_inputs_yield_no_calls(self):
        for value in (None, [], ["not-a-dict"]):
            self.assertEqual(shim._ollama_tool_calls_to_openai(value), [])
            self.assertEqual(shim._openai_tool_calls_to_ollama(value), [])


class MessageNormalizationTest(unittest.TestCase):
    def test_assistant_tool_calls_survive_normalization(self):
        normalized = shim._normalize_messages([
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [{"id": "c1", "function": {"name": "f", "arguments": "{}"}}],
            }
        ])
        self.assertIn("tool_calls", normalized[0])
        self.assertEqual(normalized[0]["tool_calls"][0]["id"], "c1")

    def test_tool_result_messages_keep_their_linkage(self):
        normalized = shim._normalize_messages([
            {"role": "tool", "tool_call_id": "c1", "name": "get_weather", "content": "sunny"}
        ])
        self.assertEqual(normalized[0]["tool_call_id"], "c1")
        self.assertEqual(normalized[0]["tool_name"], "get_weather")
        self.assertEqual(normalized[0]["content"], "sunny")

    def test_structured_content_parts_flatten_to_text(self):
        normalized = shim._normalize_messages([
            {"role": "user", "content": [{"type": "text", "text": "a"}, {"type": "text", "text": "b"}]}
        ])
        self.assertEqual(normalized[0]["content"], "a\nb")


class ResponseShapeTest(unittest.TestCase):
    def test_tool_calls_set_the_tool_calls_finish_reason(self):
        payload = shim._openai_response(
            "m", "", {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            [{"index": 0, "id": "c1", "type": "function",
              "function": {"name": "f", "arguments": "{}"}}],
        )
        choice = payload["choices"][0]
        self.assertEqual(choice["finish_reason"], "tool_calls")
        self.assertIsNone(choice["message"]["content"])

    def test_plain_completions_still_stop(self):
        payload = shim._openai_response(
            "m", "hello", {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}
        )
        choice = payload["choices"][0]
        self.assertEqual(choice["finish_reason"], "stop")
        self.assertEqual(choice["message"]["content"], "hello")


class UpstreamTargetTest(unittest.TestCase):
    def test_shim_points_at_ollama_not_the_tailnet_re_exporter(self):
        """11436 is the tailnet forwarder (100.94.135.78:11436 -> 127.0.0.1:11434).
        Pointing the shim at it on 2026-07-30 produced HTTP 200 with empty content
        and 0 tokens while the forwarder crashlooped on bind."""
        self.assertEqual(shim.OLLAMA, "http://127.0.0.1:11434")


class DeployedCopyDriftTest(unittest.TestCase):
    def test_deployed_shim_matches_this_source(self):
        if not DEPLOYED_SHIM.is_file():
            self.skipTest("no deployed shim on this host (CI or a non-Hermes machine)")
        self.assertEqual(
            DEPLOYED_SHIM.read_text(encoding="utf-8"),
            SHIM_SOURCE.read_text(encoding="utf-8"),
            f"{DEPLOYED_SHIM} has drifted from {SHIM_SOURCE.relative_to(REPO)} — "
            "the running shim is the one that matters; reconcile them",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
