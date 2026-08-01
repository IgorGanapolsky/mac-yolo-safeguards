#!/usr/bin/env python3
"""Section-level lexical retrieval over the expert card (BM25-lite).

tinker-brain is deliberately not a vector RAG system: cash truth stays on the
deterministic ANSWER_CARD. GTM expertise lives in a small multi-section text card.
This module ranks those sections against the question so answers surface the
right expert slices when regex intent flags alone under-select (or over-select).

No embeddings. No external vector DB. Pure in-process BM25-lite + intent priors.
"""

from __future__ import annotations

import math
import re
from typing import Any

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9.\-]{1,}")
_STOP = frozenset(
    """
    a an and are as at be been but by can could did do does for from get give go
    had has have how i if in into is it its just like make made may me more most
    must my no not now of on or our out should so than that the their them then
    there these they this to too us use was we were what when where which who why
    will with would you your about after all also any because before between both
    each many much need only own same some such take through under until up very
    want way well
    """.split()
)

# Intent flags → soft prior boost on named sections (added to BM25 rank score).
_FLAG_SECTION_PRIOR: dict[str, dict[str, float]] = {
    "wants_gtm_positioning": {"POSITIONING": 2.5, "BUYER": 1.5, "LEGAL_BRAND": 1.0},
    "wants_gtm_pricing": {"PRICING": 2.5, "PRODUCT": 1.2, "POSITIONING": 0.8},
    "wants_gtm_marketing": {"CHANNELS": 2.5, "PROMO_RULES": 2.0, "SALES_MOTION": 0.6},
    "wants_gtm_sales": {"SALES_MOTION": 2.5, "BUYER": 1.5, "PRODUCT": 0.8},
    "wants_legal_brand": {"LEGAL_BRAND": 3.0, "POSITIONING": 1.0, "KNOWN_GAPS": 0.8},
    "wants_competitive": {"POSITIONING": 2.0, "PRICING": 1.0, "LEGAL_BRAND": 0.5},
}

# Always keep honesty rails near the bottom of every GTM answer.
_ALWAYS_TAIL = ("KNOWN_GAPS",)

# Sections that must never be omitted when flags request them (hard include).
_FLAG_HARD_INCLUDE: dict[str, tuple[str, ...]] = {
    "wants_gtm_positioning": ("POSITIONING",),
    "wants_gtm_pricing": ("PRICING",),
    "wants_gtm_marketing": ("CHANNELS", "PROMO_RULES"),
    "wants_gtm_sales": ("SALES_MOTION",),
    "wants_legal_brand": ("LEGAL_BRAND",),
}


def tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN_RE.findall((text or "").lower()) if t not in _STOP and len(t) > 1]


def _section_docs(sections: dict[str, list[str]]) -> dict[str, list[str]]:
    docs: dict[str, list[str]] = {}
    for name, lines in sections.items():
        # Name tokens help "pricing" hit [PRICING] even when body is sparse.
        blob = name.lower().replace("_", " ") + " " + " ".join(lines)
        docs[name] = tokenize(blob)
    return docs


def bm25_scores(
    query_tokens: list[str],
    docs: dict[str, list[str]],
    *,
    k1: float = 1.4,
    b: float = 0.75,
) -> dict[str, float]:
    """Classic BM25 over a tiny in-memory corpus (section name → tokens)."""
    if not docs or not query_tokens:
        return {name: 0.0 for name in docs}

    n = len(docs)
    avgdl = sum(len(toks) for toks in docs.values()) / max(n, 1)
    df: dict[str, int] = {}
    for toks in docs.values():
        for term in set(toks):
            df[term] = df.get(term, 0) + 1

    scores: dict[str, float] = {}
    for name, toks in docs.items():
        tf: dict[str, int] = {}
        for t in toks:
            tf[t] = tf.get(t, 0) + 1
        dl = len(toks) or 1
        score = 0.0
        for q in query_tokens:
            if q not in tf:
                # cheap stem-ish: prefix match for rename/renaming, trademark/s
                hit = next((t for t in tf if q in t or t in q), None)
                if not hit:
                    continue
                f = tf[hit]
                doc_freq = df.get(hit, 1)
            else:
                f = tf[q]
                doc_freq = df.get(q, 1)
            idf = math.log(1.0 + (n - doc_freq + 0.5) / (doc_freq + 0.5))
            denom = f + k1 * (1.0 - b + b * dl / avgdl)
            score += idf * (f * (k1 + 1.0) / denom)
        scores[name] = score
    return scores


def select_sections(
    question: str,
    sections: dict[str, list[str]],
    flags: dict[str, Any] | None = None,
    *,
    top_k: int = 4,
    min_score: float = 0.15,
) -> dict[str, Any]:
    """Return ordered section names + per-section scores for the answer path.

    Fusion:
      final = BM25(question, section) + sum(flag priors)
      hard-includes from flags always win a slot even if BM25 is cold
      KNOWN_GAPS always tails (honesty)
    """
    flags = flags or {}
    docs = _section_docs(sections)
    q_tokens = tokenize(question)
    raw = bm25_scores(q_tokens, docs)

    boosted = dict(raw)
    for flag, priors in _FLAG_SECTION_PRIOR.items():
        if flags.get(flag):
            for sec, boost in priors.items():
                if sec in boosted:
                    boosted[sec] = boosted.get(sec, 0.0) + boost

    hard: list[str] = []
    for flag, names in _FLAG_HARD_INCLUDE.items():
        if flags.get(flag):
            for n in names:
                if n in sections and n not in hard:
                    hard.append(n)

    # Rank remaining by boosted score.
    ranked = sorted(
        ((n, s) for n, s in boosted.items() if n in sections),
        key=lambda kv: (-kv[1], kv[0]),
    )

    ordered: list[str] = []
    for n in hard:
        if n not in ordered:
            ordered.append(n)

    for name, score in ranked:
        if name in ordered:
            continue
        if score < min_score and ordered:
            continue
        ordered.append(name)
        if len(ordered) >= top_k:
            break

    # Fallback if everything scored zero and no hard includes: product defaults.
    if not ordered:
        for fallback in ("PRODUCT", "POSITIONING", "SALES_MOTION"):
            if fallback in sections:
                ordered.append(fallback)
        ordered = ordered[:top_k]

    for tail in _ALWAYS_TAIL:
        if tail in sections and tail not in ordered:
            # Cap body sections; gaps always as honesty rail (not counted in top_k).
            ordered.append(tail)

    return {
        "schema_version": "tinker-brain-section-retrieve/1",
        "method": "bm25_lite_plus_intent_prior",
        "query_tokens": q_tokens,
        "scores": {n: round(boosted.get(n, 0.0), 4) for n in ordered},
        "all_scores": {n: round(s, 4) for n, s in ranked[:12]},
        "sections": ordered,
        "hard_includes": hard,
        "top_k": top_k,
    }


if __name__ == "__main__":
    import json
    import sys
    from pathlib import Path

    # Smoke: rank against repo expert card.
    repo = Path(__file__).resolve().parents[2]
    text = (repo / "config" / "THUMBGATE_EXPERT_CARD.txt").read_text(encoding="utf-8")
    sections: dict[str, list[str]] = {}
    current = None
    for raw in text.splitlines():
        line = raw.rstrip()
        if line.startswith("[") and line.endswith("]"):
            current = line[1:-1].strip().upper()
            sections[current] = []
        elif current and line.strip():
            sections[current].append(line.strip())
    q = sys.argv[1] if len(sys.argv) > 1 else "Should we rename away from Hermes trademark risk?"
    print(json.dumps(select_sections(q, sections, {"wants_legal_brand": True}), indent=2))
