#!/usr/bin/env python3
"""Focused regression tests for fail-closed WebMCP readiness auditing."""

from __future__ import annotations

from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("webmcp_lint", Path(__file__).with_name("lint_webmcp_manifest.py"))
assert SPEC and SPEC.loader
LINTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LINTER)


def valid_manifest() -> dict:
    return json.loads((ROOT / "assets/manifest.example.json").read_text())


def valid_probe() -> dict:
    return {
        "schema": "webmcp-browser-probe/v1",
        "captured_at": "2026-08-26T21:00:00+00:00",
        "ok": True,
        "supported": ["chrome"],
        "results": [{"browser": "chrome", "supported": True, "version": "151.0.7922.174"}],
    }


class ReadinessAuditTests(unittest.TestCase):
    def test_static_only_never_claims_ready(self) -> None:
        receipt, exit_code = LINTER.assess_manifest(valid_manifest(), static_only=True)
        self.assertEqual(exit_code, 0)
        self.assertTrue(receipt["static_ok"])
        self.assertFalse(receipt["ready"])
        self.assertEqual(receipt["runtime"]["status"], "not_checked")

    def test_missing_runtime_evidence_is_unverified_and_nonzero(self) -> None:
        receipt, exit_code = LINTER.assess_manifest(valid_manifest())
        self.assertEqual(exit_code, 2)
        self.assertFalse(receipt["ready"])
        self.assertEqual(receipt["runtime"]["status"], "unverified")

    def test_verified_runtime_and_valid_manifest_are_ready(self) -> None:
        receipt, exit_code = LINTER.assess_manifest(valid_manifest(), valid_probe())
        self.assertEqual(exit_code, 0)
        self.assertTrue(receipt["ready"])
        self.assertEqual(receipt["runtime"]["browsers"], ["chrome"])

    def test_write_without_confirmation_fails(self) -> None:
        manifest = valid_manifest()
        manifest["tools"][1]["confirmation"] = "none"
        receipt, exit_code = LINTER.assess_manifest(manifest, valid_probe())
        self.assertEqual(exit_code, 1)
        self.assertFalse(receipt["static_ok"])
        self.assertIn("requires user confirmation", " ".join(receipt["errors"]))

    def test_journey_must_reference_declared_tool(self) -> None:
        manifest = valid_manifest()
        manifest["journeys"][0]["tool"] = "missing_tool"
        receipt, exit_code = LINTER.assess_manifest(manifest, valid_probe())
        self.assertEqual(exit_code, 1)
        self.assertIn("must reference a declared tool", " ".join(receipt["errors"]))

    def test_cross_origin_exposure_rejects_paths(self) -> None:
        manifest = valid_manifest()
        manifest["tools"][0]["exposedTo"] = ["https://example.com/not-an-origin"]
        receipt, exit_code = LINTER.assess_manifest(manifest, valid_probe())
        self.assertEqual(exit_code, 1)
        self.assertIn("explicit HTTPS origins", " ".join(receipt["errors"]))

    def test_probe_claims_must_match_verified_results(self) -> None:
        probe = deepcopy(valid_probe())
        probe["results"][0]["supported"] = False
        receipt, exit_code = LINTER.assess_manifest(valid_manifest(), probe)
        self.assertEqual(exit_code, 2)
        self.assertFalse(receipt["ready"])
        self.assertEqual(receipt["runtime"]["status"], "invalid")


if __name__ == "__main__":
    unittest.main(verbosity=2)
