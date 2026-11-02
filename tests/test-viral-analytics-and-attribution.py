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
import tempfile
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
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            orig_scratch = self.engine.SCRATCH_DIR
            orig_report = self.engine.OUT_ANALYTICS_JSON
            orig_attr = self.engine.OUT_ATTRIBUTION_EVENTS_JSON
            orig_content = self.engine.OUT_CONTENT_LOG_TSV
            orig_obs = self.engine.OUT_RECEIPTS_JSONL
            try:
                self.engine.SCRATCH_DIR = tmp_path
                self.engine.OUT_ANALYTICS_JSON = tmp_path / "viral_analytics_engine.json"
                self.engine.OUT_ATTRIBUTION_EVENTS_JSON = tmp_path / "viral_attribution_events.json"
                self.engine.OUT_CONTENT_LOG_TSV = tmp_path / "viral_content_log.tsv"
                self.engine.OUT_RECEIPTS_JSONL = tmp_path / "viral_observability_receipts.jsonl"
                report = self.engine.build_viral_analytics_report()
            finally:
                self.engine.SCRATCH_DIR = orig_scratch
                self.engine.OUT_ANALYTICS_JSON = orig_report
                self.engine.OUT_ATTRIBUTION_EVENTS_JSON = orig_attr
                self.engine.OUT_CONTENT_LOG_TSV = orig_content
                self.engine.OUT_RECEIPTS_JSONL = orig_obs
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

        radar = report["pillars"]["6_viral_discovery_radar"]
        self.assertIn("show_hn_launch", radar)
        self.assertIn("news.ycombinator.com/submitlink", radar["show_hn_launch"]["submit_url"])
        self.assertGreaterEqual(len(radar["new_viral_venues"]), 5)
        self.assertIn("hackernews", radar["new_viral_venues"])
        self.assertIn("lobsters", radar["new_viral_venues"])
        self.assertIn("reddit_dev", radar["new_viral_venues"])
        self.assertIn("producthunt", radar["new_viral_venues"])

        critique_pillar = report["pillars"]["7_critique_to_cash_flywheel"]
        self.assertEqual(critique_pillar["critique_flywheel_status"], "ACTIVE")
        self.assertGreaterEqual(len(critique_pillar["critique_to_spec_ledger"]), 4)
        self.assertIn("8x2dR91M84r4cSd9uj3sI3f", critique_pillar["roast_my_stack_posts"]["instant_stripe_19_url"])
        self.assertIn("roast-or-critique.yml", critique_pillar["roast_my_stack_posts"]["github_critique_bounty_url"])
        self.assertGreaterEqual(len(critique_pillar["roast_my_stack_posts"]["external_github_pain_issues"]), 4)
        self.assertIn("variant_d_roast_critique", report["pillars"]["3_ab_testing"]["variants"])

    def test_yolo_roast_card_and_cli_feedback_capture(self):
        from importlib.machinery import SourceFileLoader
        import sys
        roast_path = REPO_ROOT / "bin" / "yolo-roast"
        loader = SourceFileLoader("yolo_roast", str(roast_path))
        spec = importlib.util.spec_from_loader("yolo_roast", loader)
        assert spec and spec.loader
        roast_mod = importlib.util.module_from_spec(spec)
        sys.modules["yolo_roast"] = roast_mod
        spec.loader.exec_module(roast_mod)
        sample_ps = "\n".join([
            "40535     1 2477196   0.0 12:14:09 /Users/dev/.local/bin/claude",
            "39993     1 1272934  24.5 04:11:22 node /usr/local/bin/ccusage",
            "91002     1  215040   4.2 08:02:11 npx -y @modelcontextprotocol/server-filesystem",
            "94110   500   64200   0.4 09:00:00 herdr server",
        ])
        scan = roast_mod.scan_mac_agent_stack(ps_override=sample_ps, swap_override_mb=3072.0)
        self.assertLess(scan["hygiene_score"], 90)
        self.assertEqual(scan["counts"]["orphaned_mcp_procs"], 1)
        self.assertEqual(scan["counts"]["protected_mux_procs"], 1)
        self.assertIn("roast-or-critique.yml", scan["links"]["one_click_critique_issue_url"])
        card = roast_mod.format_ascii_roast_card(scan)
        self.assertIn("MAC AGENT STACK ROAST CARD", card)
        self.assertIn("8x2dR91M84r4cSd9uj3sI3f", card)
        with tempfile.TemporaryDirectory() as tmpdir:
            test_log = Path(tmpdir) / "user-critiques.jsonl"
            receipt = roast_mod.record_cli_feedback(
                "Test critique: show per-PID memory delta",
                log_path=test_log,
            )
            self.assertTrue(test_log.exists())
        self.assertIn("WHEN an operator reports", receipt["ears_spec"])
        self.assertIn("roast-or-critique.yml", receipt["github_prefill_url"])
        # Verify word-boundary regex does NOT match AudioComponentRegistrar or MTLCompilerService
        false_pos_ps = "1001 1 50000 0.0 01:00:00 /System/Library/Frameworks/AudioToolbox.framework/AudioComponentRegistrar"
        fp_scan = roast_mod.scan_mac_agent_stack(ps_override=false_pos_ps, swap_override_mb=0.0)
        self.assertEqual(fp_scan["counts"]["agent_cli_procs"], 0)

if __name__ == "__main__":
    unittest.main()
