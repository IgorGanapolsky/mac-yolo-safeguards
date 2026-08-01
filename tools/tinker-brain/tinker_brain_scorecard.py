#!/usr/bin/env python3
"""Fail-closed A+ scorecard for the tinker-brain stack.

Grades purpose-fit components (not classic vector RAG — this brain has no Vector DB
by design). Exit 0 only when every required pillar is A+ / 10/10.

  python3 tools/tinker-brain/tinker_brain_scorecard.py
  python3 tools/tinker-brain/tinker_brain_scorecard.py --json
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BRAIN = Path(__file__).resolve().parent
REPO = BRAIN.parents[1]
RECEIPTS = Path.home() / ".hermes" / "receipts" / "tinker-brain"
DEFAULT_OUT = RECEIPTS / "scorecard-latest.json"

# A+ = 10. Anything below fails the card when required=True.
GRADE_ORDER = ("F", "D", "C", "C+", "B-", "B", "B+", "A-", "A", "A+")
SCORE_FOR_GRADE = {
    "F": 0,
    "D": 3,
    "C": 5,
    "C+": 6,
    "B-": 7,
    "B": 8,
    "B+": 8.5,
    "A-": 9,
    "A": 9.5,
    "A+": 10,
}


def _run(cmd: list[str], timeout: float = 90.0) -> dict[str, Any]:
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(REPO),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return {
            "exit": proc.returncode,
            "stdout": proc.stdout or "",
            "stderr": proc.stderr or "",
        }
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"exit": 99, "stdout": "", "stderr": str(exc)}


def _grade_pillar(
    name: str,
    *,
    score_10: float,
    required: bool,
    evidence: dict[str, Any],
    notes: str,
) -> dict[str, Any]:
    if score_10 >= 10:
        grade = "A+"
    elif score_10 >= 9.5:
        grade = "A"
    elif score_10 >= 9:
        grade = "A-"
    elif score_10 >= 8.5:
        grade = "B+"
    elif score_10 >= 8:
        grade = "B"
    elif score_10 >= 7:
        grade = "B-"
    elif score_10 >= 6:
        grade = "C+"
    elif score_10 >= 5:
        grade = "C"
    elif score_10 >= 3:
        grade = "D"
    else:
        grade = "F"
    ok = (not required) or grade == "A+"
    return {
        "pillar": name,
        "score_10": round(score_10, 2),
        "grade": grade,
        "required": required,
        "ok": ok,
        "evidence": evidence,
        "notes": notes,
    }


def grade_store() -> dict[str, Any]:
    sys.path.insert(0, str(BRAIN))
    from tinker_brain_health import check  # noqa: WPS433

    health = check(max_age_days=14)
    score = 10.0
    if not health.get("ok"):
        fails = [f for f in health.get("findings") or [] if f.get("severity") == "fail"]
        # Divergence is fully healable; still fail closed until healed.
        score = 4.0 if any(f.get("check") == "source-divergence" for f in fails) else 6.0
        if any(f.get("check") == "card-missing" for f in fails):
            score = 0.0
        if any(f.get("check") == "stale-card" for f in fails):
            score = min(score, 5.0)
    expert = REPO / "config" / "THUMBGATE_EXPERT_CARD.txt"
    has_legal = "LEGAL_BRAND" in expert.read_text(encoding="utf-8") if expert.is_file() else False
    if not has_legal:
        score = min(score, 8.0)
    return _grade_pillar(
        "store_cards_live_export",
        score_10=score,
        required=True,
        evidence={"health": health, "legal_brand_section": has_legal},
        notes="Text cards + live export (not a Vector DB). A+ requires in-sync snapshot + fresh AS_OF + LEGAL_BRAND.",
    )


def grade_retrieval() -> dict[str, Any]:
    sys.path.insert(0, str(BRAIN))
    from tinker_brain_answer import parse_expert_sections  # noqa: WPS433
    from tinker_brain_router import route  # noqa: WPS433
    from tinker_brain_section_retrieve import select_sections  # noqa: WPS433

    expert = (REPO / "config" / "THUMBGATE_EXPERT_CARD.txt").read_text(encoding="utf-8")
    sections = parse_expert_sections(expert)
    cases = [
        ("Should we rename ThumbGate away from Hermes trademark risk?", "LEGAL_BRAND"),
        ("How should we price Continuity?", "PRICING"),
        ("What is our marketing plan?", "CHANNELS"),
        ("How do we sell ThumbGate.app?", "SALES_MOTION"),
        ("positioning vs Cursor background agents", "POSITIONING"),
    ]
    hits = 0
    details = []
    for q, expect in cases:
        # Production answer path passes router flags into select_sections — grade that.
        flags = route(q).get("flags") or {}
        sel = select_sections(q, sections, flags)
        ok = expect in sel["sections"]
        hits += int(ok)
        details.append(
            {
                "q": q,
                "expect": expect,
                "got": sel["sections"][:6],
                "method": sel.get("method"),
                "ok": ok,
            }
        )
    ratio = hits / len(cases)
    score = 10.0 if ratio == 1.0 else (9.0 if ratio >= 0.8 else 6.0 * ratio)
    return _grade_pillar(
        "section_retrieval_bm25",
        score_10=score,
        required=True,
        evidence={"hits": hits, "total": len(cases), "cases": details, "method": "bm25_lite_plus_intent_prior"},
        notes="In-card BM25-lite section ranker (no vector DB). A+ = all golden section targets hit.",
    )


def grade_orchestration() -> dict[str, Any]:
    sys.path.insert(0, str(BRAIN))
    from tinker_brain_router import route  # noqa: WPS433

    checks = [
        ("How do we sell ThumbGate.app?", "thumbgate_gtm"),
        ("why zero dollars from thumbgate sales?", "cash_truth"),
        ("make money", "next_money"),
        ("Give the exact system scores.", "system_scores"),
        ("Improve Obsidian vault sync with Dropbox and TensorFlow", "off_scope_refuse"),
        ("Should ThumbGate rename given Hermes trademark exposure?", "thumbgate_gtm"),
    ]
    hits = 0
    conf_ok = 0
    rows = []
    for q, expect in checks:
        r = route(q)
        ok = r.get("primary") == expect
        hits += int(ok)
        conf = r.get("confidence")
        if isinstance(conf, (int, float)) and 0 < conf <= 1:
            conf_ok += 1
        rows.append({"q": q, "expect": expect, "got": r.get("primary"), "confidence": conf, "ok": ok})
    route_score = 10.0 * hits / len(checks)
    conf_score = 10.0 if conf_ok == len(checks) else 7.0
    score = min(route_score, conf_score)
    # Contract + coverage modules must exist
    for mod in ("tinker_response_contract.py", "tinker_brain_coverage.py", "tinker_brain_answer.py"):
        if not (BRAIN / mod).is_file():
            score = min(score, 3.0)
    return _grade_pillar(
        "orchestration_router_contract",
        score_10=score,
        required=True,
        evidence={"route_hits": hits, "route_total": len(checks), "confidence_rows": conf_ok, "rows": rows},
        notes="Rules router + confidence + contract + coverage. A+ = all route goldens + confidence field.",
    )


def grade_models() -> dict[str, Any]:
    """Default path must be model-free; optional Ollama is paraphrase-only."""
    answer_src = (BRAIN / "tinker_brain_answer.py").read_text(encoding="utf-8")
    default_det = "deterministic_card" in answer_src and "No Ollama" in answer_src
    score = 10.0 if default_det else 5.0
    return _grade_pillar(
        "models_fail_closed",
        score_10=score,
        required=True,
        evidence={
            "default_deterministic": default_det,
            "vector_db": None,
            "embedding_model": None,
            "optional_paraphrase": "TINKER_BRAIN_USE_OLLAMA=1",
        },
        notes="A+ = no embeddings on money path; deterministic default; optional Ollama only.",
    )


def grade_eval() -> dict[str, Any]:
    run = _run([sys.executable, str(BRAIN / "tinker_brain_eval.py")])
    # Parse "N/M passed"
    passed = failed = total = 0
    for line in (run["stdout"] or "").splitlines():
        if "tinker-brain eval:" in line and "passed" in line:
            # e.g. tinker-brain eval: 42/42 passed
            try:
                chunk = line.split("eval:")[1].strip().split()[0]
                passed_s, total_s = chunk.split("/")
                passed = int(passed_s)
                total = int(total_s)
                failed = total - passed
            except (IndexError, ValueError):
                pass
    unit = _run([sys.executable, str(REPO / "tests" / "test-tinker-brain.py")])
    unit_ok = unit["exit"] == 0
    if total <= 0:
        score = 0.0
    elif failed == 0 and unit_ok and total >= 48:
        score = 10.0
    elif failed == 0 and unit_ok and total >= 42:
        score = 9.5
    elif failed == 0:
        score = 9.0 if unit_ok else 8.0
    else:
        score = max(0.0, 10.0 * passed / total - 2.0)
    return _grade_pillar(
        "eval_golden_suite",
        score_10=score,
        required=True,
        evidence={
            "eval_exit": run["exit"],
            "passed": passed,
            "failed": failed,
            "total": total,
            "unit_exit": unit["exit"],
            "unit_ok": unit_ok,
        },
        notes="A+ = unit green + eval ≥48/48 (expanded goldens) zero failures.",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--heal-first",
        action="store_true",
        help="Run health --heal before grading store pillar.",
    )
    args = parser.parse_args()

    if args.heal_first:
        _run([sys.executable, str(BRAIN / "tinker_brain_health.py"), "--heal"], timeout=90)

    pillars = [
        grade_store(),
        grade_retrieval(),
        grade_orchestration(),
        grade_models(),
        grade_eval(),
    ]
    required_ok = all(p["ok"] for p in pillars if p["required"])
    avg = sum(p["score_10"] for p in pillars) / max(len(pillars), 1)
    overall_grade = "A+" if required_ok and avg >= 10 else (
        "A" if avg >= 9.5 else ("A-" if avg >= 9 else "B+")
    )
    if not required_ok:
        overall_grade = min(
            (p["grade"] for p in pillars if not p["ok"]),
            key=lambda g: GRADE_ORDER.index(g) if g in GRADE_ORDER else 0,
            default="F",
        )

    receipt = {
        "schema_version": "tinker-brain-scorecard/1",
        "ran_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "design": {
            "vector_db": None,
            "embedding_models": None,
            "orchestration": "export → rules_router(+confidence) → BM25_section_retrieve → deterministic_card → contract → coverage",
            "optional_model": "qwen3-hermes-tinker-toolfix:q4 paraphrase-only when TINKER_BRAIN_USE_OLLAMA=1",
        },
        "pillars": pillars,
        "overall": {
            "score_10": round(avg, 2),
            "grade": overall_grade if required_ok else overall_grade,
            "a_plus": required_ok and all(p["grade"] == "A+" for p in pillars),
            "required_ok": required_ok,
        },
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if args.json:
        print(json.dumps(receipt, indent=2, sort_keys=True))
    else:
        print("tinker-brain scorecard")
        print(f"  design: {receipt['design']['orchestration']}")
        for p in pillars:
            mark = "PASS" if p["ok"] else "FAIL"
            print(f"  [{mark}] {p['pillar']}: {p['grade']} ({p['score_10']}/10) — {p['notes'][:80]}")
        o = receipt["overall"]
        print(
            f"  overall: {o['grade']} ({o['score_10']}/10) "
            f"A+={o['a_plus']} required_ok={o['required_ok']}"
        )
        print(f"  receipt: {args.out}")
    return 0 if receipt["overall"]["a_plus"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
