#!/usr/bin/env python3
"""
Regression test suite for Enterprise Viral Analytics, W-Shaped Multi-Touch
Attribution, Stripe client_reference_id reconciliation, Visual Self-QA,
and Bayesian Thompson-Sampling A/B/C Bandit (`tools/viral-analytics-engine.py`).
"""
from __future__ import annotations

import hashlib
import hmac
import importlib.util
import json
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ENGINE_PATH = REPO_ROOT / "tools" / "viral-analytics-engine.py"


def load_engine():
    spec = importlib.util.spec_from_file_location("viral_analytics_engine", ENGINE_PATH)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class ViralAnalyticsAndAttributionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = load_engine()

    def test_stripe_client_reference_id_roundtrip_and_malformed_fallback(self):
        url = self.engine.build_attributed_url(
            "https://buy.stripe.com/9B69ATbmI4r4aK5eOD3sI3k",
            utm_source="tiktok",
            ab_variant="variant_a_incident_307",
            utm_content="bio_diag",
            campaign_id="mac_yolo_rust_hud_20261102",
        )
        self.assertIn("client_reference_id=mac_yolo_rust_hud_20261102__variant_a_incident_307__tiktok", url)
        parsed = self.engine.parse_stripe_client_reference_id(
            "mac_yolo_rust_hud_20261102__variant_a_incident_307__tiktok"
        )
        self.assertEqual(parsed["valid"], "true")
        self.assertEqual(parsed["campaign_id"], "mac_yolo_rust_hud_20261102")
        self.assertEqual(parsed["ab_variant"], "variant_a_incident_307")
        self.assertEqual(parsed["utm_source"], "tiktok")

        fallback = self.engine.parse_stripe_client_reference_id("legacy_ref_without_delimiters")
        self.assertEqual(fallback["valid"], "false")
        self.assertEqual(fallback["ab_variant"], "unattributed")
        self.assertEqual(fallback["utm_source"], "direct")

    def test_w_shaped_attribution_reconciles_to_exact_conversion_value(self):
        for n_touches in (1, 2, 3, 4, 6):
            touches = [{"channel": f"ch_{i}"} for i in range(n_touches)]
            res = self.engine.compute_multi_touch_attribution(touches, conversion_value_usd=49.0)
            self.assertAlmostEqual(res["weights_sum"], 1.0, places=4)
            total_credit = sum(res["channel_credit"].values())
            self.assertAlmostEqual(total_credit, 49.0, places=2)

    def test_bayesian_thompson_bandit_small_n_guard_and_winner_crowning(self):
        # Small sample: must NOT crown a hard winner even if one variant has 3/3 conversions
        small_n = self.engine.run_bayesian_thompson_bandit(
            {
                "v_a": {"trials": 3, "conversions": 3},
                "v_b": {"trials": 3, "conversions": 0},
                "v_c": {"trials": 3, "conversions": 1},
            },
            draws=5000,
            min_events_per_variant=30,
        )
        self.assertEqual(small_n["decision"], "EXPLORE_THOMPSON_BANDIT")
        prob_sum = sum(v["prob_to_be_best"] for v in small_n["variants"].values())
        self.assertAlmostEqual(prob_sum, 1.0, places=2)

        # Sufficient sample (>=30 trials/variant) with clear lift -> CROWN_WINNER
        large_n = self.engine.run_bayesian_thompson_bandit(
            {
                "v_a": {"trials": 100, "conversions": 45},
                "v_b": {"trials": 100, "conversions": 10},
                "v_c": {"trials": 100, "conversions": 8},
            },
            draws=5000,
            min_events_per_variant=30,
        )
        self.assertEqual(large_n["decision"], "CROWN_WINNER")
        self.assertEqual(large_n["current_leader"], "v_a")
        self.assertGreaterEqual(large_n["leader_prob_to_be_best"], 0.95)

    def test_full_report_slos_and_hmac_receipt(self):
        report = self.engine.build_viral_analytics_report()
        self.assertEqual(report["observability_health_score"], 100.0)
        obs = report["pillars"]["5_observability"]
        self.assertEqual(obs["slos_passed"], obs["slos_total"])
        for slo_name, passed in obs["slos"].items():
            self.assertTrue(passed, f"Expected SLO {slo_name} to pass")

        # Verify HMAC-SHA256 receipt integrity
        sig = obs["hmac_sha256_receipt"]
        obs_copy = dict(obs)
        obs_copy.pop("hmac_sha256_receipt", None)
        expected_sig = hmac.new(
            b"mac-yolo-safeguards-local-hmac-v1",
            json.dumps(obs_copy, sort_keys=True).encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        self.assertEqual(sig, expected_sig)


if __name__ == "__main__":
    unittest.main()
