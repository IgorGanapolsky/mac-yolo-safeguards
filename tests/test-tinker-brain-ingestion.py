#!/usr/bin/env python3
"""Adversarial verification for the tinker-brain ingestion/index engine."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "tools" / "tinker-brain" / "tinker_brain_ingestion.py"
SPEC = importlib.util.spec_from_file_location("tinker_brain_ingestion", MODULE_PATH)
assert SPEC and SPEC.loader
ingestion = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ingestion)


class IndexCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="tinker-ingestion-test-")
        self.root = Path(self.temp.name)
        self.db = self.root / "index.sqlite3"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def index(self, **kwargs):
        return ingestion.TinkerBrainIndex(self.db, **kwargs)

    def test_normalization_is_nfc_idempotent_and_structured_formats_are_canonical(self) -> None:
        composed = ingestion.normalize_text("Café\r\n\r\n\r\nproof  ")
        decomposed = ingestion.normalize_text("Cafe\u0301\n\nproof")
        self.assertEqual(composed, decomposed)
        self.assertEqual(ingestion.normalize_text(composed), composed)
        self.assertEqual(
            ingestion.canonical_json('{"b":2,"a":1}'),
            ingestion.canonical_json('{\n  "a": 1, "b": 2\n}'),
        )
        cleaned = ingestion.html_to_text(
            "<style>secret-style</style><script>danger()</script><h1>Safe</h1><p>Evidence</p>"
        )
        self.assertNotIn("danger", cleaned)
        self.assertNotIn("secret-style", cleaned)
        self.assertIn("Safe", cleaned)
        self.assertIn("Evidence", cleaned)

    def test_mime_handling_fails_closed_and_pdf_ocr_is_conditional(self) -> None:
        unknown = self.root / "blob.bin"
        unknown.write_bytes(b"\x00\x01binary")
        with self.index() as index:
            with self.assertRaisesRegex(ValueError, "unsupported_mime"):
                index.parse_path(unknown)
            with self.assertRaisesRegex(ValueError, "inline_binary_not_supported"):
                index.parse_inline("inline.png", "not really pixels", "image/png")

        pdf = self.root / "scan.pdf"
        pdf.write_bytes(b"%PDF-1.7 fake fixture")
        commands = []

        def fake_runner(command):
            commands.append(list(command))
            if command[0] == "pdftotext":
                return "  "
            if command[0] == "pdftoppm":
                Path(f"{command[-1]}-1.png").write_bytes(b"fake png")
                return ""
            if command[0] == "tesseract":
                return "Scanned operational evidence with enough extracted characters."
            raise AssertionError(command)

        with self.index(command_runner=fake_runner) as index:
            parsed = index.parse_path(pdf)
        self.assertTrue(parsed["metadata"]["ocr_used"])
        self.assertEqual(parsed["metadata"]["ocr_engine"], "tesseract")
        self.assertEqual([row[0] for row in commands], ["pdftotext", "pdftoppm", "tesseract"])

    def test_exact_dedup_indexes_once_and_preserves_source_alias(self) -> None:
        with self.index() as index:
            first = index.parse_inline(
                "memory://one",
                "# Revenue\nPromote ThumbGate with cited buyer pain and verified campaign receipts.",
                "text/markdown",
            )
            second = index.parse_inline(
                "memory://two",
                "# Revenue\r\nPromote ThumbGate with cited buyer pain and verified campaign receipts.\r\n",
                "text/markdown",
            )
            result = index.ingest_records([first, second])
            self.assertEqual(result, {"added": 2, "changed": 0, "unchanged": 0, "duplicates": 1})
            generation = index.reindex()
            self.assertTrue(generation["ok"])
            self.assertEqual(generation["documents"], 1)
            output = index.search("promote ThumbGate buyer pain", limit=1)
            self.assertEqual(output["results"][0]["source_uri"], "memory://one")
            self.assertEqual(output["results"][0]["source_aliases"], ["memory://two"])

    def test_deleting_original_duplicate_promotes_an_active_alias(self) -> None:
        corpus = self.root / "aliases"
        corpus.mkdir()
        original = corpus / "a-original.md"
        alias = corpus / "b-alias.md"
        content = "# Canonical\nThe duplicate evidence must survive original source deletion."
        original.write_text(content, encoding="utf-8")
        alias.write_text(content, encoding="utf-8")
        with self.index() as index:
            initial = index.sync_root(corpus)
            self.assertEqual(initial["duplicates"], 1)
            index.reindex()
            self.assertEqual(
                index.search("survive original source deletion", limit=1)["results"][0]["source_uri"],
                str(original.resolve()),
            )
            original.unlink()
            changed = index.sync_root(corpus)
            self.assertEqual(changed["deleted"], 1)
            generation = index.reindex()
            self.assertEqual(generation["documents"], 1)
            result = index.search("survive original source deletion", limit=1)
            self.assertEqual(result["results"][0]["source_uri"], str(alias.resolve()))
            self.assertEqual(result["results"][0]["source_aliases"], [])

    def test_stable_heading_chunks_survive_unrelated_section_insertion(self) -> None:
        before = (
            "# A\nAlpha verification content needs exact provider evidence and a receipt.\n\n"
            "# B\nBeta rollback content keeps the previous generation queryable."
        )
        after = (
            "# NEW\nUnrelated new preface about a launch checklist.\n\n"
            "# A\nAlpha verification content needs exact provider evidence and a receipt.\n\n"
            "# B\nBeta rollback content keeps the previous generation queryable."
        )
        with self.index() as index:
            index.ingest_records([index.parse_inline("memory://stable", before, "text/markdown")])
            first_generation = index.reindex()
            self.assertTrue(first_generation["ok"])
            first = {
                row["heading_path"]: row["chunk_id"]
                for row in index.connection.execute(
                    "SELECT heading_path, chunk_id FROM chunks WHERE generation_id=?",
                    (first_generation["generation_id"],),
                )
            }
            index.ingest_records([index.parse_inline("memory://stable", after, "text/markdown")])
            second_generation = index.reindex()
            self.assertTrue(second_generation["ok"])
            second = {
                row["heading_path"]: row["chunk_id"]
                for row in index.connection.execute(
                    "SELECT heading_path, chunk_id FROM chunks WHERE generation_id=?",
                    (second_generation["generation_id"],),
                )
            }
            self.assertEqual(first["A"], second["A"])
            self.assertEqual(first["B"], second["B"])
            self.assertIn("NEW", second)

    def test_incremental_sync_tracks_add_change_unchanged_delete_and_tombstone(self) -> None:
        corpus = self.root / "corpus"
        corpus.mkdir()
        first = corpus / "one.md"
        second = corpus / "two.md"
        first.write_text("# One\nInitial evidence for revenue campaigns.", encoding="utf-8")
        second.write_text("# Two\nInitial evidence for retrieval quality.", encoding="utf-8")
        with self.index() as index:
            initial = index.sync_root(corpus)
            self.assertEqual(initial["added"], 2)
            self.assertEqual(initial["deleted"], 0)
            unchanged = index.sync_root(corpus)
            self.assertEqual(unchanged["unchanged"], 2)
            first.write_text("# One\nChanged evidence with a verified public receipt.", encoding="utf-8")
            second.unlink()
            changed = index.sync_root(corpus)
            self.assertEqual(changed["changed"], 1)
            self.assertEqual(changed["deleted"], 1)
            status = index.status()
            self.assertEqual(status["sources_active"], 1)
            self.assertEqual(status["sources_deleted"], 1)
            deleted_row = index.connection.execute(
                "SELECT tombstoned FROM documents WHERE source_uri=? AND is_current=1",
                (str(second.resolve()),),
            ).fetchone()
            self.assertEqual(deleted_row["tombstoned"], 1)

    def test_failed_reindex_preserves_active_generation_and_search(self) -> None:
        with self.index() as index:
            index.ingest_records(
                [
                    index.parse_inline(
                        "memory://rollback",
                        "# Rollback\nKeep the previous generation active when a rebuild fails.",
                        "text/markdown",
                    )
                ]
            )
            good = index.reindex()
            self.assertTrue(good["ok"])
            before = index.search("previous generation rebuild fails", limit=1)
            self.assertEqual(before["generation_id"], good["generation_id"])

            index.ingest_records(
                [
                    index.parse_inline(
                        "memory://new",
                        "# New\nThis second document triggers an injected partial rebuild.",
                        "text/markdown",
                    )
                ]
            )
            failed = index.reindex(fail_after_chunks=1)
            self.assertFalse(failed["ok"])
            self.assertEqual(failed["active_generation"], good["generation_id"])
            after = index.search("previous generation rebuild fails", limit=1)
            self.assertEqual(after["generation_id"], good["generation_id"])
            self.assertEqual(after["results"][0]["source_uri"], "memory://rollback")
            failed_count = index.connection.execute(
                "SELECT COUNT(*) FROM chunks WHERE generation_id=?",
                (failed["generation_id"],),
            ).fetchone()[0]
            self.assertEqual(failed_count, 0)

    def test_successful_generation_can_roll_back_with_parent_context(self) -> None:
        with self.index() as index:
            index.ingest_records(
                [
                    index.parse_inline(
                        "memory://parent",
                        "# Parent\nThe exact chunk is short.\n\nThe parent contains the full operational context.",
                        "text/markdown",
                    )
                ]
            )
            first = index.reindex()
            index.ingest_records(
                [
                    index.parse_inline(
                        "memory://second",
                        "# Second\nA newer generation adds another independent document.",
                        "text/markdown",
                    )
                ]
            )
            second = index.reindex()
            self.assertNotEqual(first["generation_id"], second["generation_id"])
            result = index.search("full operational context", limit=1)
            self.assertIn("full operational context", result["results"][0]["parent_text"])
            rollback = index.rollback(first["generation_id"])
            self.assertEqual(rollback["active_generation"], first["generation_id"])
            self.assertEqual(index.active_generation(), first["generation_id"])

    def test_metadata_filter_fallback_prevents_silent_false_negative(self) -> None:
        with self.index() as index:
            record = index.parse_inline(
                "memory://filters",
                "# Safety\nNever force push a protected branch without explicit authorization.",
                "text/markdown",
                metadata={"domain": "git-safety", "tags": ["git", "safety"]},
            )
            index.ingest_records([record])
            index.reindex()
            strict = index.search("force push protected branch", filters={"domain": "wrong"})
            self.assertFalse(strict["filter_fallback"])
            self.assertEqual(strict["filtered_candidate_count"], 0)
            self.assertEqual(strict["results"], [])
            widened = index.search(
                "force push protected branch",
                filters={"domain": "wrong"},
                filter_fallback=True,
            )
            self.assertTrue(widened["filter_fallback"])
            self.assertEqual(widened["filter_fallback_reason"], "no_metadata_match")
            self.assertEqual(widened["results"][0]["source_uri"], "memory://filters")
            matched = index.search("force push protected branch", filters={"domain": "git-safety"})
            self.assertFalse(matched["filter_fallback"])

    def test_metadata_filter_is_applied_before_bounded_hybrid_ranking(self) -> None:
        with self.index() as index:
            records = [
                index.parse_inline(
                    f"memory://noise-{number}",
                    f"# Noise {number}\nExact rare target phrase mixed with unrelated interface notes.",
                    "text/markdown",
                    metadata={"domain": "noise"},
                )
                for number in range(60)
            ]
            records.append(
                index.parse_inline(
                    "memory://scoped-target",
                    "# Scoped\nExact rare target phrase with the authorized operational answer.",
                    "text/markdown",
                    metadata={"domain": "authorized"},
                )
            )
            index.ingest_records(records)
            index.reindex()
            result = index.search(
                "exact rare target phrase",
                limit=1,
                candidate_pool=5,
                filters={"domain": "authorized"},
            )
            self.assertEqual(result["filtered_candidate_count"], 1)
            self.assertEqual(result["results"][0]["source_uri"], "memory://scoped-target")

    def test_component_versions_and_metadata_are_complete(self) -> None:
        with self.index() as index:
            record = index.parse_inline(
                "memory://versioned",
                "# Versioned\nEvery index record binds parser normalizer chunker and embedding versions.",
                "text/markdown",
                metadata={
                    "domain": "version-proof",
                    "source_uri": "forged://source",
                    "parser_version": "forged-parser",
                    "normalized_hash": "forged-hash",
                },
            )
            self.assertEqual(record["metadata"]["source_uri"], "memory://versioned")
            self.assertEqual(record["metadata"]["parser_version"], ingestion.PARSER_VERSION)
            self.assertEqual(record["metadata"]["normalized_hash"], record["content_hash"])
            self.assertEqual(record["metadata"]["domain"], "version-proof")
            index.ingest_records([record])
            generation = index.reindex()
            status = index.status()
            self.assertEqual(status["active_generation"], generation["generation_id"])
            self.assertEqual(
                set(status["component_versions"]),
                {"parser", "normalizer", "chunker", "embedding"},
            )
            result = index.search("parser normalizer chunker embedding versions", limit=1)
            metadata = result["results"][0]["metadata"]
            for key in (
                "source_uri",
                "mime_type",
                "language",
                "raw_hash",
                "normalized_hash",
                "parser_version",
                "normalizer_version",
                "chunker_version",
                "embedding_model",
                "parent_version_id",
                "start_char",
                "end_char",
            ):
                self.assertIn(key, metadata)

    def test_query_rewrite_is_deterministic_and_local(self) -> None:
        first = ingestion.TinkerBrainIndex.rewrite_query("How do we make money?")
        second = ingestion.TinkerBrainIndex.rewrite_query("How do we make money?")
        self.assertEqual(first, second)
        self.assertIn("revenue", first)
        self.assertIn("cash", first)

    def test_metric_arithmetic_penalizes_missing_and_misordered_results(self) -> None:
        qrels = {"a": 2, "b": 1, "missing": 2}
        self.assertAlmostEqual(ingestion.recall_at_k(["a", "noise", "b"], qrels, 3), 2 / 3)
        self.assertEqual(ingestion.reciprocal_rank(["noise", "b"], qrels), 0.5)
        self.assertGreater(
            ingestion.ndcg_at_k(["a", "b"], qrels, 2),
            ingestion.ndcg_at_k(["b", "a"], qrels, 2),
        )
        self.assertEqual(ingestion.percentile([1, 2, 3, 4, 5], 0.5), 3)
        self.assertAlmostEqual(ingestion.percentile([1, 2], 0.95), 1.95)

    def test_fixture_eval_passes_recall_mrr_ndcg_release_floors(self) -> None:
        result = ingestion.evaluate_fixture()
        self.assertTrue(result["ok"], json.dumps(result, indent=2))
        self.assertGreaterEqual(result["summary"]["queries"], 8)
        self.assertGreaterEqual(result["summary"]["recall_at_5"], 0.9)
        self.assertGreaterEqual(result["summary"]["mrr"], 0.8)
        self.assertGreaterEqual(result["summary"]["ndcg_at_5"], 0.8)
        self.assertLessEqual(result["summary"]["latency_ms"]["p95"], 500.0)
        self.assertTrue(result["slices"])
        self.assertTrue(all(row["recall_at_5"] == 1.0 for row in result["per_query"]))

    def test_search_exposes_snapshot_latency_and_score_components(self) -> None:
        with self.index() as index:
            index.ingest_records(
                [
                    index.parse_inline(
                        "memory://explain",
                        "# Explain\nHybrid BM25 and vector ranking must expose score contributions.",
                        "text/markdown",
                    )
                ]
            )
            generation = index.reindex()
            result = index.search("hybrid BM25 vector ranking", limit=1)
            self.assertEqual(result["generation_id"], generation["generation_id"])
            self.assertEqual(result["consistency"], "strong_generation_snapshot")
            self.assertGreaterEqual(result["latency_ms"]["total"], 0)
            explanation = result["results"][0]["score_explanation"]
            self.assertEqual(
                set(explanation),
                {
                    "lexical_rrf",
                    "vector_rrf",
                    "vector_similarity",
                    "term_overlap",
                    "exact_phrase",
                    "overlap_boost",
                    "phrase_boost",
                    "vector_boost",
                },
            )

    def test_fixture_validation_rejects_unsatisfiable_qrels(self) -> None:
        fixture = json.loads(ingestion.DEFAULT_EVAL.read_text(encoding="utf-8"))
        fixture["queries"][0]["qrels"] = {"fixture://does-not-exist": 2}
        with self.assertRaisesRegex(ValueError, "fixture_unsatisfiable_qrels:gtm-exact"):
            ingestion.validate_fixture(fixture)


if __name__ == "__main__":
    unittest.main(verbosity=2)
