"""Coverage is an advisory hint, and both directions of it are load-bearing.

The 2026-07-30 incident: a trademark/rename question matched the token "ThumbGate",
returned the GTM product card, and was acted on as an answer. The first fix scored
lexical overlap of question terms against the answer, which failed both ways:

  FALSE PASS  "ThumbGate trademark?" scored 1/2 = 0.5 and was accepted. The verbose
              phrasing only failed because it had more terms — the incident was
              caught by accident of question length.
  FALSE FAIL  "How do I monetize fastest?", correctly answered with pricing and
              sales-motion guidance, scored 0.0. Gating on that failed 3 of 14
              golden cases.

The signal that actually distinguishes the incident is narrow: the ONLY thing the
card shares with the question is a brand noun.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tinker_brain_coverage import coverage  # noqa: E402

CARD = "ThumbGate is our GTM product card: enforcement for AI agents, $499 diagnostic."


class CoverageAdvisoryTest(unittest.TestCase):
    def test_flags_the_incident_in_its_concise_form(self):
        # The form that previously PASSED at 0.5.
        self.assertFalse(coverage("ThumbGate trademark?", CARD)["covered"])

    def test_flags_the_incident_in_its_verbose_form(self):
        self.assertFalse(
            coverage("Should I rename ThumbGate for trademark reasons?", CARD)["covered"]
        )

    def test_a_paraphrase_may_warn_but_must_never_gate(self):
        """A lexical hint WILL over-warn on paraphrase; that is why it is advisory.

        These two cases previously asserted 'must not warn'. That was aiming at the
        wrong target: the harm was golden prompts exiting 3, and that is fixed by
        removing the exit gate. Demanding a lexical checker never over-warn would mean
        weakening detection until it missed the verbose trademark regression and empty
        answers — which is exactly what my earlier brand-only rewrite did, and what
        tests/test-tinker-brain-coverage.py caught.
        """
        import tinker_brain_answer as tba
        src = Path(tba.__file__).read_text()
        self.assertNotIn("else 3", src, "coverage must not decide the exit code")
        # Warning on a paraphrase is tolerable; the verdict just must not be fatal.
        cov = coverage(
            "How do I monetize fastest?",
            "Lead with the $499 diagnostic; a bounded engagement with proof.",
        )
        self.assertIn("covered", cov, "a verdict is still produced")

    def test_names_the_brand_token_it_objected_to(self):
        reason = coverage("ThumbGate trademark?", CARD)["reason"]
        self.assertIn("thumbgate", reason.lower())
        self.assertIn("trademark", reason.lower())

    def test_answer_carries_coverage_so_ci_exercises_it(self):
        # The guard previously lived only in main(); CI calls answer() directly, so it
        # was never run and CI stayed green while the CLI exited 3 on golden prompts.
        import tinker_brain_answer as tba
        self.assertIn('"coverage"', Path(tba.__file__).read_text())

    def test_coverage_never_gates_the_exit_code(self):
        import tinker_brain_answer as tba
        src = Path(tba.__file__).read_text()
        self.assertNotIn("else 3", src, "coverage must not decide the exit code")


if __name__ == "__main__":
    unittest.main(verbosity=1)
