#!/usr/bin/env python3
"""Hermetic contracts for guarded tinker-yolo macOS computer use."""

import importlib.util
import io
import json
import pathlib
import stat
import tempfile
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).parents[1]
MODULE_PATH = ROOT / "tools" / "tinker-yolo-agent.py"
LUA_PATH = ROOT / "tools" / "tinker-yolo-computer.lua"
SPEC = importlib.util.spec_from_file_location("tinker_yolo_agent_computer", MODULE_PATH)
AGENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AGENT)


class FakeComputer:
    def __init__(self):
        self.requests = []
        self.target = {
            "id": "ax-7",
            "role": "AXButton",
            "title": "Open settings",
            "secure": False,
        }
        self.current = {
            "app": {"name": "Fixture"},
            "window": {"title": "Fixture window"},
            "focusedElement": {"role": "AXTextField", "secure": False},
            "secureInput": False,
            "elements": [self.target],
        }

    def availability(self):
        return {"available": True, "reasons": []}

    def state(self, maximum=160):
        result = dict(self.current)
        result["maxElements"] = maximum
        return result

    def inspect_target(self, arguments):
        del arguments
        return dict(self.target)

    def screenshot(self, question=None, analyze=True):
        return {
            "path": "/private/fixture/latest.png",
            "sha256": "a" * 64,
            "ocr": {"available": True, "text": "Fixture window"},
            "vision": {"available": analyze, "description": question or "visible UI"},
            "state": self.state(),
        }

    def run(self, request):
        self.requests.append(dict(request))
        return {"action": request["action"], "state": self.state()}


class FakeHttpResponse:
    def __init__(self, payload):
        self.stream = io.BytesIO(json.dumps(payload).encode("utf-8"))
        self.status = 200

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        del exc_type, exc_value, traceback

    def read(self, maximum=-1):
        return self.stream.read(maximum)

    def getcode(self):
        return self.status


class ComputerRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name)
        self.backend = FakeComputer()

    def tearDown(self):
        self.temporary.cleanup()

    def runtime(self, confirmation=None):
        return AGENT.ToolRuntime(
            self.root,
            computer_enabled=True,
            computer_backend=self.backend,
            confirmation=confirmation,
        )

    def dispatch(self, runtime, name, arguments):
        result, _ = runtime.dispatch(name, arguments)
        return result

    def test_computer_catalog_and_fresh_state_are_exposed(self):
        runtime = self.runtime()
        working = self.dispatch(runtime, "get_working_directory", {})
        self.assertTrue(working["computerUse"]["available"])
        self.assertIn("computer_screenshot", working["tools"])
        state = self.dispatch(runtime, "computer_state", {"max_elements": 25})
        self.assertEqual(state["app"]["name"], "Fixture")
        self.assertEqual(state["maxElements"], 25)
        screenshot = self.dispatch(
            runtime,
            "computer_screenshot",
            {"question": "Where is the settings button?", "analyze": True},
        )
        self.assertEqual(screenshot["ocr"]["text"], "Fixture window")

    def test_routine_yolo_actions_run_and_return_post_action_state(self):
        runtime = self.runtime()
        clicked = self.dispatch(
            runtime,
            "computer_click",
            {"target": "ax-7", "intent": "open non-destructive settings"},
        )
        self.assertTrue(clicked["ok"])
        self.assertEqual(clicked["action"], "click")
        self.assertEqual(clicked["state"]["app"]["name"], "Fixture")
        typed = self.dispatch(
            runtime,
            "computer_type",
            {"text": "draft only", "intent": "edit a local draft without submitting"},
        )
        self.assertTrue(typed["ok"])
        self.assertNotIn("intent", self.backend.requests[-1])

    def test_consequential_click_requires_action_time_confirmation(self):
        self.backend.target["title"] = "Delete account"
        denied = self.dispatch(
            self.runtime(confirmation=lambda reason: False),
            "computer_click",
            {"target": "ax-7", "intent": "delete the account"},
        )
        self.assertFalse(denied["ok"])
        self.assertEqual(denied["error"]["code"], "confirmation_required")
        self.assertEqual(self.backend.requests, [])

        approved = self.dispatch(
            self.runtime(confirmation=lambda reason: "Delete" in reason),
            "computer_click",
            {"target": "ax-7", "intent": "delete the account"},
        )
        self.assertTrue(approved["ok"])
        self.assertEqual(self.backend.requests[-1]["action"], "click")

    def test_secure_typing_and_submit_keys_are_confirmation_gated(self):
        self.backend.current["focusedElement"] = {
            "role": "AXSecureTextField",
            "secure": True,
        }
        secure = self.dispatch(
            self.runtime(confirmation=lambda reason: False),
            "computer_type",
            {"text": "fixture-password", "intent": "fill the password field"},
        )
        self.assertFalse(secure["ok"])
        self.assertEqual(secure["error"]["code"], "confirmation_required")

        self.backend.current["focusedElement"] = {"role": "AXTextField", "secure": False}
        submit = self.dispatch(
            self.runtime(confirmation=lambda reason: False),
            "computer_key",
            {"key": "return", "intent": "submit the form"},
        )
        self.assertFalse(submit["ok"])
        self.assertEqual(submit["error"]["code"], "confirmation_required")

    def test_receipts_never_store_typed_or_vision_question_text(self):
        with tempfile.TemporaryDirectory() as receipts:
            ledger = AGENT.ReceiptLedger(receipts, "computer-session")
            ledger.record(
                1,
                "computer_type",
                {"text": "private typed fixture", "intent": "edit draft"},
                {"ok": True},
                1,
            )
            ledger.record(
                2,
                "computer_screenshot",
                {"question": "private screenshot question"},
                {"ok": True},
                2,
            )
            history = pathlib.Path(receipts) / "agent-history.jsonl"
            content = history.read_text(encoding="utf-8")
            self.assertNotIn("private typed fixture", content)
            self.assertNotIn("private screenshot question", content)
            rows = [json.loads(line) for line in content.splitlines()]
            self.assertEqual(rows[0]["arguments"]["textBytes"], 21)
            self.assertEqual(stat.S_IMODE(history.stat().st_mode), 0o600)

    def test_lua_dispatcher_has_fixed_actions_and_no_shell_execution(self):
        source = LUA_PATH.read_text(encoding="utf-8")
        for action in ("state", "screenshot", "activate_app", "click", "type", "key", "scroll"):
            self.assertIn("'" + action + "'", source)
        self.assertNotIn("hs.execute", source)
        self.assertNotIn("os.execute", source)
        self.assertIn("hs.accessibilityState", source)
        self.assertIn("hs.axuielement.systemElementAtPosition", source)
        self.assertIn("screen is locked", source)

    def test_hammerspoon_transport_retries_reads_but_never_actions(self):
        backend = AGENT.ComputerBackend(
            module_path=LUA_PATH,
            state_dir=self.root / "computer-state",
            hs_binary="/bin/echo",
            tesseract_binary="/usr/bin/false",
        )
        failed = AGENT.subprocess.CompletedProcess([], 69, b"", b"receive timeout")
        succeeded = AGENT.subprocess.CompletedProcess(
            [], 0, b'{"ok":true,"result":{"app":{"name":"Fixture"}}}\n', b""
        )
        with mock.patch.object(AGENT.subprocess, "run", side_effect=[failed, succeeded]) as run:
            state = backend.run({"action": "state"})
        self.assertEqual(state["app"]["name"], "Fixture")
        self.assertEqual(run.call_count, 2)

        with mock.patch.object(AGENT.subprocess, "run", return_value=failed) as run:
            with self.assertRaises(AGENT.ToolError):
                backend.run({"action": "click", "x": 10, "y": 10})
        self.assertEqual(run.call_count, 1)

        with mock.patch.object(AGENT.subprocess, "run", side_effect=[failed, succeeded]) as run:
            activated = backend.run({"action": "activate_app", "name": "Fixture"})
        self.assertEqual(activated["app"]["name"], "Fixture")
        self.assertEqual(run.call_count, 2)

    def test_vision_prefers_the_warm_qwen35_tag(self):
        def fake_urlopen(request, timeout=0):
            del timeout
            if request.full_url.endswith("/api/ps"):
                return FakeHttpResponse(
                    {"models": [{"name": "qwen3.5:9b-hermes-64k"}]}
                )
            return FakeHttpResponse(
                {
                    "models": [
                        {"name": "qwen3.5:9b"},
                        {"name": "qwen3.5:9b-hermes-64k"},
                    ]
                }
            )

        backend = AGENT.ComputerBackend(
            module_path=LUA_PATH,
            state_dir=self.root / "computer-state",
            hs_binary="/bin/echo",
            tesseract_binary="/usr/bin/false",
            vision_model="qwen3.5:9b",
            urlopen=fake_urlopen,
        )
        self.assertEqual(backend._select_vision_model(), "qwen3.5:9b-hermes-64k")

    def test_default_vision_model_is_the_direct_instruct_tag(self):
        self.assertEqual(AGENT.DEFAULT_VISION_MODEL, "qwen3-vl:4b-instruct")

    def test_vision_rejects_an_empty_reasoning_only_response(self):
        def fake_urlopen(request, timeout=0):
            del timeout
            if request.full_url.endswith("/api/tags"):
                return FakeHttpResponse({"models": [{"name": AGENT.DEFAULT_VISION_MODEL}]})
            if request.full_url.endswith("/api/ps"):
                return FakeHttpResponse({"models": []})
            return FakeHttpResponse(
                {
                    "message": {"role": "assistant", "content": "", "thinking": "private"},
                    "done": True,
                    "done_reason": "length",
                    "eval_count": 500,
                }
            )

        image = self.root / "fixture.png"
        image.write_bytes(b"fixture-image")
        backend = AGENT.ComputerBackend(
            module_path=LUA_PATH,
            state_dir=self.root / "computer-state",
            hs_binary="/bin/echo",
            tesseract_binary="/usr/bin/false",
            urlopen=fake_urlopen,
        )
        result = backend._vision(image, 1280, 720, "What is visible?")
        self.assertNotIn("description", result)
        self.assertIn("returned no answer", result["error"])
        self.assertNotIn("private", json.dumps(result))

    def test_cached_lock_state_blocks_actions_before_ipc(self):
        backend = AGENT.ComputerBackend(
            module_path=LUA_PATH,
            state_dir=self.root / "computer-state",
            hs_binary="/bin/echo",
            tesseract_binary="/usr/bin/false",
        )
        backend.last_state = {"screenLocked": True}
        with mock.patch.object(AGENT.subprocess, "run") as run:
            with self.assertRaises(AGENT.ToolError) as raised:
                backend.run({"action": "type", "text": "must not type"})
        self.assertEqual(raised.exception.code, "screen_locked")
        run.assert_not_called()

    def test_screenshot_transport_failure_uses_native_read_only_fallback(self):
        backend = AGENT.ComputerBackend(
            module_path=LUA_PATH,
            state_dir=self.root / "computer-state",
            hs_binary="/bin/echo",
            tesseract_binary="/usr/bin/false",
        )
        with mock.patch.object(
            backend,
            "run",
            side_effect=AGENT.ToolError("computer_transport", "fixture timeout"),
        ), mock.patch.object(backend, "_native_screenshot") as native:
            def capture(path):
                path.write_bytes(b"fixture-image")
                return {"path": str(path), "width": 1280, "height": 720, "capture": "native"}

            native.side_effect = capture
            result = backend.screenshot(analyze=False)
        self.assertEqual(result["capture"], "native")
        self.assertTrue(result["privateMode"])
        native.assert_called_once()


if __name__ == "__main__":
    unittest.main(verbosity=2)
