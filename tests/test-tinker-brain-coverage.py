#!/usr/bin/env python3
"""Regression tests for the tinker-brain coverage gate.

The bug these pin (2026-07-30): asked "Should ThumbGate rename away from Hermes
given Nous Research trademark exposure?", the router matched the token "ThumbGate",
returned INTENT_THUMBGATE_GTM's product card, and exited 0. The card says nothing
about trademarks, renaming, or Nous Research — but the output was well-formed prose
indistinguishable from an answer, and it was acted on as one.

`route()` ends in `else: primary = INTENT_GENERAL`, so there is no "I do not cover
this" path. The coverage gate is what supplies one, AFTER routing.

These tests pin BEHAVIOUR (does an off-card question get flagged, does an on-card
question stay silent), not implementation strings — a test that asserts the exact
banner wording would go green while the gate itself rotted.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools", "tinker-brain"))

from tinker_brain_coverage import banner, coverage  # noqa: E402

# Trimmed from the real thumbgate_gtm card that was returned on 2026-07-30.
GTM_CARD = """
ThumbGate.app GTM expert answer (AS_OF_RESEARCH: 2026-07-27):
[PRODUCT]
  - ThumbGate.app is the free browser control plane (Web Control) for Hermes coding
    agents running on your Mac: chats, machines, Leash tool approvals, signed P-256
    machine pairing.
  - Paid SKU is Continuity: when the Mac goes offline, ELIGIBLE work continues on a
    fenced Fly VPS runner. It is NOT live process migration.
  - SKUs: Web Control $0/mo; Pro Continuity $10/mo; Team/Enterprise $49/mo.
  - Pro price is dynamic from https://thumbgate.app/api/billing/plan — re-read before any
    campaign; never hard-code the price in copy.
[POSITIONING]
  - Winning frame: "Upgrade Hermes with ThumbGate" — additive web dashboard plus
    optional paid Continuity on top of Hermes Mobile.
"""

TRADEMARK_Q = "Should ThumbGate rename away from Hermes given Nous Research trademark exposure?"
ON_CARD_Q = "What are the ThumbGate Pro Continuity SKUs and pricing?"


class TestCoverageGate(unittest.TestCase):
    def test_the_real_regression_is_flagged(self):
        """The exact question that produced a confident non-answer must not pass."""
        cov = coverage(TRADEMARK_Q, GTM_CARD)
        self.assertFalse(cov["covered"], f"trademark question wrongly marked covered: {cov}")
        self.assertLess(cov["score"], cov["threshold"])

    def test_the_unanswered_concepts_are_named(self):
        """Naming what is missing is the point — a bare 'no' sends nobody anywhere."""
        missing = set(coverage(TRADEMARK_Q, GTM_CARD)["missing"])
        for term in ("trademark", "rename", "nous"):
            self.assertIn(term, missing, f"{term!r} unaddressed by the card but not reported missing")

    def test_on_card_question_passes_silently(self):
        """A checker that cries wolf gets bypassed, and then protects nothing."""
        cov = coverage(ON_CARD_Q, GTM_CARD)
        self.assertTrue(cov["covered"], f"on-card question wrongly flagged: {cov}")
        self.assertIsNone(banner(ON_CARD_Q, GTM_CARD))

    def test_banner_fires_only_when_uncovered(self):
        note = banner(TRADEMARK_Q, GTM_CARD)
        self.assertIsNotNone(note, "off-card question produced no warning banner")
        self.assertTrue(note.strip(), "banner is empty")

    def test_morphological_variants_count_as_hits(self):
        """'renaming' must satisfy 'rename', or the gate flags answered questions."""
        answer = "We should consider renaming; trademarks filed by Nous Research create exposure."
        cov = coverage("Should we rename given the trademark from Nous?", answer)
        self.assertTrue(cov["covered"], f"variant matching failed: {cov}")

    def test_question_with_no_substantive_terms_is_not_flagged(self):
        """All-stopword input has nothing to score; flagging it would be noise."""
        cov = coverage("what is it?", GTM_CARD)
        self.assertTrue(cov["covered"], f"stopword-only question wrongly flagged: {cov}")

    def test_empty_answer_never_covers_a_real_question(self):
        cov = coverage(TRADEMARK_Q, "")
        self.assertFalse(cov["covered"])

    def test_terse_off_card_question_is_flagged(self):
        """A ratio alone passes 'ThumbGate trademark?' at 1/2 = 0.5 — same bug, shorter.

        Caught by review on PR #1280 and reproduced through the real CLI: it exited 0
        with no banner. Below SHORT_Q_TERMS the ratio has too few buckets to mean
        anything, so every substantive term must appear.
        """
        for q in ("ThumbGate trademark?", "ThumbGate rename?"):
            cov = coverage(q, GTM_CARD)
            self.assertFalse(cov["covered"], f"terse off-card question {q!r} slipped through: {cov}")
            self.assertIsNotNone(banner(q, GTM_CARD))

    def test_terse_on_card_question_still_passes(self):
        """The short-question rule must not become a blanket veto on short questions.

        Known limitation, deliberately not papered over: matching is substring-based, so
        it catches prefix morphology (rename/renaming, trademark/trademarks) but NOT
        price/pricing — "price" is not a substring of "pricing". Loosening this to fuzzy
        stemming would let "trade" satisfy "trademark", reintroducing exactly the false
        pass this module exists to prevent. A spurious banner is cheap; a false pass is
        the incident.
        """
        cov = coverage("ThumbGate Continuity?", GTM_CARD)
        self.assertTrue(cov["covered"], f"legitimate terse question wrongly flagged: {cov}")

    def test_render_cli_path_also_gates(self):
        """Every path that EMITS an answer must gate, not just the answer CLI.

        `tinker_response_contract.py --render` previously printed the card and returned 0
        unconditionally, so callers using it bypassed the safeguard entirely.

        Uses nonsense tokens, NOT the trademark question. render_response() pulls the
        expert card from the local ~/.hermes snapshot, so a real-world question makes
        this assertion depend on machine state: on a Mac whose snapshot had been
        refreshed to cover Nous/trademark, --render legitimately returned 0 and this
        test failed while CI (no ~/.hermes) stayed green. The rest of this CI step is
        hermetic by contract; this case has to be too. Tokens that cannot appear in any
        card make the expected coverage 0 regardless of ambient state.
        """
        import subprocess
        import tempfile

        here = os.path.dirname(os.path.abspath(__file__))
        contract = os.path.join(here, "..", "tools", "tinker-brain", "tinker_response_contract.py")
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as fh:
            fh.write(GTM_CARD)
            card = fh.name
        try:
            p = subprocess.run(
                [sys.executable, contract, "--render", "--card", card,
                 "--question", "qzlmvx wibblesnort frobnication?"],
                capture_output=True, text=True,
            )
            self.assertEqual(p.returncode, 3, f"--render did not signal no-coverage: rc={p.returncode}")
            self.assertIn("NO COVERAGE", p.stderr)
        finally:
            os.unlink(card)

    def test_score_is_a_fraction(self):
        for q, a in ((TRADEMARK_Q, GTM_CARD), (ON_CARD_Q, GTM_CARD), ("what is it?", GTM_CARD)):
            self.assertGreaterEqual(coverage(q, a)["score"], 0.0)
            self.assertLessEqual(coverage(q, a)["score"], 1.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
