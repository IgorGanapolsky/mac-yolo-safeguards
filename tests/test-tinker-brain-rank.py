#!/usr/bin/env python3
"""Tests for multi-dimension rank + production metrics + feedback loop."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
BRAIN = REPO / "tools" / "tinker-brain"
sys.path.insert(0, str(BRAIN))


class ProductionMetricsTests(unittest.TestCase):
    def test_record_and_compute(self) -> None:
        from tinker_brain_production_metrics import (
            mark_feedback_consumed,
            record_feedback,
            record_production_answer,
        )

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            prod = tmp_path / "production-answers.jsonl"
            fb = tmp_path / "feedback.jsonl"
            for i in range(12):
                record_production_answer(
                    question=f"q{i}",
                    ok=True,
                    route="thumbgate_gtm",
                    wall_ms=12.5 + i,
                    out=prod,
                )
            record_feedback(
                question="need more positioning depth",
                signal="need_section",
                needed_card_section="POSITIONING",
                out=fb,
            )
            n = mark_feedback_consumed(matcher="POSITIONING", consumed_by="test", path=fb)
            self.assertGreaterEqual(n, 1)
            # Patch module paths for compute — call helpers directly instead.
            rows = [json.loads(line) for line in prod.read_text().splitlines()]
            self.assertEqual(len(rows), 12)
            self.assertTrue(all(r["ok"] for r in rows))
            self.assertTrue(all(r["spend_usd"] == 0.0 for r in rows))
            fb_rows = [json.loads(line) for line in fb.read_text().splitlines()]
            self.assertTrue(any(r.get("consumed") for r in fb_rows))

    def test_thresholds_constant(self) -> None:
        from tinker_brain_production_metrics import THRESHOLDS

        self.assertEqual(THRESHOLDS["spend_usd_max"], 0.0)
        self.assertGreaterEqual(THRESHOLDS["task_success_rate_min"], 0.99)
        self.assertLessEqual(THRESHOLDS["human_override_rate_max"], 0.05)


class RankModuleTests(unittest.TestCase):
    def test_learning_tradeoffs_rejects_rlhf(self) -> None:
        from tinker_brain_rank import grade_learning_tradeoffs

        pillar = grade_learning_tradeoffs()
        self.assertEqual(pillar["dimension"], "learning_tradeoffs")
        self.assertEqual(pillar["grade"], "A+")
        self.assertTrue(pillar["evidence"]["checks"]["no_rlhf_pipeline"])
        self.assertEqual(
            pillar["evidence"]["tradeoff"]["chosen"],
            "rule_gates_plus_labeled_contract_preferences",
        )

    def test_offline_dimension_structure(self) -> None:
        from tinker_brain_rank import grade_offline_golden

        pillar = grade_offline_golden()
        self.assertEqual(pillar["rank"], 1)
        self.assertIn("domain_routes", pillar["evidence"])
        self.assertGreaterEqual(pillar["evidence"]["domain_route_count"], 5)
        self.assertEqual(pillar["grade"], "A+")


class RankCLITests(unittest.TestCase):
    def test_rank_cli_a_plus(self) -> None:
        proc = subprocess.run(
            [sys.executable, str(BRAIN / "tinker_brain_rank.py"), "--json"],
            cwd=str(REPO),
            capture_output=True,
            text=True,
            timeout=300,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stderr + proc.stdout[-2000:])
        body = json.loads(proc.stdout)
        self.assertTrue(body["overall"]["a_plus"], msg=json.dumps(body["overall"], indent=2))
        dims = {d["dimension"]: d for d in body["dimensions"]}
        for name in (
            "offline_golden_regression",
            "online_production_metrics",
            "continuous_provider_eval",
            "feedback_loop_closure",
            "learning_tradeoffs",
        ):
            self.assertIn(name, dims)
            self.assertEqual(dims[name]["grade"], "A+", msg=name)
            self.assertEqual(dims[name]["score_10"], 10.0, msg=name)


if __name__ == "__main__":
    unittest.main()
