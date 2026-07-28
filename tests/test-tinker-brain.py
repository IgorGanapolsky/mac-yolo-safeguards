#!/usr/bin/env python3
"""Contracts for tools/tinker-brain — the ThumbGate.app GTM revenue brain.

Run directly: python3 tests/test-tinker-brain.py
"""

from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest

REPO = pathlib.Path(__file__).resolve().parents[1]
BRAIN = REPO / "tools" / "tinker-brain"
sys.path.insert(0, str(BRAIN))

import export_tinker_brain_snapshot as exporter  # noqa: E402
import tinker_brain_economics as economics  # noqa: E402
import tinker_brain_fingerprint as fingerprint  # noqa: E402
from tinker_brain_answer import answer, load_expert_card  # noqa: E402
from tinker_brain_router import (  # noqa: E402
    INTENT_NEXT_MONEY,
    INTENT_OFF_SCOPE,
    INTENT_SYSTEM_SCORES,
    INTENT_THUMBGATE_GTM,
    route,
)
from tinker_response_contract import validate_response  # noqa: E402

FIXTURE_CARD = (BRAIN / "fixtures" / "answer_card.txt").read_text(encoding="utf-8")
EXPERT_TEXT = load_expert_card(REPO / "config" / "THUMBGATE_EXPERT_CARD.txt")


class RouterTest(unittest.TestCase):
    def test_thumbgate_gtm_is_primary_product(self):
        for question in (
            "How do we sell ThumbGate.app?",
            "What is our marketing plan?",
            "How should we price Continuity?",
            "Promote thumbgate this week",
            "positioning vs Cursor background agents",
        ):
            self.assertEqual(route(question)["primary"], INTENT_THUMBGATE_GTM, question)

    def test_cash_and_money_routes_survive_pivot(self):
        self.assertEqual(route("why zero dollars from thumbgate sales?")["primary"], "cash_truth")
        self.assertEqual(route("make money")["primary"], INTENT_NEXT_MONEY)
        self.assertEqual(route("Give the exact system scores.")["primary"], INTENT_SYSTEM_SCORES)
        self.assertEqual(
            route("Improve Obsidian vault sync with Dropbox and TensorFlow")["primary"],
            INTENT_OFF_SCOPE,
        )


class AnswerTest(unittest.TestCase):
    def test_gtm_answer_serves_expert_sections_and_passes_contract(self):
        result = answer(FIXTURE_CARD, "How do we sell ThumbGate.app?", expert_text=EXPERT_TEXT)
        self.assertTrue(result["ok"], result["violations"])
        self.assertIn("[SALES_MOTION]", result["text"])
        self.assertIn("first chat is the product", result["text"])
        self.assertNotIn("endpoint security", result["text"].lower())

    def test_marketing_answer_includes_promo_rules(self):
        result = answer(FIXTURE_CARD, "What is our marketing plan?", expert_text=EXPERT_TEXT)
        self.assertTrue(result["ok"], result["violations"])
        self.assertIn("[CHANNELS]", result["text"])
        self.assertIn("[PROMO_RULES]", result["text"])

    def test_cash_truth_stays_fail_closed(self):
        result = answer(FIXTURE_CARD, "Why did we make zero dollars?", expert_text=EXPERT_TEXT)
        self.assertTrue(result["ok"], result["violations"])
        self.assertIn("external $0.00", result["text"])
        self.assertIn("non-owner", result["text"])


class ContractTest(unittest.TestCase):
    def test_promo_overclaims_and_conflation_rejected(self):
        bad = (
            "AS_OF=2026-07-22T18:07:42Z. Sell ThumbGate Continuity as seamless failover — "
            "your agent never stops, fully private with E2EE. It is a replacement for Hermes "
            "Mobile when the phone cannot reach the Mac. Bundle it with ThumbGate.ai."
        )
        errors = validate_response(bad, FIXTURE_CARD, "Draft promo copy for ThumbGate.app")
        self.assertIn("thumbgate_overclaim", errors)
        self.assertIn("continuity_rescue_language", errors)
        self.assertIn("thumbgate_ai_conflation", errors)

    def test_never_say_guidance_lines_exempt(self):
        guidance = 'Never say: "seamless failover"; "agent never stops"; "E2EE".'
        errors = validate_response(guidance, FIXTURE_CARD, "What are the ThumbGate promo rules?")
        self.assertNotIn("thumbgate_overclaim", errors)

    def test_nonzero_revenue_card_requires_exact_amount(self):
        card = FIXTURE_CARD.replace(
            "EXTERNAL_USD=0.0  (cents=0)", "EXTERNAL_USD=49.0  (cents=4900)"
        )
        stale = (
            "AS_OF=2026-07-22T18:07:42Z. External cash is $0.00 because no non-owner buyer paid."
        )
        errors = validate_response(stale, card, "What is our cash status?")
        self.assertIn("external_cash_missing", errors)
        self.assertIn("stale_zero_cash_claim", errors)
        good = "AS_OF=2026-07-22T18:07:42Z. External cash is verified at $49.00."
        self.assertEqual(validate_response(good, card, "What is our cash status?"), [])

    def test_free_trial_allowed_only_on_gtm_route(self):
        text = "Offer a free trial to everyone."
        self.assertIn(
            "unsupported_offer_change",
            validate_response(text, FIXTURE_CARD, "What should we do next?"),
        )
        self.assertNotIn(
            "unsupported_offer_change",
            validate_response(text, FIXTURE_CARD, "How should we price ThumbGate.app?"),
        )


class ExporterTest(unittest.TestCase):
    STUBS = dict(
        health={"ok": True, "status": "ok", "error": None, "url": "stub"},
        billing={"ok": True, "price_cents": 1000, "price_usd": 10.0, "error": None, "url": "stub"},
        revenue={
            "has_receipt": False,
            "external_net_cents": 0,
            "owner_test_net_cents": 0,
            "reconciled_at": None,
            "source": "receipt_missing",
            "path": "stub",
        },
        aeo={"present": False},
    )

    def test_snapshot_builds_offline_and_validates(self):
        snap = exporter.build_snapshot(**self.STUBS)
        self.assertEqual(snap["schema_version"], "tinker-thumbgate-snapshot/1")
        self.assertEqual(snap["focus"]["default_scope"], "thumbgate_app_revenue")
        self.assertTrue(snap["products"]["thumbgate_app"]["primary"])
        self.assertEqual(snap["cash"]["external_net_usd"], 0.0)
        self.assertIn("non-owner", snap["cash"]["why_external_zero_if_zero"])
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "snap.json"
            exporter.write_snapshot(out, snap)
            self.assertEqual(exporter.validate_snapshot(out), [])
            card = (out.parent / "ANSWER_CARD.txt").read_text(encoding="utf-8")
            self.assertIn("THUMBGATE_LIVE_PRICE=live /api/billing/plan readback OK", card)
            self.assertIn("Pro Continuity $10.00/mo", card)
            # Scores are computed from receipts on every snapshot (never the
            # retired static skool numbers); MONETIZATION stays fail-closed at
            # 0 without a verified revenue receipt.
            self.assertIn("SYSTEM_SCORES=", card)
            score_line = next(
                line for line in card.splitlines() if line.startswith("SYSTEM_SCORES=")
            )
            self.assertTrue(
                "MONETIZATION 0/100" in score_line or "not_scored" in score_line,
                score_line,
            )
            if "not_scored" not in score_line:
                self.assertIn("computed", card.split("SCORE_SCOPE=")[1].split("\n")[0])
            # The exported card must itself produce contract-clean answers.
            result = answer(card, "How do we sell ThumbGate.app?", expert_text=EXPERT_TEXT)
            self.assertTrue(result["ok"], result["violations"])
            result = answer(card, "Why did we make zero dollars?", expert_text=EXPERT_TEXT)
            self.assertTrue(result["ok"], result["violations"])

    def test_verified_revenue_receipt_changes_cash_truth(self):
        stubs = dict(self.STUBS)
        stubs["revenue"] = {
            "has_receipt": True,
            "external_net_cents": 4900,
            "owner_test_net_cents": 0,
            "reconciled_at": "2026-07-28T00:00:00Z",
            "source": "stripe_reconciliation",
            "path": "stub",
        }
        snap = exporter.build_snapshot(**stubs)
        self.assertEqual(snap["cash"]["external_net_usd"], 49.0)
        self.assertIn("verified at $49.00", snap["cash"]["why_external_zero_if_zero"])

    def test_unreachable_probes_fail_soft(self):
        stubs = dict(self.STUBS)
        stubs["health"] = {"ok": False, "status": "unreachable", "error": "URLError", "url": "stub"}
        stubs["billing"] = {"ok": False, "price_cents": None, "price_usd": None, "error": "http_403", "url": "stub"}
        snap = exporter.build_snapshot(**stubs)
        self.assertIn("unreachable", snap["live"]["live_price_line"])
        self.assertIn("never hard-code", snap["live"]["live_price_line"])


class FingerprintTest(unittest.TestCase):
    def test_diff_names_changed_components(self):
        older = {"captured_at": "t0", "model": {"digest": "a"}, "prompts": {}, "retrieval": {}, "code": {}, "tools": {}}
        newer = {"captured_at": "t1", "model": {"digest": "b"}, "prompts": {}, "retrieval": {}, "code": {}, "tools": {}}
        result = fingerprint.diff(older, newer)
        self.assertEqual(result["changed_components"], {"model": ["digest"]})
        self.assertIn("Q1 model changed", result["suspects"])
        same = fingerprint.diff(newer, newer)
        self.assertEqual(same["changed_components"], {})
        self.assertIn("queries", same["verdict"])


class EconomicsTest(unittest.TestCase):
    def test_record_appends_history_and_summarizes(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "economics.json"
            economics.record(out=out, mode="deterministic", wall_ms=12.5)
            summary = economics.record(out=out, mode="local_model", wall_ms=900.0, model="q4")
            self.assertEqual(summary["window_rows"], 2)
            self.assertEqual(summary["deterministic_answers"], 1)
            self.assertEqual(summary["local_model_answers"], 1)
            history = (pathlib.Path(tmp) / "economics.jsonl").read_text(encoding="utf-8")
            self.assertEqual(len(history.strip().splitlines()), 2)
            with self.assertRaises(ValueError):
                economics.record(out=out, mode="bogus", wall_ms=1)


class EvalHarnessTest(unittest.TestCase):
    def test_eval_cases_all_pass_against_fixture(self):
        sys.path.insert(0, str(BRAIN))
        import tinker_brain_eval as harness

        spec = json.loads((BRAIN / "fixtures" / "eval_cases.json").read_text(encoding="utf-8"))
        results = [harness.run_case(c, FIXTURE_CARD, EXPERT_TEXT) for c in spec["cases"]]
        failures = [r for r in results if not r["ok"]]
        self.assertEqual(failures, [])
        contract_spec = json.loads(
            (BRAIN / "fixtures" / "contract_cases.json").read_text(encoding="utf-8")
        )
        contract_results = [
            harness.run_contract_case(c, FIXTURE_CARD) for c in contract_spec["cases"]
        ]
        self.assertEqual([r for r in contract_results if not r["ok"]], [])


class VerifierFuzzTest(unittest.TestCase):
    def test_no_banned_phrase_mutation_escapes_contract(self):
        sys.path.insert(0, str(BRAIN))
        import tinker_brain_verifier_fuzz as fuzz

        card_text = FIXTURE_CARD
        escapes = []
        banned = (
            [(p, "continuity_rescue_language") for p in fuzz.THUMBGATE_RESCUE_PHRASES]
            + [(p, "thumbgate_overclaim") for p in fuzz.THUMBGATE_OVERCLAIM_PHRASES]
            + [(p, "thumbgate_ai_conflation") for p in fuzz.THUMBGATE_CONFLATION_PHRASES]
        )
        for phrase, expected in banned:
            for name, mutated in fuzz.mutations(phrase).items():
                response = f"AS_OF=2026-07-22T18:07:42Z\n{mutated}\n"
                got = fuzz.validate_response(
                    response, card_text, "How do we sell ThumbGate.app?"
                )
                if expected not in got:
                    escapes.append((phrase, name))
        self.assertEqual(escapes, [])


class EvalMinerTest(unittest.TestCase):
    def test_miner_replays_traces_and_flags_uncovered_routes(self):
        sys.path.insert(0, str(BRAIN))
        import tinker_brain_eval_miner as miner

        with tempfile.TemporaryDirectory() as tmp:
            trace_dir = pathlib.Path(tmp)
            (trace_dir / "questions.jsonl").write_text(
                json.dumps({"question": "How do we sell ThumbGate.app?", "ts": "t"})
                + "\n"
                + json.dumps({"question": "What tensorflow cluster should we buy?", "ts": "t"})
                + "\n",
                encoding="utf-8",
            )
            report = miner.mine(
                BRAIN / "fixtures" / "answer_card.txt", trace_dir, BRAIN / "fixtures"
            )
        self.assertEqual(report["replayed"], 2)
        self.assertIn("thumbgate_gtm", report["intent_traffic"])
        # Pinned questions must never be re-proposed as new cases.
        proposed_questions = {c["question"] for c in report["proposed_cases"]}
        self.assertNotIn("How do we sell ThumbGate.app?", proposed_questions)


class FailPassDumpTest(unittest.TestCase):
    def test_pairs_are_deduped_fail_verified_and_pass_clean(self):
        sys.path.insert(0, str(BRAIN))
        import tinker_brain_failpass_dump as fp
        from tinker_response_contract import validate_response

        card_text = FIXTURE_CARD
        pairs = fp.build_pairs(card_text, expert_text=EXPERT_TEXT)
        self.assertGreaterEqual(len(pairs), 100)
        keys = {(p["question_digest"], p["fail_digest"]) for p in pairs}
        self.assertEqual(len(keys), len(pairs))
        for p in pairs[:10] + pairs[-10:]:
            self.assertTrue(p["fail_violations"])
            self.assertEqual(
                validate_response(p["pass_text"], card_text, p["question"]), []
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
