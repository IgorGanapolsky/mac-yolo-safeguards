#!/usr/bin/env python3
"""Adversarial verification for the tinker-brain ingestion/index engine."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sqlite3
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
            self.assertEqual(
                result,
                {
                    "added": 2,
                    "changed": 0,
                    "raw_only_changed": 0,
                    "unchanged": 0,
                    "duplicates": 1,
                },
            )
            generation = index.reindex()
            self.assertTrue(generation["ok"])
            self.assertEqual(generation["documents"], 1)
            output = index.search("promote ThumbGate buyer pain", limit=1)
            self.assertEqual(output["results"][0]["source_uri"], "memory://one")
            self.assertEqual(output["results"][0]["source_aliases"], ["memory://two"])

    def test_dedup_preserves_metadata_scopes(self) -> None:
        content = "# Isolation\nIdentical evidence must remain searchable inside each tenant scope."
        with self.index() as index:
            first = index.parse_inline(
                "memory://tenant-a",
                content,
                "text/markdown",
                metadata={"tenant": "tenant-a", "domain": "operations"},
            )
            second = index.parse_inline(
                "memory://tenant-b",
                content,
                "text/markdown",
                metadata={"tenant": "tenant-b", "domain": "operations"},
            )
            ingested = index.ingest_records([first, second])
            self.assertEqual(ingested["duplicates"], 0)
            generation = index.reindex()
            self.assertEqual(generation["documents"], 2)

            tenant_b = index.search(
                "identical evidence tenant scope",
                limit=1,
                filters={"tenant": "tenant-b"},
            )
            self.assertEqual(tenant_b["filtered_candidate_count"], 1)
            self.assertEqual(tenant_b["results"][0]["source_uri"], "memory://tenant-b")
            self.assertEqual(tenant_b["results"][0]["source_aliases"], [])

    def test_raw_only_revision_preserves_current_provenance(self) -> None:
        with self.index() as index:
            first = index.parse_inline(
                "memory://canonical-json",
                '{"a":1,"b":2}',
                "application/json",
            )
            second = index.parse_inline(
                "memory://canonical-json",
                '{\n  "b": 2,\n  "a": 1\n}',
                "application/json",
            )
            self.assertEqual(first["content_hash"], second["content_hash"])
            self.assertNotEqual(first["raw_hash"], second["raw_hash"])
            index.ingest_records([first])
            updated = index.ingest_records([second])

            self.assertEqual(updated["raw_only_changed"], 1)
            self.assertEqual(updated["changed"], 0)
            status = index.status()
            self.assertEqual(status["document_versions"], 1)
            self.assertEqual(status["source_observations"], 2)
            current = index.connection.execute(
                """
                SELECT o.raw_hash, o.raw_text, o.metadata_json
                FROM source_heads h
                JOIN source_observations o ON o.observation_id=h.observation_id
                WHERE h.source_uri=?
                """,
                ("memory://canonical-json",),
            ).fetchone()
            self.assertEqual(current["raw_hash"], second["raw_hash"])
            self.assertEqual(current["raw_text"], second["raw_text"])
            self.assertEqual(
                json.loads(current["metadata_json"])["source_bytes"],
                len(second["raw_text"].encode("utf-8")),
            )
            index.reindex()
            retrieved = index.search("canonical json fields a b", limit=1)["results"][0]
            self.assertEqual(retrieved["metadata"]["raw_hash"], second["raw_hash"])
            self.assertEqual(
                retrieved["metadata"]["source_bytes"],
                len(second["raw_text"].encode("utf-8")),
            )

    def test_schema_v1_source_heads_migrate_without_losing_searchable_evidence(self) -> None:
        source_uri = "memory://legacy-v1"
        text = "# Legacy\nA schema migration must retain searchable evidence and raw provenance."
        content_hash = ingestion.sha256_text(text)
        logical_id = ingestion.stable_id("doc", source_uri)
        version_id = ingestion.stable_id("ver", logical_id, content_hash)
        metadata = {
            "source_uri": source_uri,
            "mime_type": "text/markdown",
            "language": "en",
            "raw_hash": content_hash,
            "normalized_hash": content_hash,
            "parser_version": ingestion.PARSER_VERSION,
            "normalizer_version": ingestion.NORMALIZER_VERSION,
            "chunker_version": ingestion.CHUNKER_VERSION,
            "embedding_model": ingestion.HASH_EMBEDDING_MODEL,
        }
        connection = sqlite3.connect(self.db)
        connection.executescript(
            """
            CREATE TABLE documents (
              version_id TEXT PRIMARY KEY,
              logical_id TEXT NOT NULL,
              source_uri TEXT NOT NULL,
              content_hash TEXT NOT NULL,
              raw_hash TEXT NOT NULL,
              raw_text TEXT NOT NULL,
              normalized_text TEXT NOT NULL,
              title TEXT NOT NULL,
              mime_type TEXT NOT NULL,
              language TEXT NOT NULL,
              parser_version TEXT NOT NULL,
              normalizer_version TEXT NOT NULL,
              metadata_json TEXT NOT NULL,
              duplicate_of TEXT,
              is_current INTEGER NOT NULL DEFAULT 1,
              tombstoned INTEGER NOT NULL DEFAULT 0,
              ingested_at TEXT NOT NULL,
              UNIQUE(source_uri, content_hash)
            );
            CREATE TABLE source_heads (
              source_uri TEXT PRIMARY KEY,
              logical_id TEXT NOT NULL,
              version_id TEXT,
              content_hash TEXT,
              state TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            """
        )
        connection.execute(
            """
            INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,?)
            """,
            (
                version_id,
                logical_id,
                source_uri,
                content_hash,
                content_hash,
                text,
                text,
                "Legacy",
                "text/markdown",
                "en",
                ingestion.PARSER_VERSION,
                ingestion.NORMALIZER_VERSION,
                json.dumps(metadata, sort_keys=True),
                None,
                "2026-07-29T00:00:00Z",
            ),
        )
        connection.execute(
            "INSERT INTO source_heads VALUES(?,?,?,?,?,?)",
            (
                source_uri,
                logical_id,
                version_id,
                content_hash,
                "active",
                "2026-07-29T00:00:00Z",
            ),
        )
        connection.commit()
        connection.close()

        with self.index() as index:
            status = index.status()
            self.assertEqual(status["schema_version"], 2)
            self.assertEqual(status["source_observations"], 1)
            index.reindex()
            result = index.search("schema migration searchable evidence", limit=1)
            self.assertEqual(result["results"][0]["source_uri"], source_uri)

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

    def test_jsonl_lessons_are_atomic_stable_and_exactly_deduplicated(self) -> None:
        lesson_a = {
            "id": "lesson-a",
            "feedbackId": "fb-a",
            "lesson": "Verify the provider receipt before claiming external revenue.",
            "triggerMessage": "Are we making money?",
            "priorSummary": "A local funnel event was mistaken for cash.",
            "signal": "down",
            "confidence": 93,
            "tags": ["revenue", "verification"],
            "metadata": {"domain": "cash-truth"},
            "createdAt": "2026-07-29T00:00:00Z",
            "link": "memory://lesson-a",
        }
        lesson_b = {
            "id": "lesson-b",
            "feedbackId": "fb-b",
            "lesson": "Keep the previous generation active after a failed reindex.",
            "triggerMessage": "The rebuild crashed.",
            "priorSummary": "A partial generation must never become queryable.",
            "signal": "down",
            "confidence": 97,
            "tags": ["retrieval", "rollback"],
            "metadata": {"domain": "rag-operations"},
            "createdAt": "2026-07-29T00:01:00Z",
            "link": "memory://lesson-b",
        }
        initial = "\n".join(json.dumps(row) for row in (lesson_a, lesson_b, lesson_b))
        prepended = "\n".join(
            [
                json.dumps(
                    {
                        "id": "lesson-new",
                        "lesson": "A new independent lesson.",
                        "signal": "up",
                        "tags": ["new"],
                    }
                ),
                json.dumps(lesson_a),
                json.dumps(lesson_b),
            ]
        )
        with self.index() as index:
            index.ingest_records(
                [index.parse_inline("memory://lessons", initial, "application/x-ndjson")]
            )
            first_generation = index.reindex()
            first_chunks = {
                row["heading_path"]: row["chunk_id"]
                for row in index.connection.execute(
                    "SELECT heading_path, chunk_id FROM chunks WHERE generation_id=?",
                    (first_generation["generation_id"],),
                )
            }
            self.assertEqual(len(first_chunks), 2)
            result = index.search("provider receipt external revenue", limit=1)
            self.assertEqual(result["results"][0]["metadata"]["record_id"], "lesson-a")
            self.assertEqual(result["results"][0]["metadata"]["confidence"], 93)
            self.assertNotIn("failed reindex", result["results"][0]["parent_text"])
            multi = index.search("lesson revenue reindex", limit=2)
            self.assertEqual(
                {row["metadata"]["record_id"] for row in multi["results"]},
                {"lesson-a", "lesson-b"},
            )

            index.ingest_records(
                [index.parse_inline("memory://lessons", prepended, "application/x-ndjson")]
            )
            second_generation = index.reindex()
            second_chunks = {
                row["heading_path"]: row["chunk_id"]
                for row in index.connection.execute(
                    "SELECT heading_path, chunk_id FROM chunks WHERE generation_id=?",
                    (second_generation["generation_id"],),
                )
            }
            self.assertEqual(first_chunks["record/lesson-a"], second_chunks["record/lesson-a"])
            self.assertEqual(first_chunks["record/lesson-b"], second_chunks["record/lesson-b"])
            self.assertIn("record/lesson-new", second_chunks)

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

    def test_search_uses_active_generation_embedding_model(self) -> None:
        class WrongCurrentEmbedder:
            model = "ollama:not-the-generation-model"

            def embed(self, _text):
                raise AssertionError("search used the process-default embedder")

        with self.index() as index:
            index.ingest_records(
                [
                    index.parse_inline(
                        "memory://embedding-snapshot",
                        "# Snapshot\nThe query vector must match the active generation model.",
                        "text/markdown",
                    )
                ]
            )
            generation = index.reindex()
            index.embedder = WrongCurrentEmbedder()
            result = index.search("query vector active generation model", limit=1)
            self.assertEqual(result["embedding_model"], generation["embedding_model"])
            self.assertEqual(result["results"][0]["source_uri"], "memory://embedding-snapshot")

    def test_fixture_validation_rejects_unsatisfiable_qrels(self) -> None:
        fixture = json.loads(ingestion.DEFAULT_EVAL.read_text(encoding="utf-8"))
        fixture["queries"][0]["qrels"] = {"fixture://does-not-exist": 2}
        with self.assertRaisesRegex(ValueError, "fixture_unsatisfiable_qrels:gtm-exact"):
            ingestion.validate_fixture(fixture)


if __name__ == "__main__":
    unittest.main(verbosity=2)
