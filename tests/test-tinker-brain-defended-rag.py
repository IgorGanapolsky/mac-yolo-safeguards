#!/usr/bin/env python3
"""Tests for tinker-brain defended RAG pipeline rank (8 stages A+)."""

from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
BRAIN = REPO / "tools" / "tinker-brain"
sys.path.insert(0, str(BRAIN))


class DefendedRagUnitTests(unittest.TestCase):
    def test_quality_gate_blocks_vague_down(self) -> None:
        from tinker_brain_defended_rag import quality_gate_capture

        vague = quality_gate_capture(signal="thumbs_down", context="thumbs down")
        self.assertTrue(vague["vague"])
        self.assertFalse(vague["promotable"])
        structured = quality_gate_capture(
            signal="down",
            context="Agent hard-coded Continuity price in a campaign without billing plan",
            what_to_change="Read live /api/billing/plan",
            needed_card_section="PRICING",
        )
        self.assertTrue(structured["promotable"])

    def test_pragmatic_hybrid_and_multi_query(self) -> None:
        from tinker_brain_defended_rag import (
            LEXICAL_THRESHOLD,
            build_query_variants,
            pragmatic_hybrid_score,
            search_with_multi_query,
        )

        s = pragmatic_hybrid_score(
            "never hard-code Continuity price",
            "Always read live billing plan; never hard-code Continuity dollars",
        )
        self.assertGreater(s["score"], 0.2)
        self.assertIn("keyword", s)
        self.assertIn("bigram", s)
        variants = build_query_variants("git push --force origin main")
        self.assertLessEqual(len(variants), 3)
        self.assertEqual(LEXICAL_THRESHOLD, 0.6)

        corpus = [
            {
                "id": "a",
                "title": "pricing",
                "body": "never hard-code Continuity price; live billing plan",
                "signal": "thumbs_down",
            },
            {"id": "b", "title": "oranges", "body": "fruit weather salad", "signal": "card"},
        ]
        hit = search_with_multi_query(
            "never hard-code Continuity price billing",
            corpus,
            threshold=0.05,
        )
        self.assertGreaterEqual(hit["top_score"], 0.05)
        self.assertFalse(hit["multi_query"])

    def test_rank_cli_a_plus(self) -> None:
        proc = subprocess.run(
            [sys.executable, str(BRAIN / "tinker_brain_defended_rag.py"), "--json"],
            cwd=str(REPO),
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stderr + proc.stdout[-2000:])
        body = json.loads(proc.stdout)
        self.assertTrue(body["overall"]["a_plus"], msg=json.dumps(body["overall"], indent=2))
        dims = {d["dimension"]: d for d in body["dimensions"]}
        for name in (
            "capture_thumbs_down",
            "normalize_quality_gate",
            "store_lesson_sqlite_fts5",
            "retrieve_pragmatic_hybrid",
            "multi_query_threshold_0_6",
            "rerank_cross_encoder",
            "assemble_context",
            "gate_next_tool_call_deterministic",
        ):
            self.assertEqual(dims[name]["grade"], "A+", msg=name)
            self.assertEqual(dims[name]["score_10"], 10.0, msg=name)


if __name__ == "__main__":
    unittest.main()
