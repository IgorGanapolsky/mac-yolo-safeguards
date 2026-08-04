#!/usr/bin/env python3
"""Tests for tinker-brain governance rank (8 dimensions A+)."""

from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
BRAIN = REPO / "tools" / "tinker-brain"
sys.path.insert(0, str(BRAIN))


class GovernanceUnitTests(unittest.TestCase):
    def test_gate_calibration_zero_fp_fn(self) -> None:
        from tinker_brain_governance import grade_gate_calibration

        p = grade_gate_calibration()
        self.assertEqual(p["grade"], "A+")
        self.assertEqual(p["evidence"]["false_positive_rate"], 0.0)
        self.assertEqual(p["evidence"]["false_negative_rate"], 0.0)

    def test_no_enforce_refused_without_env(self) -> None:
        card = BRAIN / "fixtures" / "answer_card.txt"
        proc = subprocess.run(
            [
                sys.executable,
                str(BRAIN / "tinker_brain_answer.py"),
                "--card",
                str(card),
                "--question",
                "How do we sell ThumbGate.app?",
                "--no-enforce",
            ],
            cwd=str(REPO),
            capture_output=True,
            text=True,
            timeout=30,
            env={k: v for k, v in __import__("os").environ.items() if k != "TINKER_BRAIN_ALLOW_NO_ENFORCE"},
            check=False,
        )
        self.assertEqual(proc.returncode, 3)
        self.assertIn("TINKER_BRAIN_ALLOW_NO_ENFORCE", proc.stderr)

    def test_product_registry_team20(self) -> None:
        reg = json.loads((BRAIN / "fixtures" / "product_registry.json").read_text())
        self.assertGreaterEqual(reg["team_scale_model"]["engineers_target"], 20)
        self.assertTrue(any(p.get("status") == "active" for p in reg["products"]))

    def test_rai_receipt_schema(self) -> None:
        from tinker_brain_governance import grade_responsible_ai_impact

        p = grade_responsible_ai_impact()
        self.assertEqual(p["grade"], "A+")
        receipt = Path.home() / ".hermes" / "receipts" / "tinker-brain" / "rai-impact-latest.json"
        self.assertTrue(receipt.is_file())
        body = json.loads(receipt.read_text())
        self.assertEqual(body["schema_version"], "tinker-brain-rai-impact/1")
        self.assertTrue(body["metrics"]["zero_model_spend"])


class GovernanceCLITests(unittest.TestCase):
    def test_governance_cli_a_plus(self) -> None:
        proc = subprocess.run(
            [sys.executable, str(BRAIN / "tinker_brain_governance.py"), "--json"],
            cwd=str(REPO),
            capture_output=True,
            text=True,
            timeout=300,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stderr + proc.stdout[-2500:])
        body = json.loads(proc.stdout)
        self.assertTrue(body["overall"]["a_plus"])
        dims = {d["dimension"]: d for d in body["dimensions"]}
        for name in (
            "gate_good_vs_over_restrictive",
            "offline_vs_online_evaluation",
            "model_provider_change_handling",
            "human_feedback_quality_noise",
            "why_not_full_rlhf_from_start",
            "scale_team20_multi_product",
            "bypass_resistance",
            "responsible_ai_impact_concrete",
        ):
            self.assertEqual(dims[name]["grade"], "A+", msg=name)
            self.assertEqual(dims[name]["score_10"], 10.0, msg=name)


if __name__ == "__main__":
    unittest.main()
