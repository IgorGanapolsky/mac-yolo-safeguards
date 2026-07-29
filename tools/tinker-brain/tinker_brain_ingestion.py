#!/usr/bin/env python3
"""Local-first document ingestion and hybrid retrieval for tinker-brain.

The module is deliberately dependency-free. SQLite FTS5 supplies lexical
retrieval; embeddings are local (Ollama when explicitly requested and
available, otherwise a versioned deterministic hashing model). Documents and
index generations are versioned independently so a failed rebuild cannot
replace the last queryable generation.
"""

from __future__ import annotations

import argparse
import array
import hashlib
import html
from html.parser import HTMLParser
import json
import math
import mimetypes
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import tempfile
import time
import unicodedata
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple


SCHEMA_VERSION = 1
PARSER_VERSION = "tinker-parser-v1"
NORMALIZER_VERSION = "tinker-normalizer-v1"
CHUNKER_VERSION = "tinker-heading-parent-v1"
HASH_EMBEDDING_MODEL = "hashing-token-bigram-v1-128"
DEFAULT_OLLAMA_MODEL = "nomic-embed-text"
DEFAULT_DB = Path.home() / ".hermes" / "tinker-brain" / "ingestion.sqlite3"
DEFAULT_EVAL = Path(__file__).resolve().parent / "fixtures" / "ingestion_eval_cases.json"

SUPPORTED_EXTENSIONS = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".json": "application/json",
    ".jsonl": "application/x-ndjson",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
    ".html": "text/html",
    ".htm": "text/html",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
}

TEXT_MIMES = {
    "text/plain",
    "text/markdown",
    "application/yaml",
    "text/yaml",
}
IMAGE_MIMES = {"image/png", "image/jpeg", "image/tiff"}

QUERY_SYNONYMS = {
    "money": ("revenue", "sales", "cash"),
    "revenue": ("money", "sales", "cash"),
    "promote": ("marketing", "acquisition", "campaign"),
    "marketing": ("promote", "acquisition", "campaign"),
    "broken": ("failure", "incident", "error"),
    "failure": ("broken", "incident", "error"),
    "deploy": ("release", "production", "ship"),
    "safe": ("guard", "policy", "approval"),
    "wording": ("paraphrase", "semantic", "vector"),
    "identifier": ("exact", "lexical", "bm25"),
    "matches": ("retrieval", "search", "ranking"),
}

STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "do",
    "does",
    "for",
    "from",
    "how",
    "if",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "our",
    "the",
    "this",
    "to",
    "we",
    "what",
    "when",
    "where",
    "which",
    "why",
    "with",
}

STAGE_CONTRACTS = {
    "parsing": {
        "why": "Convert supported source formats into inspectable text without pretending binary data is text.",
        "failures": ["unsupported MIME accepted", "parser returns empty text", "script/style content leaks"],
        "measures": ["parse_success_rate", "unsupported_mime_count", "empty_extract_count"],
    },
    "ocr": {
        "why": "Recover text only when native extraction is insufficient.",
        "failures": ["OCR runs unnecessarily", "OCR binary absent", "low-quality extraction is treated as truth"],
        "measures": ["ocr_fallback_count", "ocr_failure_count", "ocr_text_chars"],
    },
    "deduplication": {
        "why": "Prevent identical content from dominating retrieval while preserving every source URI.",
        "failures": ["duplicate chunks indexed", "distinct revisions collapsed", "source provenance lost"],
        "measures": ["exact_duplicate_count", "canonical_document_count", "alias_count"],
    },
    "normalization": {
        "why": "Make semantically identical Unicode and structured documents hash identically.",
        "failures": ["non-idempotent cleanup", "NFC variants diverge", "raw evidence overwritten"],
        "measures": ["normalization_idempotence", "normalized_hash", "raw_hash"],
    },
    "chunking": {
        "why": "Retrieve precise sections while returning their parent document for context.",
        "failures": ["ordinal IDs shift", "answer split across chunks", "overlap creates duplicate evidence"],
        "measures": ["chunk_count", "chunk_id_stability", "parent_context_rate"],
    },
    "metadata": {
        "why": "Support provenance, filtering, reproducibility, and deletion policy.",
        "failures": ["inferred fields treated as source truth", "filter excludes mis-tagged evidence", "version fields missing"],
        "measures": ["metadata_fill_rate", "filter_fallback_rate", "version_field_fill_rate"],
    },
    "incremental_updates": {
        "why": "Process only changed sources and represent deletions explicitly.",
        "failures": ["unchanged source reprocessed", "deleted source remains searchable", "manifest misses a change"],
        "measures": ["added", "changed", "unchanged", "deleted", "incremental_full_equivalence"],
    },
    "reindexing": {
        "why": "Rebuild changed parser, chunker, or embedding output without corrupting the active index.",
        "failures": ["partial generation becomes active", "old generation deleted early", "model change reuses stale vectors"],
        "measures": ["generation_status", "active_generation", "failed_rebuild_preserved_previous"],
    },
    "versioning": {
        "why": "Reproduce and roll back the exact parser, chunker, embedding, and content state.",
        "failures": ["lineage missing", "component version omitted", "rollback target incomplete"],
        "measures": ["document_version_count", "generation_count", "rollback_replay_checksum"],
    },
}


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def stable_id(prefix: str, *parts: str, length: int = 24) -> str:
    payload = "\x1f".join(str(part) for part in parts)
    return f"{prefix}_{sha256_text(payload)[:length]}"


def tokenize(text: str) -> List[str]:
    normalized = unicodedata.normalize("NFKC", text).lower()
    return re.findall(r"[a-z0-9][a-z0-9_.:/+-]*", normalized)


def significant_tokens(text: str) -> List[str]:
    return [term for term in tokenize(text) if len(term) > 1 and term not in STOPWORDS]


def normalize_text(text: str) -> str:
    value = unicodedata.normalize("NFC", str(text or "")).replace("\ufeff", "")
    value = value.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    lines = [re.sub(r"[ \t]+$", "", line) for line in value.split("\n")]
    value = "\n".join(lines)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def canonical_json(text: str, jsonl: bool = False) -> str:
    if jsonl:
        rows = []
        for line_number, line in enumerate(text.splitlines(), start=1):
            if not line.strip():
                continue
            try:
                rows.append(json.dumps(json.loads(line), sort_keys=True, ensure_ascii=False, separators=(",", ":")))
            except json.JSONDecodeError as exc:
                raise ValueError(f"JSONL line {line_number}: {exc.msg}") from exc
        return normalize_text("\n".join(rows))
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON: {exc.msg}") from exc
    return normalize_text(json.dumps(parsed, sort_keys=True, ensure_ascii=False, indent=2))


class _SafeHTMLText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._blocked_depth = 0
        self.parts: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        del attrs
        if tag.lower() in {"script", "style", "noscript", "template"}:
            self._blocked_depth += 1
        elif self._blocked_depth == 0 and tag.lower() in {"p", "br", "li", "h1", "h2", "h3", "h4"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style", "noscript", "template"} and self._blocked_depth:
            self._blocked_depth -= 1
        elif self._blocked_depth == 0 and tag.lower() in {"p", "li", "h1", "h2", "h3", "h4"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._blocked_depth == 0:
            self.parts.append(data)


def html_to_text(text: str) -> str:
    parser = _SafeHTMLText()
    parser.feed(text)
    parser.close()
    return normalize_text(html.unescape("".join(parser.parts)))


def detect_language(text: str) -> str:
    letters = [char for char in text if char.isalpha()]
    if not letters:
        return "und"
    ascii_letters = sum(1 for char in letters if ord(char) < 128)
    return "en" if ascii_letters / len(letters) >= 0.85 else "und"


def pack_vector(values: Sequence[float]) -> bytes:
    return array.array("f", values).tobytes()


def unpack_vector(blob: Optional[bytes]) -> List[float]:
    if not blob:
        return []
    values = array.array("f")
    values.frombytes(blob)
    return list(values)


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 0.0
    return dot / (left_norm * right_norm)


def hashing_embedding(text: str, dimensions: int = 128) -> List[float]:
    tokens = significant_tokens(text)
    features = tokens + [f"{tokens[index]}::{tokens[index + 1]}" for index in range(max(0, len(tokens) - 1))]
    vector = [0.0] * dimensions
    for feature in features:
        digest = hashlib.sha256(feature.encode("utf-8")).digest()
        bucket = int.from_bytes(digest[:4], "big") % dimensions
        sign = 1.0 if digest[4] & 1 else -1.0
        vector[bucket] += sign
    norm = math.sqrt(sum(value * value for value in vector))
    return [value / norm for value in vector] if norm else vector


class LocalEmbedder:
    def __init__(
        self,
        model: str = HASH_EMBEDDING_MODEL,
        ollama_url: str = "http://127.0.0.1:11434",
        ollama_timeout: float = 60.0,
    ) -> None:
        self.requested_model = model
        self.ollama_url = ollama_url.rstrip("/")
        self.ollama_timeout = ollama_timeout
        self.model = HASH_EMBEDDING_MODEL
        if model == "auto":
            if self._ollama_has_model(DEFAULT_OLLAMA_MODEL):
                self.model = f"ollama:{DEFAULT_OLLAMA_MODEL}"
        elif model.startswith("ollama:"):
            name = model.split(":", 1)[1]
            if not self._ollama_has_model(name):
                raise RuntimeError(f"local Ollama model unavailable: {name}")
            self.model = model
        elif model != HASH_EMBEDDING_MODEL:
            raise ValueError(f"unsupported local embedding model: {model}")

    def _ollama_has_model(self, name: str) -> bool:
        # A running Ollama can take more than one second to answer its first
        # request after idle. Retry once so `auto` does not silently select the
        # hash fallback merely because the local model registry was cold.
        for _attempt in range(2):
            try:
                with urllib.request.urlopen(f"{self.ollama_url}/api/tags", timeout=3.0) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                names = {str(row.get("name", "")).split(":")[0] for row in payload.get("models", [])}
                return name.split(":")[0] in names
            except (OSError, ValueError, urllib.error.URLError):
                continue
        return False

    def embed(self, text: str) -> List[float]:
        if self.model == HASH_EMBEDDING_MODEL:
            return hashing_embedding(text)
        model_name = self.model.split(":", 1)[1]
        request = urllib.request.Request(
            f"{self.ollama_url}/api/embed",
            data=json.dumps({"model": model_name, "input": text, "keep_alive": "5m"}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=self.ollama_timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
            embeddings = payload.get("embeddings") or []
            if not embeddings or not isinstance(embeddings[0], list):
                raise RuntimeError("Ollama returned no embedding")
            return [float(value) for value in embeddings[0]]
        except (OSError, ValueError, urllib.error.URLError) as exc:
            raise RuntimeError(f"local Ollama embedding failed: {exc}") from exc


class TinkerBrainIndex:
    def __init__(
        self,
        db_path: Path,
        embedding_model: str = HASH_EMBEDDING_MODEL,
        command_runner: Optional[Callable[[Sequence[str]], str]] = None,
    ) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.embedder = LocalEmbedder(embedding_model)
        self._external_command_runner = command_runner is not None
        self.command_runner = command_runner or self._default_command_runner
        self.connection = sqlite3.connect(str(self.db_path))
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys=ON")
        self.connection.execute("PRAGMA journal_mode=WAL")
        self._init_schema()

    def close(self) -> None:
        self.connection.close()

    def __enter__(self) -> "TinkerBrainIndex":
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        del exc_type, exc, traceback
        self.close()

    @staticmethod
    def _default_command_runner(command: Sequence[str]) -> str:
        completed = subprocess.run(
            list(command),
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=120,
        )
        return completed.stdout

    def _command_available(self, command: str) -> bool:
        return self._external_command_runner or shutil.which(command) is not None

    def _init_schema(self) -> None:
        self.connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS documents (
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
            CREATE INDEX IF NOT EXISTS documents_current_idx
              ON documents(is_current, tombstoned, duplicate_of);
            CREATE INDEX IF NOT EXISTS documents_hash_idx
              ON documents(content_hash, is_current, tombstoned);
            CREATE TABLE IF NOT EXISTS source_heads (
              source_uri TEXT PRIMARY KEY,
              logical_id TEXT NOT NULL,
              version_id TEXT,
              content_hash TEXT,
              state TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS generations (
              generation_id TEXT PRIMARY KEY,
              status TEXT NOT NULL,
              parent_generation TEXT,
              embedding_model TEXT NOT NULL,
              parser_version TEXT NOT NULL,
              normalizer_version TEXT NOT NULL,
              chunker_version TEXT NOT NULL,
              created_at TEXT NOT NULL,
              activated_at TEXT,
              error TEXT
            );
            CREATE TABLE IF NOT EXISTS chunks (
              generation_id TEXT NOT NULL,
              chunk_id TEXT NOT NULL,
              version_id TEXT NOT NULL,
              logical_id TEXT NOT NULL,
              source_uri TEXT NOT NULL,
              title TEXT NOT NULL,
              heading_path TEXT NOT NULL,
              content TEXT NOT NULL,
              start_char INTEGER NOT NULL,
              end_char INTEGER NOT NULL,
              metadata_json TEXT NOT NULL,
              embedding BLOB NOT NULL,
              PRIMARY KEY(generation_id, chunk_id),
              FOREIGN KEY(generation_id) REFERENCES generations(generation_id),
              FOREIGN KEY(version_id) REFERENCES documents(version_id)
            );
            CREATE INDEX IF NOT EXISTS chunks_generation_idx
              ON chunks(generation_id, source_uri);
            CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
              chunk_id UNINDEXED,
              generation_id UNINDEXED,
              title,
              heading_path,
              content,
              tokenize='unicode61'
            );
            """
        )
        self.connection.execute(
            "INSERT OR REPLACE INTO settings(key, value) VALUES('schema_version', ?)",
            (str(SCHEMA_VERSION),),
        )
        self.connection.commit()

    def detect_mime(self, path: Path, explicit: Optional[str] = None) -> str:
        if explicit:
            mime = explicit.split(";", 1)[0].strip().lower()
        else:
            mime = SUPPORTED_EXTENSIONS.get(path.suffix.lower()) or mimetypes.guess_type(str(path))[0] or ""
        if mime not in TEXT_MIMES | IMAGE_MIMES | {
            "application/json",
            "application/x-ndjson",
            "text/html",
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }:
            raise ValueError(f"unsupported_mime:{mime or 'unknown'}")
        return mime

    def parse_path(self, path: Path, explicit_mime: Optional[str] = None) -> Dict[str, Any]:
        path = Path(path).resolve()
        if not path.is_file():
            raise ValueError(f"source_not_file:{path}")
        mime = self.detect_mime(path, explicit_mime)
        raw_bytes = path.read_bytes()
        raw_hash = hashlib.sha256(raw_bytes).hexdigest()
        ocr_used = False
        ocr_engine = None

        if mime in TEXT_MIMES | {"application/json", "application/x-ndjson", "text/html"}:
            try:
                raw_text = raw_bytes.decode("utf-8")
            except UnicodeDecodeError as exc:
                raise ValueError(f"utf8_decode_error:{path}") from exc
        elif mime == "application/pdf":
            if not self._command_available("pdftotext"):
                raise ValueError("pdf_parser_unavailable:pdftotext")
            raw_text = self.command_runner(["pdftotext", "-layout", str(path), "-"])
            if len(re.sub(r"\s+", "", raw_text)) < 40:
                raw_text = self._ocr_pdf(path)
                ocr_used = True
                ocr_engine = "tesseract"
        elif mime in IMAGE_MIMES:
            raw_text = self._ocr_image(path)
            ocr_used = True
            ocr_engine = "tesseract"
        elif mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            if not self._command_available("textutil"):
                raise ValueError("docx_parser_unavailable:textutil")
            raw_text = self.command_runner(["textutil", "-convert", "txt", "-stdout", str(path)])
        else:
            raise ValueError(f"unsupported_mime:{mime}")

        if mime == "application/json":
            normalized = canonical_json(raw_text)
        elif mime == "application/x-ndjson":
            normalized = canonical_json(raw_text, jsonl=True)
        elif mime == "text/html":
            normalized = html_to_text(raw_text)
        else:
            normalized = normalize_text(raw_text)
        if not normalized:
            raise ValueError("empty_extract")

        stat = path.stat()
        title = path.stem
        return {
            "source_uri": str(path),
            "title": title,
            "mime_type": mime,
            "raw_text": raw_text,
            "normalized_text": normalized,
            "raw_hash": raw_hash,
            "content_hash": sha256_text(normalized),
            "metadata": {
                "source_uri": str(path),
                "mime_type": mime,
                "language": detect_language(normalized),
                "source_bytes": stat.st_size,
                "source_mtime_ns": stat.st_mtime_ns,
                "raw_hash": raw_hash,
                "normalized_hash": sha256_text(normalized),
                "parser_version": PARSER_VERSION,
                "normalizer_version": NORMALIZER_VERSION,
                "chunker_version": CHUNKER_VERSION,
                "embedding_model": self.embedder.model,
                "ocr_used": ocr_used,
                "ocr_engine": ocr_engine,
            },
        }

    def parse_inline(
        self,
        source_uri: str,
        content: str,
        mime_type: str = "text/plain",
        title: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        mime = self.detect_mime(Path(source_uri), mime_type)
        if mime == "application/json":
            normalized = canonical_json(content)
        elif mime == "application/x-ndjson":
            normalized = canonical_json(content, jsonl=True)
        elif mime == "text/html":
            normalized = html_to_text(content)
        elif mime in TEXT_MIMES:
            normalized = normalize_text(content)
        else:
            raise ValueError(f"inline_binary_not_supported:{mime}")
        if not normalized:
            raise ValueError("empty_extract")
        raw_hash = sha256_text(content)
        meta = dict(metadata or {})
        # Source-supplied metadata may add domain/tags but cannot forge the
        # system provenance or component versions used for reproducibility.
        meta.update({
            "source_uri": source_uri,
            "mime_type": mime,
            "language": detect_language(normalized),
            "source_bytes": len(content.encode("utf-8")),
            "source_mtime_ns": None,
            "raw_hash": raw_hash,
            "normalized_hash": sha256_text(normalized),
            "parser_version": PARSER_VERSION,
            "normalizer_version": NORMALIZER_VERSION,
            "chunker_version": CHUNKER_VERSION,
            "embedding_model": self.embedder.model,
            "ocr_used": False,
            "ocr_engine": None,
        })
        return {
            "source_uri": source_uri,
            "title": title or Path(source_uri).stem or "document",
            "mime_type": mime,
            "raw_text": content,
            "normalized_text": normalized,
            "raw_hash": raw_hash,
            "content_hash": sha256_text(normalized),
            "metadata": meta,
        }

    def _ocr_image(self, path: Path) -> str:
        if not self._command_available("tesseract"):
            raise ValueError("ocr_unavailable:tesseract")
        text = self.command_runner(["tesseract", str(path), "stdout", "-l", "eng"])
        if len(re.sub(r"\s+", "", text)) < 8:
            raise ValueError("ocr_empty_extract")
        return text

    def _ocr_pdf(self, path: Path) -> str:
        if not self._command_available("pdftoppm") or not self._command_available("tesseract"):
            raise ValueError("ocr_unavailable:pdftoppm+tesseract")
        with tempfile.TemporaryDirectory(prefix="tinker-brain-ocr-") as directory:
            prefix = Path(directory) / "page"
            self.command_runner(["pdftoppm", "-png", "-r", "200", str(path), str(prefix)])
            pages = sorted(Path(directory).glob("page-*.png"))
            if not pages:
                raise ValueError("ocr_pdf_render_empty")
            text = "\n\n".join(self._ocr_image(page) for page in pages)
        if len(re.sub(r"\s+", "", text)) < 8:
            raise ValueError("ocr_empty_extract")
        return text

    def ingest_records(self, records: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
        counters = {"added": 0, "changed": 0, "unchanged": 0, "duplicates": 0}
        for record in records:
            source_uri = str(record["source_uri"])
            content_hash = str(record["content_hash"])
            head = self.connection.execute(
                "SELECT * FROM source_heads WHERE source_uri=?",
                (source_uri,),
            ).fetchone()
            if head and head["state"] == "active" and head["content_hash"] == content_hash:
                counters["unchanged"] += 1
                continue

            logical_id = head["logical_id"] if head else stable_id("doc", source_uri)
            version_id = stable_id("ver", logical_id, content_hash)
            duplicate = self.connection.execute(
                """
                SELECT logical_id FROM documents
                WHERE content_hash=? AND is_current=1 AND tombstoned=0 AND logical_id<>?
                ORDER BY ingested_at, logical_id LIMIT 1
                """,
                (content_hash, logical_id),
            ).fetchone()
            duplicate_of = duplicate["logical_id"] if duplicate else None

            if head and head["version_id"]:
                self.connection.execute(
                    "UPDATE documents SET is_current=0 WHERE version_id=?",
                    (head["version_id"],),
                )
                counters["changed"] += 1
            else:
                counters["added"] += 1
            if duplicate_of:
                counters["duplicates"] += 1

            metadata = dict(record.get("metadata") or {})
            metadata.update(
                {
                    "logical_id": logical_id,
                    "version_id": version_id,
                    "content_hash": content_hash,
                    "duplicate_of": duplicate_of,
                }
            )
            self.connection.execute(
                """
                INSERT INTO documents(
                  version_id, logical_id, source_uri, content_hash, raw_hash,
                  raw_text, normalized_text, title, mime_type, language,
                  parser_version, normalizer_version, metadata_json,
                  duplicate_of, is_current, tombstoned, ingested_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,?)
                ON CONFLICT(version_id) DO UPDATE SET
                  is_current=1, tombstoned=0, duplicate_of=excluded.duplicate_of,
                  metadata_json=excluded.metadata_json, ingested_at=excluded.ingested_at
                """,
                (
                    version_id,
                    logical_id,
                    source_uri,
                    content_hash,
                    record["raw_hash"],
                    record["raw_text"],
                    record["normalized_text"],
                    record["title"],
                    record["mime_type"],
                    metadata.get("language", "und"),
                    PARSER_VERSION,
                    NORMALIZER_VERSION,
                    json.dumps(metadata, sort_keys=True),
                    duplicate_of,
                    utc_now(),
                ),
            )
            self.connection.execute(
                """
                INSERT INTO source_heads(source_uri, logical_id, version_id, content_hash, state, updated_at)
                VALUES(?,?,?,?, 'active', ?)
                ON CONFLICT(source_uri) DO UPDATE SET
                  logical_id=excluded.logical_id, version_id=excluded.version_id,
                  content_hash=excluded.content_hash, state='active', updated_at=excluded.updated_at
                """,
                (source_uri, logical_id, version_id, content_hash, utc_now()),
            )
        self.connection.commit()
        return counters

    def ingest_paths(self, paths: Sequence[Path]) -> Dict[str, Any]:
        records = [self.parse_path(Path(path)) for path in paths]
        return self.ingest_records(records)

    def sync_root(self, root: Path, recursive: bool = True) -> Dict[str, Any]:
        root = Path(root).resolve()
        candidates = root.rglob("*") if recursive else root.glob("*")
        paths = sorted(path for path in candidates if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS)
        records = [self.parse_path(path) for path in paths]
        result = self.ingest_records(records)
        seen = {str(path.resolve()) for path in paths}
        prefix = f"{root}{os.sep}"
        heads = self.connection.execute(
            "SELECT * FROM source_heads WHERE state='active'"
        ).fetchall()
        deleted = 0
        for head in heads:
            source_uri = str(head["source_uri"])
            if source_uri.startswith(prefix) and source_uri not in seen:
                self.connection.execute(
                    "UPDATE source_heads SET state='deleted', updated_at=? WHERE source_uri=?",
                    (utc_now(), source_uri),
                )
                self.connection.execute(
                    "UPDATE documents SET tombstoned=1 WHERE version_id=?",
                    (head["version_id"],),
                )
                deleted += 1
        self.connection.commit()
        result.update({"deleted": deleted, "discovered": len(paths)})
        return result

    @staticmethod
    def _section_rows(text: str, fallback_title: str) -> List[Tuple[str, str, int, int]]:
        heading_re = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)
        matches = list(heading_re.finditer(text))
        if not matches:
            return [(fallback_title, text, 0, len(text))]
        rows: List[Tuple[str, str, int, int]] = []
        stack: List[Tuple[int, str]] = []
        if matches[0].start() > 0 and text[: matches[0].start()].strip():
            rows.append((fallback_title, text[: matches[0].start()].strip(), 0, matches[0].start()))
        for index, match in enumerate(matches):
            level = len(match.group(1))
            heading = normalize_text(match.group(2))
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, heading))
            start = match.end()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
            body = text[start:end].strip()
            if body:
                rows.append((" / ".join(item[1] for item in stack), body, start, end))
        return rows

    @staticmethod
    def _window_chunks(text: str, target_chars: int = 900, overlap_chars: int = 120) -> List[Tuple[str, int, int]]:
        if len(text) <= target_chars:
            return [(text, 0, len(text))]
        rows: List[Tuple[str, int, int]] = []
        start = 0
        while start < len(text):
            end = min(len(text), start + target_chars)
            if end < len(text):
                window = text[start:end]
                candidates = [window.rfind("\n\n"), window.rfind(". "), window.rfind("; ")]
                boundary = max(candidates)
                if boundary >= int(target_chars * 0.65):
                    end = start + boundary + (2 if window[boundary : boundary + 2] in {". ", "; "} else 0)
            piece = text[start:end].strip()
            if piece:
                actual_start = text.find(piece, start, end + 1)
                rows.append((piece, actual_start, actual_start + len(piece)))
            if end >= len(text):
                break
            next_start = max(start + 1, end - overlap_chars)
            start = next_start
        return rows

    def chunks_for_document(self, document: sqlite3.Row) -> List[Dict[str, Any]]:
        text = str(document["normalized_text"])
        rows: List[Dict[str, Any]] = []
        for heading_path, section, section_start, _section_end in self._section_rows(text, document["title"]):
            for piece, local_start, local_end in self._window_chunks(section):
                chunk_id = stable_id(
                    "chk",
                    document["logical_id"],
                    heading_path,
                    sha256_text(piece),
                )
                metadata = json.loads(document["metadata_json"])
                metadata.update(
                    {
                        "heading_path": heading_path,
                        "parent_version_id": document["version_id"],
                        "start_char": section_start + local_start,
                        "end_char": section_start + local_end,
                        "chunker_version": CHUNKER_VERSION,
                    }
                )
                rows.append(
                    {
                        "chunk_id": chunk_id,
                        "version_id": document["version_id"],
                        "logical_id": document["logical_id"],
                        "source_uri": document["source_uri"],
                        "title": document["title"],
                        "heading_path": heading_path,
                        "content": piece,
                        "start_char": section_start + local_start,
                        "end_char": section_start + local_end,
                        "metadata": metadata,
                    }
                )
        return rows

    def active_generation(self) -> Optional[str]:
        row = self.connection.execute(
            "SELECT value FROM settings WHERE key='active_generation'"
        ).fetchone()
        return str(row["value"]) if row else None

    def reindex(
        self,
        fail_after_chunks: Optional[int] = None,
        validator: Optional[Callable[[str, int], bool]] = None,
    ) -> Dict[str, Any]:
        parent = self.active_generation()
        generation_id = stable_id("gen", utc_now(), str(time.time_ns()), self.embedder.model)
        self.connection.execute(
            """
            INSERT INTO generations(
              generation_id, status, parent_generation, embedding_model,
              parser_version, normalizer_version, chunker_version, created_at
            ) VALUES(?, 'building', ?, ?, ?, ?, ?, ?)
            """,
            (
                generation_id,
                parent,
                self.embedder.model,
                PARSER_VERSION,
                NORMALIZER_VERSION,
                CHUNKER_VERSION,
                utc_now(),
            ),
        )
        self.connection.commit()
        inserted = 0
        try:
            active_documents = self.connection.execute(
                """
                SELECT d.* FROM documents d
                JOIN source_heads h ON h.version_id=d.version_id
                WHERE d.is_current=1 AND d.tombstoned=0
                  AND h.state='active'
                ORDER BY d.source_uri
                """
            ).fetchall()
            # Canonicalize per generation, not only at first ingestion. If the
            # original source is deleted, an active identical alias becomes the
            # canonical indexed source instead of making the evidence vanish.
            documents_by_hash: Dict[str, sqlite3.Row] = {}
            for document in active_documents:
                documents_by_hash.setdefault(str(document["content_hash"]), document)
            documents = list(documents_by_hash.values())
            with self.connection:
                for document in documents:
                    for chunk in self.chunks_for_document(document):
                        embedding = self.embedder.embed(
                            f"{chunk['title']}\n{chunk['heading_path']}\n{chunk['content']}"
                        )
                        self.connection.execute(
                            """
                            INSERT INTO chunks(
                              generation_id, chunk_id, version_id, logical_id, source_uri,
                              title, heading_path, content, start_char, end_char,
                              metadata_json, embedding
                            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
                            """,
                            (
                                generation_id,
                                chunk["chunk_id"],
                                chunk["version_id"],
                                chunk["logical_id"],
                                chunk["source_uri"],
                                chunk["title"],
                                chunk["heading_path"],
                                chunk["content"],
                                chunk["start_char"],
                                chunk["end_char"],
                                json.dumps(chunk["metadata"], sort_keys=True),
                                pack_vector(embedding),
                            ),
                        )
                        self.connection.execute(
                            """
                            INSERT INTO chunks_fts(chunk_id, generation_id, title, heading_path, content)
                            VALUES(?,?,?,?,?)
                            """,
                            (
                                chunk["chunk_id"],
                                generation_id,
                                chunk["title"],
                                chunk["heading_path"],
                                chunk["content"],
                            ),
                        )
                        inserted += 1
                        if fail_after_chunks is not None and inserted >= fail_after_chunks:
                            raise RuntimeError("injected_reindex_failure")
                if documents and inserted == 0:
                    raise RuntimeError("reindex_produced_zero_chunks")
                if validator is not None and not validator(generation_id, inserted):
                    raise RuntimeError("generation_validator_failed")
                if parent:
                    self.connection.execute(
                        "UPDATE generations SET status='ready' WHERE generation_id=?",
                        (parent,),
                    )
                self.connection.execute(
                    "UPDATE generations SET status='active', activated_at=? WHERE generation_id=?",
                    (utc_now(), generation_id),
                )
                self.connection.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES('active_generation', ?)",
                    (generation_id,),
                )
            return {
                "ok": True,
                "generation_id": generation_id,
                "previous_generation": parent,
                "documents": len(documents),
                "chunks": inserted,
                "embedding_model": self.embedder.model,
            }
        except Exception as exc:
            self.connection.rollback()
            self.connection.execute(
                "DELETE FROM chunks_fts WHERE generation_id=?",
                (generation_id,),
            )
            self.connection.execute(
                "DELETE FROM chunks WHERE generation_id=?",
                (generation_id,),
            )
            self.connection.execute(
                "UPDATE generations SET status='failed', error=? WHERE generation_id=?",
                (str(exc), generation_id),
            )
            self.connection.commit()
            return {
                "ok": False,
                "generation_id": generation_id,
                "previous_generation": parent,
                "active_generation": self.active_generation(),
                "chunks_attempted": inserted,
                "error": str(exc),
            }

    def rollback(self, generation_id: str) -> Dict[str, Any]:
        target = self.connection.execute(
            "SELECT * FROM generations WHERE generation_id=?",
            (generation_id,),
        ).fetchone()
        if not target or target["status"] not in {"ready", "active"}:
            raise ValueError("rollback_generation_not_ready")
        count = self.connection.execute(
            "SELECT COUNT(*) AS count FROM chunks WHERE generation_id=?",
            (generation_id,),
        ).fetchone()["count"]
        if count == 0:
            raise ValueError("rollback_generation_empty")
        previous = self.active_generation()
        with self.connection:
            if previous and previous != generation_id:
                self.connection.execute(
                    "UPDATE generations SET status='ready' WHERE generation_id=?",
                    (previous,),
                )
            self.connection.execute(
                "UPDATE generations SET status='active', activated_at=? WHERE generation_id=?",
                (utc_now(), generation_id),
            )
            self.connection.execute(
                "INSERT OR REPLACE INTO settings(key, value) VALUES('active_generation', ?)",
                (generation_id,),
            )
        return {"ok": True, "active_generation": generation_id, "previous_generation": previous, "chunks": count}

    @staticmethod
    def rewrite_query(query: str) -> str:
        terms = significant_tokens(query)
        expanded = list(terms)
        for term in terms:
            expanded.extend(QUERY_SYNONYMS.get(term, ()))
        return " ".join(dict.fromkeys(expanded))

    @staticmethod
    def _fts_query(query: str) -> str:
        terms = [term.replace('"', "") for term in significant_tokens(query)]
        return " OR ".join(f'"{term}"' for term in terms[:32])

    @staticmethod
    def _metadata_matches(metadata: Dict[str, Any], filters: Dict[str, Any]) -> bool:
        for key, expected in filters.items():
            actual = metadata.get(key)
            if isinstance(expected, (list, tuple, set)):
                expected_values = {str(value) for value in expected}
                actual_values = set(str(value) for value in actual) if isinstance(actual, list) else {str(actual)}
                if not expected_values.intersection(actual_values):
                    return False
            elif str(actual) != str(expected):
                return False
        return True

    def _candidate_rows(self, generation_id: str) -> List[sqlite3.Row]:
        return self.connection.execute(
            "SELECT * FROM chunks WHERE generation_id=?",
            (generation_id,),
        ).fetchall()

    def search(
        self,
        query: str,
        limit: int = 5,
        filters: Optional[Dict[str, Any]] = None,
        candidate_pool: int = 50,
        filter_fallback: bool = True,
    ) -> Dict[str, Any]:
        generation_id = self.active_generation()
        if not generation_id:
            return {"query": query, "generation_id": None, "results": [], "error": "no_active_generation"}
        rewritten = self.rewrite_query(query)
        fts_query = self._fts_query(rewritten)
        lexical_ids: List[str] = []
        if fts_query:
            lexical_ids = [
                row["chunk_id"]
                for row in self.connection.execute(
                    """
                    SELECT chunk_id, bm25(chunks_fts, 0.0, 0.0, 2.0, 1.5, 1.0) AS score
                    FROM chunks_fts
                    WHERE chunks_fts MATCH ? AND generation_id=?
                    ORDER BY score LIMIT ?
                    """,
                    (fts_query, generation_id, candidate_pool),
                ).fetchall()
            ]

        all_rows = self._candidate_rows(generation_id)
        row_by_id = {row["chunk_id"]: row for row in all_rows}
        query_embedding = self.embedder.embed(rewritten)
        vector_ranked = sorted(
            all_rows,
            key=lambda row: cosine_similarity(query_embedding, unpack_vector(row["embedding"])),
            reverse=True,
        )[:candidate_pool]
        vector_ids = [row["chunk_id"] for row in vector_ranked]
        vector_scores = {
            row["chunk_id"]: cosine_similarity(query_embedding, unpack_vector(row["embedding"]))
            for row in vector_ranked
        }

        fused: Dict[str, float] = {}
        # Exact terms are strong evidence in operational corpora; dense matches
        # help with paraphrases but must not drown identifiers or provider names.
        for ranking, weight in ((lexical_ids, 2.0), (vector_ids, 1.0)):
            for rank, chunk_id in enumerate(ranking, start=1):
                fused[chunk_id] = fused.get(chunk_id, 0.0) + weight / (60.0 + rank)

        query_terms = set(significant_tokens(rewritten))
        candidates = []
        for chunk_id, rrf_score in fused.items():
            row = row_by_id.get(chunk_id)
            if not row:
                continue
            metadata = json.loads(row["metadata_json"])
            if filters and not self._metadata_matches(metadata, filters):
                continue
            content_terms = set(significant_tokens(f"{row['title']} {row['heading_path']} {row['content']}"))
            overlap = len(query_terms.intersection(content_terms)) / max(1, len(query_terms))
            exact_phrase = 1.0 if normalize_text(query).lower() in row["content"].lower() else 0.0
            reranked = rrf_score + (0.08 * overlap) + (0.03 * exact_phrase) + (0.02 * vector_scores.get(chunk_id, 0.0))
            candidates.append((reranked, row, metadata))
        candidates.sort(key=lambda item: (-item[0], item[1]["chunk_id"]))

        used_filter_fallback = False
        if filters and not candidates and filter_fallback:
            used_filter_fallback = True
            fallback = self.search(
                query,
                limit=limit,
                filters=None,
                candidate_pool=candidate_pool,
                filter_fallback=False,
            )
            fallback["filters"] = filters
            fallback["filter_fallback"] = True
            return fallback

        results = []
        seen_documents = set()
        for score, row, metadata in candidates:
            # Parent-child retrieval ranks chunks but returns diverse parents.
            # Otherwise two high-scoring sections from one document can crowd a
            # relevant second document out of top-k and make Recall@k lie.
            if row["logical_id"] in seen_documents:
                continue
            seen_documents.add(row["logical_id"])
            document = self.connection.execute(
                "SELECT normalized_text, duplicate_of FROM documents WHERE version_id=?",
                (row["version_id"],),
            ).fetchone()
            aliases = [
                alias["source_uri"]
                for alias in self.connection.execute(
                    """
                    SELECT d.source_uri FROM documents d
                    JOIN source_heads h ON h.version_id=d.version_id
                    WHERE d.content_hash=? AND d.logical_id<>?
                      AND d.is_current=1 AND d.tombstoned=0 AND h.state='active'
                    ORDER BY d.source_uri
                    """,
                    (metadata["normalized_hash"], row["logical_id"]),
                ).fetchall()
            ]
            results.append(
                {
                    "chunk_id": row["chunk_id"],
                    "logical_id": row["logical_id"],
                    "version_id": row["version_id"],
                    "source_uri": row["source_uri"],
                    "source_aliases": aliases,
                    "title": row["title"],
                    "heading_path": row["heading_path"],
                    "content": row["content"],
                    "parent_text": document["normalized_text"],
                    "metadata": metadata,
                    "score": round(score, 8),
                }
            )
            if len(results) >= max(1, limit):
                break
        return {
            "query": query,
            "rewritten_query": rewritten,
            "generation_id": generation_id,
            "embedding_model": self.embedder.model,
            "filters": filters or {},
            "filter_fallback": used_filter_fallback,
            "candidate_count": len(candidates),
            "results": results,
        }

    def status(self) -> Dict[str, Any]:
        active = self.active_generation()
        scalar = lambda sql, args=(): self.connection.execute(sql, args).fetchone()[0]
        generations = [
            dict(row)
            for row in self.connection.execute(
                "SELECT generation_id, status, embedding_model, created_at, activated_at, error FROM generations ORDER BY created_at"
            ).fetchall()
        ]
        return {
            "schema_version": SCHEMA_VERSION,
            "db_path": str(self.db_path),
            "active_generation": active,
            "sources_active": scalar("SELECT COUNT(*) FROM source_heads WHERE state='active'"),
            "sources_deleted": scalar("SELECT COUNT(*) FROM source_heads WHERE state='deleted'"),
            "document_versions": scalar("SELECT COUNT(*) FROM documents"),
            "current_documents": scalar("SELECT COUNT(*) FROM documents WHERE is_current=1 AND tombstoned=0"),
            "exact_duplicates": scalar(
                "SELECT COUNT(*) FROM documents WHERE is_current=1 AND tombstoned=0 AND duplicate_of IS NOT NULL"
            ),
            "active_chunks": scalar("SELECT COUNT(*) FROM chunks WHERE generation_id=?", (active,)) if active else 0,
            "embedding_model": self.embedder.model,
            "component_versions": {
                "parser": PARSER_VERSION,
                "normalizer": NORMALIZER_VERSION,
                "chunker": CHUNKER_VERSION,
                "embedding": self.embedder.model,
            },
            "generations": generations,
            "stage_contracts": STAGE_CONTRACTS,
        }


def recall_at_k(ranked: Sequence[str], qrels: Dict[str, int], k: int) -> float:
    relevant = {key for key, grade in qrels.items() if int(grade) > 0}
    if not relevant:
        return 0.0
    return len(relevant.intersection(ranked[:k])) / len(relevant)


def reciprocal_rank(ranked: Sequence[str], qrels: Dict[str, int]) -> float:
    relevant = {key for key, grade in qrels.items() if int(grade) > 0}
    for index, item in enumerate(ranked, start=1):
        if item in relevant:
            return 1.0 / index
    return 0.0


def ndcg_at_k(ranked: Sequence[str], qrels: Dict[str, int], k: int) -> float:
    def dcg(grades: Sequence[int]) -> float:
        return sum((2 ** grade - 1) / math.log2(index + 2) for index, grade in enumerate(grades))

    actual = [int(qrels.get(item, 0)) for item in ranked[:k]]
    ideal = sorted((int(grade) for grade in qrels.values() if int(grade) > 0), reverse=True)[:k]
    ideal_score = dcg(ideal)
    return dcg(actual) / ideal_score if ideal_score else 0.0


def validate_fixture(fixture: Dict[str, Any]) -> None:
    documents = fixture.get("documents")
    queries = fixture.get("queries")
    thresholds = fixture.get("thresholds")
    if not isinstance(documents, list) or not documents:
        raise ValueError("fixture_documents_empty")
    if not isinstance(queries, list) or not queries:
        raise ValueError("fixture_queries_empty")
    if not isinstance(thresholds, dict):
        raise ValueError("fixture_thresholds_missing")

    source_uris = [str(row.get("source_uri", "")) for row in documents]
    if any(not source_uri for source_uri in source_uris):
        raise ValueError("fixture_document_source_uri_missing")
    if len(source_uris) != len(set(source_uris)):
        raise ValueError("fixture_duplicate_document_source_uri")

    query_ids = [str(row.get("id", "")) for row in queries]
    if any(not query_id for query_id in query_ids):
        raise ValueError("fixture_query_id_missing")
    if len(query_ids) != len(set(query_ids)):
        raise ValueError("fixture_duplicate_query_id")
    known_sources = set(source_uris)
    for case in queries:
        qrels = case.get("qrels")
        if not isinstance(qrels, dict) or not any(int(grade) > 0 for grade in qrels.values()):
            raise ValueError(f"fixture_query_has_no_relevant_source:{case['id']}")
        missing = sorted(str(source) for source in qrels if str(source) not in known_sources)
        if missing:
            raise ValueError(f"fixture_unsatisfiable_qrels:{case['id']}:{','.join(missing)}")


def evaluate_fixture(
    fixture_path: Path = DEFAULT_EVAL,
    db_path: Optional[Path] = None,
    embedding_model: str = HASH_EMBEDDING_MODEL,
) -> Dict[str, Any]:
    fixture = json.loads(Path(fixture_path).read_text(encoding="utf-8"))
    validate_fixture(fixture)
    temporary = None
    if db_path is None:
        temporary = tempfile.TemporaryDirectory(prefix="tinker-brain-eval-")
        db_path = Path(temporary.name) / "eval.sqlite3"
    try:
        with TinkerBrainIndex(db_path, embedding_model=embedding_model) as index:
            records = [
                index.parse_inline(
                    source_uri=row["source_uri"],
                    content=row["content"],
                    mime_type=row.get("mime_type", "text/markdown"),
                    title=row.get("title"),
                    metadata=row.get("metadata"),
                )
                for row in fixture["documents"]
            ]
            ingest = index.ingest_records(records)
            generation = index.reindex()
            if not generation["ok"]:
                raise RuntimeError(generation["error"])
            per_query = []
            for case in fixture["queries"]:
                output = index.search(case["query"], limit=max(fixture.get("k_values", [5])))
                ranked = []
                for result in output["results"]:
                    if result["source_uri"] not in ranked:
                        ranked.append(result["source_uri"])
                    for alias in result["source_aliases"]:
                        if alias not in ranked:
                            ranked.append(alias)
                qrels = {str(key): int(value) for key, value in case["qrels"].items()}
                per_query.append(
                    {
                        "id": case["id"],
                        "slice": case.get("slice", "default"),
                        "ranked": ranked,
                        "recall_at_5": recall_at_k(ranked, qrels, 5),
                        "mrr": reciprocal_rank(ranked, qrels),
                        "ndcg_at_5": ndcg_at_k(ranked, qrels, 5),
                    }
                )
            mean = lambda key: sum(row[key] for row in per_query) / len(per_query)
            summary = {
                "queries": len(per_query),
                "recall_at_5": mean("recall_at_5"),
                "mrr": mean("mrr"),
                "ndcg_at_5": mean("ndcg_at_5"),
            }
            slice_names = sorted({row["slice"] for row in per_query})
            slices = {}
            for slice_name in slice_names:
                rows = [row for row in per_query if row["slice"] == slice_name]
                slices[slice_name] = {
                    "queries": len(rows),
                    "recall_at_5": sum(row["recall_at_5"] for row in rows) / len(rows),
                    "mrr": sum(row["mrr"] for row in rows) / len(rows),
                    "ndcg_at_5": sum(row["ndcg_at_5"] for row in rows) / len(rows),
                }
            thresholds = fixture["thresholds"]
            failures = []
            if summary["queries"] < int(thresholds["min_queries"]):
                failures.append("min_queries")
            for metric in ("recall_at_5", "mrr", "ndcg_at_5"):
                if summary[metric] < float(thresholds[f"min_{metric}"]):
                    failures.append(metric)
                per_query_floor = thresholds.get(f"min_per_query_{metric}")
                if per_query_floor is not None:
                    failures.extend(
                        f"{row['id']}:{metric}"
                        for row in per_query
                        if row[metric] < float(per_query_floor)
                    )
            return {
                "ok": not failures,
                "fixture": str(fixture_path),
                "ingest": ingest,
                "generation": generation,
                "summary": summary,
                "slices": slices,
                "thresholds": thresholds,
                "failures": failures,
                "per_query": per_query,
            }
    finally:
        if temporary:
            temporary.cleanup()


def _json_print(payload: Any) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--embedding-model", default=HASH_EMBEDDING_MODEL)
    subparsers = parser.add_subparsers(dest="command", required=True)

    ingest_parser = subparsers.add_parser("ingest")
    ingest_parser.add_argument("paths", nargs="+", type=Path)

    sync_parser = subparsers.add_parser("sync")
    sync_parser.add_argument("root", type=Path)
    sync_parser.add_argument("--no-recursive", action="store_true")

    reindex_parser = subparsers.add_parser("reindex")
    reindex_parser.add_argument("--fail-after-chunks", type=int)

    search_parser = subparsers.add_parser("search")
    search_parser.add_argument("query")
    search_parser.add_argument("--limit", type=int, default=5)
    search_parser.add_argument("--filter", action="append", default=[])

    rollback_parser = subparsers.add_parser("rollback")
    rollback_parser.add_argument("generation_id")

    subparsers.add_parser("status")

    eval_parser = subparsers.add_parser("eval")
    eval_parser.add_argument("--fixture", type=Path, default=DEFAULT_EVAL)
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "eval":
        result = evaluate_fixture(args.fixture, embedding_model=args.embedding_model)
        _json_print(result)
        return 0 if result["ok"] else 1

    with TinkerBrainIndex(args.db, embedding_model=args.embedding_model) as index:
        if args.command == "ingest":
            result = index.ingest_paths(args.paths)
        elif args.command == "sync":
            result = index.sync_root(args.root, recursive=not args.no_recursive)
        elif args.command == "reindex":
            result = index.reindex(fail_after_chunks=args.fail_after_chunks)
        elif args.command == "search":
            filters = {}
            for item in args.filter:
                if "=" not in item:
                    raise ValueError(f"invalid filter, expected key=value: {item}")
                key, value = item.split("=", 1)
                filters[key] = value
            result = index.search(args.query, limit=args.limit, filters=filters or None)
        elif args.command == "rollback":
            result = index.rollback(args.generation_id)
        elif args.command == "status":
            result = index.status()
        else:
            raise AssertionError(args.command)
    _json_print(result)
    return 0 if result.get("ok", True) else 1


if __name__ == "__main__":
    raise SystemExit(main())
