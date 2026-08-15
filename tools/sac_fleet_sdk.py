#!/usr/bin/env python3
"""Python Search-as-Code primitives for Hermes / seed / ali Python harnesses.

Mirrors tools/sac-fleet.js: fan-out, BM25+RRF, dedupe, claim verify, compact.
Offline-first. No network unless SAC_FLEET_OFFLINE is unset and a caller
passes allow_network=True.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import subprocess
from typing import Any, Dict, Iterable, List, Optional, Union

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

INJECTION_PATTERNS = [
    re.compile(r"ignore\s+previous\s+instructions", re.I),
    re.compile(r"system\s+prompt:", re.I),
    re.compile(r"you\s+are\s+now\s+a", re.I),
    re.compile(r"javascript:", re.I),
    re.compile(r"eval\(", re.I),
    re.compile(r"document\.cookie", re.I),
]


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return math.ceil(len(str(text)) / 4)


def tokenize(text: str) -> List[str]:
    return [
        t
        for t in re.split(r"\s+", re.sub(r"[^a-z0-9_./+-]+", " ", str(text or "").lower()))
        if len(t) >= 2
    ]


def sanitize_content(raw_text: str, source_url: str = "") -> Dict[str, Any]:
    cleaned = str(raw_text or "")
    sanitizations = 0
    for pattern in INJECTION_PATTERNS:
        if pattern.search(cleaned):
            cleaned = pattern.sub("[REDACTED_SECURITY_INTERDICTION]", cleaned)
            sanitizations += 1
    before = len(cleaned)
    cleaned = re.sub(r"[\u200b-\u200d\ufeff]", "", cleaned)
    if len(cleaned) != before:
        sanitizations += 1
    return {
        "cleaned": cleaned.strip(),
        "sanitizations": sanitizations,
        "provenanceHash": hashlib.sha256(f"{source_url}:{cleaned}".encode("utf-8")).hexdigest(),
        "sourceUrl": source_url,
    }


def jaccard(text_a: str, text_b: str) -> float:
    set_a = set(tokenize(text_a))
    set_b = set(tokenize(text_b))
    if not set_a and not set_b:
        return 1.0
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / max(1, len(set_a | set_b))


class BM25Reranker:
    def __init__(self, k1: float = 1.5, b: float = 0.75) -> None:
        self.k1 = k1
        self.b = b

    def score(self, query: str, documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        q_tokens = tokenize(query)
        if not q_tokens or not documents:
            return [{**doc, "bm25Score": round(1.0 / (idx + 1), 4)} for idx, doc in enumerate(documents)]
        doc_tokens_list = [
            tokenize(f"{d.get('title', '')} {d.get('snippet', '')} {d.get('content', '')}")
            for d in documents
        ]
        total = len(documents)
        avg_len = sum(len(t) for t in doc_tokens_list) / max(1, total)
        df = {term: sum(1 for toks in doc_tokens_list if term in toks) for term in q_tokens}
        scored = []
        for doc, toks in zip(documents, doc_tokens_list):
            counts: Dict[str, int] = {}
            for t in toks:
                counts[t] = counts.get(t, 0) + 1
            score = 0.0
            for term in q_tokens:
                tf = counts.get(term, 0)
                idf = math.log(1.0 + (total - df[term] + 0.5) / (df[term] + 0.5))
                den = tf + self.k1 * (1.0 - self.b + (self.b * len(toks)) / max(1.0, avg_len))
                score += idf * ((tf * (self.k1 + 1.0)) / max(0.0001, den))
            scored.append({**doc, "bm25Score": round(score, 4)})
        return sorted(scored, key=lambda d: d.get("bm25Score", 0), reverse=True)


def reciprocal_rank_fusion(rankings: List[List[Dict[str, Any]]], k: int = 60) -> List[Dict[str, Any]]:
    scores: Dict[str, float] = {}
    docs: Dict[str, Dict[str, Any]] = {}
    for ranking in rankings:
        for rank, doc in enumerate(ranking):
            key = str(doc.get("id") or doc.get("url") or doc.get("source") or json.dumps(doc, sort_keys=True))
            docs[key] = doc
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank + 1)
    return [
        {**docs[key], "rrfScore": round(score, 6)}
        for key, score in sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    ]


class AgenticSearchSDK:
    def __init__(self, repo_root: str = REPO_ROOT) -> None:
        self.repo_root = repo_root
        self.bm25 = BM25Reranker()
        self.stats = {"searches": 0, "fanouts": 0, "dedupes": 0, "reranks": 0}

    def search(self, query: str, options: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        self.stats["searches"] += 1
        options = options or {}
        limit = int(options.get("limit", 8))
        term = (query.split() or [query])[0]
        try:
            res = subprocess.run(
                ["git", "grep", "-n", "-I", "-i", "-m", "3", "--", term],
                cwd=self.repo_root,
                capture_output=True,
                text=True,
                timeout=4,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            return []
        if res.returncode != 0 or not res.stdout:
            return []
        out = []
        for line in res.stdout.strip().split("\n")[:limit]:
            parts = line.split(":")
            if len(parts) < 3:
                continue
            out.append(
                {
                    "id": f"code:{parts[0]}:{parts[1]}",
                    "type": "code",
                    "source": parts[0],
                    "title": os.path.basename(parts[0]),
                    "snippet": ":".join(parts[2:]).strip()[:300],
                    "score": 0.8,
                }
            )
        return out

    def fanout(self, queries: Iterable[Union[str, Dict[str, Any]]], options: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        self.stats["fanouts"] += 1
        all_hits: List[Dict[str, Any]] = []
        for item in queries:
            text = item if isinstance(item, str) else item.get("query", "")
            for hit in self.search(text, options):
                all_hits.append({**hit, "queryVariant": text})
        return all_hits

    def dedupe(self, results: List[Dict[str, Any]], threshold: float = 0.7) -> List[Dict[str, Any]]:
        self.stats["dedupes"] += 1
        unique: List[Dict[str, Any]] = []
        seen = set()
        for item in results:
            key = item.get("url") or item.get("id") or item.get("title") or ""
            if key and key in seen:
                continue
            if key:
                seen.add(key)
            text = item.get("snippet") or item.get("content") or item.get("title") or ""
            if any(jaccard(text, a.get("snippet") or a.get("title") or "") >= threshold for a in unique):
                continue
            unique.append(item)
        return unique

    def rerank(self, query: str, candidates: List[Dict[str, Any]], limit: int = 8) -> List[Dict[str, Any]]:
        self.stats["reranks"] += 1
        bm25_ranked = self.bm25.score(query, candidates)
        score_ranked = sorted(candidates, key=lambda c: c.get("score", 0), reverse=True)
        return reciprocal_rank_fusion([bm25_ranked, score_ranked])[:limit]

    def compact(self, records: List[Dict[str, Any]], limit: int = 8) -> Dict[str, Any]:
        rows = records[:limit]
        markdown = "\n".join(
            f"- {r.get('title', 'untitled')}: {str(r.get('snippet', ''))[:160]}" for r in rows
        )
        naive = "\n\n".join(f"{r.get('title', '')}\n{r.get('snippet', '')}\n{r.get('content', '')}" for r in records)
        reduction = 1 - (len(markdown) / max(1, len(naive)))
        return {
            "markdown": markdown,
            "tokensIn": estimate_tokens(naive),
            "tokensOut": estimate_tokens(markdown),
            "reduction": round(reduction, 4),
        }

    def verify_claims(self, claims: List[Union[str, Dict[str, Any]]], evidence: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        corpus = " ".join(f"{r.get('title', '')} {r.get('snippet', '')}" for r in evidence).lower()
        out = []
        for claim in claims:
            text = claim if isinstance(claim, str) else claim.get("claim", "")
            tokens = tokenize(text)
            ratio = sum(1 for t in tokens if t in corpus) / max(1, len(tokens))
            status = "VERIFIED" if ratio >= 0.7 else "PARTIAL_EVIDENCE" if ratio >= 0.4 else "UNSUPPORTED"
            out.append({"claim": text, "status": status, "confidence": round(ratio, 3), "isSupported": status == "VERIFIED"})
        return out


sac = AgenticSearchSDK()
