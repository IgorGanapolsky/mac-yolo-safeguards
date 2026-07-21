#!/usr/bin/env python3
"""Hermetic contracts for the local tinker-yolo tool dispatcher."""

import importlib.util
import json
import os
import pathlib
import shutil
import stat
import tempfile
import unittest


MODULE_PATH = pathlib.Path(__file__).parents[1] / "tools" / "tinker-yolo-agent.py"
SPEC = importlib.util.spec_from_file_location("tinker_yolo_agent", MODULE_PATH)
AGENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AGENT)


class FakeResponse:
    def __init__(self, body, url="https://example.test/", status=200, content_type="text/html"):
        self.body = body.encode("utf-8")
        self.url = url
        self.status = status
        self.headers = {"Content-Type": content_type}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        del exc_type, exc_value, traceback

    def read(self, maximum=-1):
        return self.body if maximum < 0 else self.body[:maximum]

    def getcode(self):
        return self.status


class ScriptedAgent(AGENT.LocalAgent):
    def __init__(self, workspace, receipt_dir, responses, max_turns=12, max_tool_calls=20):
        self.responses = list(responses)
        super().__init__(
            workspace,
            receipt_dir=receipt_dir,
            max_turns=max_turns,
            max_tool_calls=max_tool_calls,
            include_project_instructions=False,
        )

    def request_chat(self):
        if not self.responses:
            raise AssertionError("scripted Ollama response exhausted")
        return self.responses.pop(0)


def tool_call(name, arguments, identifier="call-1"):
    return {
        "message": {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": identifier,
                    "type": "function",
                    "function": {"name": name, "arguments": arguments},
                }
            ],
        }
    }


def answer(text):
    return {"message": {"role": "assistant", "content": text}}


class ToolRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name)
        self.runtime = AGENT.ToolRuntime(self.root)

    def tearDown(self):
        self.temporary.cleanup()

    def dispatch(self, name, arguments):
        result, _ = self.runtime.dispatch(name, arguments)
        return result

    def test_ollama_host_without_scheme_is_normalized(self):
        self.assertEqual(
            AGENT.normalize_ollama_url("127.0.0.1:11434"),
            "http://127.0.0.1:11434",
        )

    def test_filesystem_tools_are_real_and_workspace_scoped(self):
        written = self.dispatch(
            "write_file",
            {"path": "src/example.py", "content": "value = 1\n", "create_parents": True},
        )
        self.assertTrue(written["ok"])
        read = self.dispatch("read_file", {"path": "src/example.py"})
        self.assertEqual(read["content"], "value = 1\n")
        replaced = self.dispatch(
            "replace_in_file",
            {"path": "src/example.py", "old_text": "value = 1", "new_text": "value = 42"},
        )
        self.assertTrue(replaced["ok"])
        listed = self.dispatch("list_files", {"path": "src", "glob": "*.py"})
        self.assertEqual(listed["entries"], ["src/example.py"])
        escaped = self.dispatch("read_file", {"path": "../outside.txt"})
        self.assertFalse(escaped["ok"])
        self.assertEqual(escaped["error"]["code"], "outside_workspace")

    @unittest.skipUnless(shutil.which("rg"), "ripgrep required by production search tool")
    def test_search_files_uses_ripgrep(self):
        (self.root / "needle.txt").write_text("alpha\nneedle value\nomega\n", encoding="utf-8")
        searched = self.dispatch("search_files", {"query": "needle value", "path": "."})
        self.assertTrue(searched["ok"])
        self.assertEqual(searched["count"], 1)
        self.assertIn("needle.txt:2:needle value", searched["matches"][0])

    def test_shell_is_bounded_and_secret_environment_is_removed(self):
        previous = os.environ.get("TINKER_API_KEY")
        os.environ["TINKER_API_KEY"] = "fixture_should_not_reach_child"
        try:
            result = self.dispatch(
                "run_shell",
                {
                    "command": "printf '%s|%s' \"${TINKER_API_KEY-unset}\" \"$TINKER_YOLO_LOCAL_AGENT\"",
                    "timeout_seconds": 5,
                },
            )
        finally:
            if previous is None:
                os.environ.pop("TINKER_API_KEY", None)
            else:
                os.environ["TINKER_API_KEY"] = previous
        self.assertTrue(result["ok"])
        self.assertEqual(result["stdout"], "unset|1")
        timed_out = self.dispatch("run_shell", {"command": "sleep 2", "timeout_seconds": 1})
        self.assertTrue(timed_out["ok"])
        self.assertTrue(timed_out["timedOut"])
        self.assertEqual(timed_out["exitCode"], 124)

    def test_fetch_and_search_are_structured_and_redacted(self):
        search_html = (
            '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">'
            "Example <b>Docs</b></a>"
        )

        def fake_urlopen(request, timeout=0):
            del timeout
            if "duckduckgo" in request.full_url:
                return FakeResponse(search_html, request.full_url)
            return FakeResponse("token=fixture_secret_value_123456", request.full_url, content_type="text/plain")

        runtime = AGENT.ToolRuntime(self.root, urlopen=fake_urlopen)
        fetched, _ = runtime.dispatch("web_fetch", {"url": "https://example.test/"})
        self.assertTrue(fetched["ok"])
        self.assertNotIn("fixture_secret", fetched["body"])
        searched, _ = runtime.dispatch("web_search", {"query": "official example docs"})
        self.assertTrue(searched["ok"])
        self.assertEqual(searched["count"], 1)
        self.assertEqual(searched["results"][0]["url"], "https://example.com/docs")


class ReceiptTests(unittest.TestCase):
    def test_receipts_are_private_hash_chained_and_content_free(self):
        with tempfile.TemporaryDirectory() as temporary:
            ledger = AGENT.ReceiptLedger(temporary, "session-test")
            ledger.record(
                1,
                "write_file",
                {"path": "a.txt", "content": "private file content"},
                {"ok": True, "writtenBytes": 20},
                3,
            )
            ledger.record(
                2,
                "run_shell",
                {"command": "printf ok"},
                {"ok": True, "exitCode": 0, "stdout": "ok"},
                4,
            )
            history = pathlib.Path(temporary) / "agent-history.jsonl"
            rows = [json.loads(line) for line in history.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(rows[1]["previousHash"], rows[0]["hash"])
            self.assertNotIn("private file content", history.read_text(encoding="utf-8"))
            self.assertEqual(stat.S_IMODE(history.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(pathlib.Path(temporary).stat().st_mode), 0o700)


class AgentLoopTests(unittest.TestCase):
    def test_native_ollama_tool_call_executes_then_returns_answer(self):
        with tempfile.TemporaryDirectory() as workspace, tempfile.TemporaryDirectory() as receipts:
            agent = ScriptedAgent(
                workspace,
                receipts,
                [
                    tool_call(
                        "write_file",
                        {"path": "proof.txt", "content": "filesystem tool works\n"},
                    ),
                    answer("Created proof.txt and verified the local filesystem tool."),
                ],
            )
            result = agent.run_turn("Create proof.txt")
            self.assertEqual(result["toolCalls"], 1)
            self.assertTrue(result["localOnly"])
            self.assertEqual(
                pathlib.Path(workspace, "proof.txt").read_text(encoding="utf-8"),
                "filesystem tool works\n",
            )

    def test_tagged_qwen_tool_call_is_dispatched_instead_of_printed(self):
        with tempfile.TemporaryDirectory() as workspace, tempfile.TemporaryDirectory() as receipts:
            agent = ScriptedAgent(
                workspace,
                receipts,
                [
                    answer(
                        '<tool_call>{"name":"get_working_directory","arguments":{}}</tool_call>'
                    ),
                    answer("The local tools are available."),
                ],
            )
            result = agent.run_turn("Do you have tools?")
            self.assertEqual(result["answer"], "The local tools are available.")
            self.assertEqual(result["toolCalls"], 1)

    def test_false_no_access_claim_is_corrected_once(self):
        with tempfile.TemporaryDirectory() as workspace, tempfile.TemporaryDirectory() as receipts:
            agent = ScriptedAgent(
                workspace,
                receipts,
                [
                    answer("I have no access to the filesystem or tools."),
                    tool_call("get_working_directory", {}),
                    answer("Confirmed: filesystem, shell, and internet tools are live."),
                ],
            )
            result = agent.run_turn("Inspect this workspace")
            self.assertEqual(result["toolCalls"], 1)
            corrections = [
                message
                for message in agent.messages
                if "Correction: the tools" in str(message.get("content", ""))
            ]
            self.assertEqual(len(corrections), 1)

    def test_third_identical_call_is_blocked_and_recorded(self):
        with tempfile.TemporaryDirectory() as workspace, tempfile.TemporaryDirectory() as receipts:
            repeated = [tool_call("get_working_directory", {}, "call-%s" % index) for index in range(3)]
            agent = ScriptedAgent(workspace, receipts, repeated + [answer("Loop stopped safely.")])
            result = agent.run_turn("Prove the loop breaker")
            self.assertEqual(result["toolCalls"], 3)
            tool_messages = [message for message in agent.messages if message.get("role") == "tool"]
            self.assertIn("repeated_call_blocked", tool_messages[-1]["content"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
