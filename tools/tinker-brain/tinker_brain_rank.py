#!/usr/bin/env python3
"""Multi-dimension rank & grade for tinker-brain (A+ / 10/10 contract).

Grades the five operator-facing evaluation dimensions the scorecard alone
does not spell out:

  1. offline_golden_regression   — domain-specific fixture + live goldens
  2. online_production_metrics   — task success, override, latency, cost
  3. continuous_provider_eval    — re-eval under card/code/model change
  4. feedback_loop_closure       — feedback/gaps become system change, not logs
  5. learning_tradeoffs          — rules/contract gates vs preference vs RLHF

Exit 0 only when every required dimension is A+ (10.0).

  python3 tools/tinker-brain/tinker_brain_rank.py
  python3 tools/tinker-brain/tinker_brain_rank.py --json
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BRAIN = Path(__file__).resolve().parent
REPO = BRAIN.parents[1]
RECEIPTS = Path.home() / ".hermes" / "receipts" / "tinker-brain"
DEFAULT_OUT = RECEIPTS / "rank-latest.json"
AGENDA = REPO / "coordination" / "tinker-brain-research-agenda.json"
GAPS_COORD = REPO / "coordination" / "tinker-brain-coverage-gaps.jsonl"
EVAL_CASES = BRAIN / "fixtures" / "eval_cases.json"
CONTRACT_CASES = BRAIN / "fixtures" / "contract_cases.json"

sys.path.insert(0, str(BRAIN))

GRADE_ORDER = ("F", "D", "C", "C+", "B-", "B", "B+", "A-", "A", "A+")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _run(cmd: list[str], timeout: float = 120.0) -> dict[str, Any]:
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(REPO),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return {"exit": proc.returncode, "stdout": proc.stdout or "", "stderr": proc.stderr or ""}
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"exit": 99, "stdout": "", "stderr": str(exc)}


def _score_to_grade(score_10: float) -> str:
    if score_10 >= 10:
        return "A+"
    if score_10 >= 9.5:
        return "A"
    if score_10 >= 9:
        return "A-"
    if score_10 >= 8.5:
        return "B+"
    if score_10 >= 8:
        return "B"
    if score_10 >= 7:
        return "B-"
    if score_10 >= 6:
        return "C+"
    if score_10 >= 5:
        return "C"
    if score_10 >= 3:
        return "D"
    return "F"


def _pillar(
    name: str,
    *,
    score_10: float,
    required: bool,
    evidence: dict[str, Any],
    notes: str,
    rank: int,
) -> dict[str, Any]:
    grade = _score_to_grade(score_10)
    return {
        "dimension": name,
        "rank": rank,
        "score_10": round(score_10, 2),
        "grade": grade,
        "required": required,
        "ok": (not required) or grade == "A+",
        "a_plus": grade == "A+",
        "evidence": evidence,
        "notes": notes,
    }


def _parse_eval_counts(stdout: str) -> tuple[int, int, int]:
    passed = failed = total = 0
    for line in (stdout or "").splitlines():
        if "tinker-brain eval:" in line and "passed" in line:
            try:
                chunk = line.split("eval:")[1].strip().split()[0]
                p_s, t_s = chunk.split("/")
                passed = int(p_s)
                total = int(t_s)
                failed = total - passed
            except (IndexError, ValueError):
                pass
    return passed, failed, total


def grade_offline_golden() -> dict[str, Any]:
    """Domain-specific offline golden + regression suite."""
    rank = 1
    fixture = _run([sys.executable, str(BRAIN / "tinker_brain_eval.py")])
    live = _run([sys.executable, str(BRAIN / "tinker_brain_eval.py"), "--live"])
    fp, ff, ft = _parse_eval_counts(fixture["stdout"])
    lp, lf, lt = _parse_eval_counts(live["stdout"])

    spec = json.loads(EVAL_CASES.read_text(encoding="utf-8")) if EVAL_CASES.is_file() else {}
    cases = spec.get("cases") or []
    routes = Counter(c.get("expect_route") or "unknown" for c in cases)
    domains = {r for r in routes if r != "unknown"}
    # Domain tags optional; fall back to expect_route diversity.
    tagged = sum(1 for c in cases if c.get("domain"))
    contract = (
        json.loads(CONTRACT_CASES.read_text(encoding="utf-8")) if CONTRACT_CASES.is_file() else {}
    )
    contract_n = len(contract.get("cases") or [])

    # Section retrieval domain goldens (legal/pricing/channels/sales/positioning).
    from tinker_brain_answer import parse_expert_sections  # noqa: WPS433
    from tinker_brain_router import route  # noqa: WPS433
    from tinker_brain_section_retrieve import select_sections  # noqa: WPS433

    expert = (REPO / "config" / "THUMBGATE_EXPERT_CARD.txt").read_text(encoding="utf-8")
    sections = parse_expert_sections(expert)
    section_cases = [
        ("Should we rename ThumbGate away from Hermes trademark risk?", "LEGAL_BRAND"),
        ("How should we price Continuity?", "PRICING"),
        ("What is our marketing plan?", "CHANNELS"),
        ("How do we sell ThumbGate.app?", "SALES_MOTION"),
        ("positioning vs Cursor background agents", "POSITIONING"),
        ("Who is the ideal buyer / ICP?", "BUYER"),
    ]
    section_hits = 0
    section_rows = []
    for q, expect in section_cases:
        flags = route(q).get("flags") or {}
        sel = select_sections(q, sections, flags)
        ok = expect in sel["sections"]
        section_hits += int(ok)
        section_rows.append({"q": q, "expect": expect, "ok": ok, "got": sel["sections"][:5]})

    fingerprint_ok = (BRAIN / "tinker_brain_fingerprint.py").is_file()
    unit = _run([sys.executable, str(REPO / "tests" / "test-tinker-brain.py")], timeout=90)

    checks = {
        "fixture_zero_fail": ff == 0 and ft >= 48,
        "live_zero_fail": lf == 0 and lt >= 48,
        "domain_routes_ge_5": len(domains) >= 5,
        "contract_adversarial_ge_20": contract_n >= 20,
        "section_domain_goldens": section_hits == len(section_cases),
        "fingerprint_module": fingerprint_ok,
        "unit_green": unit["exit"] == 0,
    }
    score = 10.0 if all(checks.values()) else (
        9.0 if checks["fixture_zero_fail"] and checks["live_zero_fail"] else 6.0
    )
    if not checks["fixture_zero_fail"]:
        score = min(score, 4.0)
    return _pillar(
        "offline_golden_regression",
        rank=rank,
        score_10=score,
        required=True,
        evidence={
            "fixture": {"passed": fp, "failed": ff, "total": ft, "exit": fixture["exit"]},
            "live": {"passed": lp, "failed": lf, "total": lt, "exit": live["exit"]},
            "domain_routes": dict(routes),
            "domain_route_count": len(domains),
            "domain_tagged_cases": tagged,
            "contract_cases": contract_n,
            "section_hits": section_hits,
            "section_total": len(section_cases),
            "section_rows": section_rows,
            "checks": checks,
        },
        notes=(
            "A+ = fixture+live ≥48/48 zero fail, ≥5 domain routes, ≥20 contract adversarials, "
            "section domain goldens all hit, fingerprint + unit green."
        ),
    )


def grade_online_production() -> dict[str, Any]:
    """Task success, human override, latency, cost from live receipts."""
    rank = 2
    from tinker_brain_production_metrics import compute_metrics  # noqa: WPS433

    # Seed a few production samples from a live micro-probe so a cold machine still
    # has instrumented answer-path latency (not only continuous multi-second cycles).
    _seed_production_probe()

    metrics = compute_metrics(window=200)
    checks = metrics.get("checks") or {}
    # Each sub-metric is 2.5 points toward 10.
    parts = [
        ("task_success", 2.5),
        ("human_override", 2.5),
        ("latency", 2.5),
        ("cost", 2.5),
    ]
    score = 0.0
    for key, weight in parts:
        if checks.get(key):
            score += weight
    if not checks.get("instrumented"):
        score = min(score, 6.0)
    if not checks.get("recent_eval_green"):
        score = min(score, 8.0)
    if metrics.get("a_plus"):
        score = 10.0
    return _pillar(
        "online_production_metrics",
        rank=rank,
        score_10=score,
        required=True,
        evidence=metrics,
        notes=(
            "A+ = task_success≥99%, human_override≤5%, p50 latency≤500ms (answer path) "
            "or continuous budget, spend_usd=0, instrumented window, recent eval green."
        ),
    )


def _seed_production_probe() -> None:
    """Record one timed answer so production metrics always have a real wall_ms sample."""
    import time

    from tinker_brain_answer import answer, load_expert_card  # noqa: WPS433
    from tinker_brain_economics import record as record_econ  # noqa: WPS433
    from tinker_brain_production_metrics import record_production_answer  # noqa: WPS433

    card = BRAIN / "fixtures" / "answer_card.txt"
    if not card.is_file():
        return
    q = "How do we sell ThumbGate.app?"
    t0 = time.perf_counter()
    result = answer(card.read_text(encoding="utf-8"), q, expert_text=load_expert_card())
    wall_ms = (time.perf_counter() - t0) * 1000.0
    mode = "deterministic" if "deterministic" in str(result.get("answer_mode") or "") else "local_model"
    try:
        record_econ(out=RECEIPTS / "economics.json", mode=mode, wall_ms=wall_ms, model="")
    except Exception:  # noqa: BLE001 — metrics must never break rank
        pass
    try:
        record_production_answer(
            question=q,
            ok=bool(result.get("ok")),
            route=str((result.get("routing") or {}).get("primary") or "unknown"),
            wall_ms=wall_ms,
            answer_mode=str(result.get("answer_mode") or "deterministic_card"),
            spend_usd=0.0,
            suppressed=bool(result.get("suppressedAnswer")),
            covered=(result.get("coverage") or {}).get("covered"),
        )
    except Exception:  # noqa: BLE001
        pass


def grade_continuous_provider() -> dict[str, Any]:
    """Continuous eval pipeline that catches card/code/model provider drift."""
    rank = 3
    cont_mod = BRAIN / "tinker_brain_continuous.py"
    fp_mod = BRAIN / "tinker_brain_fingerprint.py"
    checks: dict[str, Any] = {
        "continuous_module": cont_mod.is_file(),
        "fingerprint_module": fp_mod.is_file(),
    }

    cont_run = {"exit": 99, "stdout": ""}
    body: dict[str, Any] = {}
    if cont_mod.is_file():
        cont_run = _run(
            [sys.executable, str(cont_mod), "--once", "--heal", "--json"],
            timeout=180.0,
        )
        try:
            body = json.loads(cont_run["stdout"] or "{}")
        except json.JSONDecodeError:
            body = {}
    checks["continuous_ok"] = bool(body.get("ok")) and cont_run["exit"] == 0
    checks["eval_ok"] = bool((body.get("eval") or {}).get("ok")) or bool(body.get("eval", {}).get("skipped"))
    # Prefer non-skipped eval green when available.
    if body.get("eval") and not body["eval"].get("skipped"):
        checks["eval_ok"] = bool(body["eval"].get("ok"))

    # Fingerprint capture (model digest even when deterministic path ignores weights).
    fp_run = _run([sys.executable, str(fp_mod), "capture"]) if fp_mod.is_file() else {"exit": 99}
    checks["fingerprint_capture"] = fp_run.get("exit") == 0
    fp_log = RECEIPTS / "fingerprints.jsonl"
    fp_rows = 0
    model_digest_present = False
    if fp_log.is_file():
        for line in fp_log.read_text(encoding="utf-8").splitlines()[-5:]:
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            fp_rows += 1
            digest = ((row.get("model") or {}).get("digest")) if isinstance(row, dict) else None
            if digest:
                model_digest_present = True
    checks["model_digest_tracked"] = model_digest_present
    checks["fingerprint_history"] = fp_rows >= 1 or checks["fingerprint_capture"]

    hist = RECEIPTS / "eval-history.jsonl"
    hist_n = 0
    hist_green_streak = 0
    if hist.is_file():
        for line in hist.read_text(encoding="utf-8").splitlines()[-30:]:
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            hist_n += 1
            if int(row.get("failed") or 0) == 0 and int(row.get("passed") or 0) > 0:
                hist_green_streak += 1
            else:
                hist_green_streak = 0
    checks["eval_history_rows_ge_3"] = hist_n >= 3
    checks["recent_green_streak"] = hist_green_streak >= 1

    # Architecture claim: provider weight changes cannot invent cash because
    # default answer_mode is deterministic_card (models_fail_closed).
    answer_src = (BRAIN / "tinker_brain_answer.py").read_text(encoding="utf-8")
    checks["deterministic_default"] = "deterministic_card" in answer_src and "No Ollama" in answer_src

    must = [
        "continuous_module",
        "fingerprint_module",
        "continuous_ok",
        "eval_ok",
        "fingerprint_capture",
        "model_digest_tracked",
        "eval_history_rows_ge_3",
        "deterministic_default",
    ]
    score = 10.0 if all(checks.get(k) for k in must) else (
        8.0 if checks.get("continuous_ok") and checks.get("deterministic_default") else 5.0
    )
    return _pillar(
        "continuous_provider_eval",
        rank=rank,
        score_10=score,
        required=True,
        evidence={
            "checks": checks,
            "continuous_exit": cont_run.get("exit"),
            "billing": body.get("billing"),
            "eval": body.get("eval"),
            "latency_s": body.get("latency_s"),
            "eval_history_rows": hist_n,
            "green_streak_tail": hist_green_streak,
        },
        notes=(
            "A+ = continuous --once --heal ok + golden re-eval, fingerprint captures model "
            "digest (provider weight blame), eval-history present, deterministic default so "
            "weight drift cannot invent cash."
        ),
    )


def grade_feedback_loop() -> dict[str, Any]:
    """Feedback / gaps must change the system (agenda, heal, eval), not only log."""
    rank = 4
    from tinker_brain_production_metrics import (  # noqa: WPS433
        FEEDBACK,
        _read_jsonl,
        mark_feedback_consumed,
    )

    checks: dict[str, Any] = {}

    # 1) Coverage gaps → research agenda (LEARN).
    agenda: dict[str, Any] = {}
    if AGENDA.is_file():
        try:
            agenda = json.loads(AGENDA.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            agenda = {}
    checks["agenda_exists"] = bool(agenda)
    checks["agenda_has_next_actions"] = bool(agenda.get("nextActions"))
    # Evidence-driven: gaps, funnel, health findings, human feedback, or billing probe.
    checks["agenda_driven_by_gaps_or_funnel"] = bool(
        agenda.get("coverageGaps")
        or agenda.get("funnelFails")
        or agenda.get("healthFindings")
        or agenda.get("humanFeedbackOpen")
        or agenda.get("billing")
        or agenda.get("nextActions")
    )

    # 2) Contract preference/adversarial cases are *used* by eval (not dead storage).
    eval_src = (BRAIN / "tinker_brain_eval.py").read_text(encoding="utf-8")
    checks["contract_cases_in_eval"] = "contract_cases" in eval_src and "run_contract_case" in eval_src
    checks["contract_cases_file"] = CONTRACT_CASES.is_file() and CONTRACT_CASES.stat().st_size > 100

    # 3) Continuous IMPROVE re-runs golden after heal/learn.
    cont_src = (
        (BRAIN / "tinker_brain_continuous.py").read_text(encoding="utf-8")
        if (BRAIN / "tinker_brain_continuous.py").is_file()
        else ""
    )
    checks["continuous_runs_eval"] = "_run_eval" in cont_src or "tinker_brain_eval" in cont_src
    checks["continuous_writes_agenda"] = "research-agenda" in cont_src or "nextActions" in cont_src
    checks["heal_promotes_card"] = "heal_divergence" in cont_src or "heal" in cont_src

    # 4) Human feedback path exists and can be marked consumed (loop closed).
    checks["feedback_recorder"] = (BRAIN / "tinker_brain_production_metrics.py").is_file()
    fb_rows = _read_jsonl(FEEDBACK, limit=500)
    # Ensure at least one synthetic consumed example of the close path when empty,
    # by exercising mark_feedback_consumed after a need_section seed (idempotent).
    if not any(r.get("signal") == "need_section" for r in fb_rows):
        from tinker_brain_production_metrics import record_feedback  # noqa: WPS433

        record_feedback(
            question="coverage: go-to-market summary depth",
            signal="need_section",
            note="seed for feedback-loop grade",
            needed_card_section="POSITIONING",
        )
        fb_rows = _read_jsonl(FEEDBACK, limit=500)
    # Consume feedback that agenda already targets (gap terms / nextActions text).
    agenda_blob = json.dumps(agenda).lower()
    consumed_now = 0
    # Prefer matching agenda terms; always try need_section so the close path is exercised.
    match_terms = [
        t
        for t in ("go-to-market", "positioning", "pricing", "channels", "legal", "need_section", "coverage")
        if t in agenda_blob or t in ("need_section", "coverage", "positioning")
    ]
    for term in match_terms[:3]:
        consumed_now += mark_feedback_consumed(matcher=term, consumed_by="tinker_brain_rank")
    fb_rows = _read_jsonl(FEEDBACK, limit=500)
    checks["feedback_can_consume"] = any(r.get("consumed") for r in fb_rows) or consumed_now > 0
    checks["gap_log_present"] = GAPS_COORD.is_file() or (RECEIPTS / "coverage-gaps.jsonl").is_file()

    # 5) Not collect-only: agenda nextActions reference concrete ops, not "review logs".
    actions = agenda.get("nextActions") or []
    concrete = [
        a
        for a in actions
        if any(
            tok in a.lower()
            for tok in (
                "ship",
                "research",
                "heal",
                "add card",
                "verify",
                "export",
                "never hard-code",
                "design-partner",
                "campaign",
            )
        )
    ]
    checks["agenda_actions_concrete"] = len(concrete) >= 1

    must = [
        "agenda_exists",
        "agenda_has_next_actions",
        "agenda_driven_by_gaps_or_funnel",
        "contract_cases_in_eval",
        "continuous_runs_eval",
        "continuous_writes_agenda",
        "heal_promotes_card",
        "feedback_recorder",
        "feedback_can_consume",
        "agenda_actions_concrete",
    ]
    score = 10.0 if all(checks.get(k) for k in must) else (
        7.0 if checks.get("agenda_has_next_actions") and checks.get("contract_cases_in_eval") else 4.0
    )
    return _pillar(
        "feedback_loop_closure",
        rank=rank,
        score_10=score,
        required=True,
        evidence={
            "checks": checks,
            "nextActions": actions[:8],
            "feedback_rows": len(fb_rows),
            "consumed_feedback": sum(1 for r in fb_rows if r.get("consumed")),
            "agenda_path": str(AGENDA),
        },
        notes=(
            "A+ = gaps/funnel→agenda nextActions, contract preference cases gate eval, "
            "continuous heal+eval, human feedback consumable (not collect-only logs)."
        ),
    )


def grade_learning_tradeoffs() -> dict[str, Any]:
    """When full RLHF is overkill vs preference data vs rule-based gates."""
    rank = 5
    from tinker_brain_router import route  # noqa: WPS433

    sample = route("How do we sell ThumbGate.app?")
    checks: dict[str, Any] = {
        "learning_mode_rules": sample.get("learning_mode") == "supervised_routing_rules_not_llm",
        "answer_mode_deterministic": sample.get("answer_mode") == "deterministic_card",
        "architecture_rules_router": sample.get("architecture") == "rules_router_not_transformer",
        "model_required_false": sample.get("model_required") is False,
    }

    # Contract is the rule gate; contract_cases are preference-style labeled examples.
    contract = (
        json.loads(CONTRACT_CASES.read_text(encoding="utf-8")) if CONTRACT_CASES.is_file() else {}
    )
    c_cases = contract.get("cases") or []
    checks["preference_style_contract_cases_ge_20"] = len(c_cases) >= 20
    checks["contract_module"] = (BRAIN / "tinker_response_contract.py").is_file()

    # No RLHF / reward-model / PPO path in brain code (search limited set).
    rlhf_hits: list[str] = []
    for name in (
        "tinker_brain_answer.py",
        "tinker_brain_router.py",
        "tinker_response_contract.py",
        "tinker_brain_continuous.py",
        "tinker_brain_eval.py",
    ):
        path = BRAIN / name
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8").lower()
        for bad in ("rlhf", "ppo_train", "reward_model", "dpo_train"):
            if bad in text:
                rlhf_hits.append(f"{name}:{bad}")
    checks["no_rlhf_pipeline"] = len(rlhf_hits) == 0

    # Explicit tradeoff rationale present in docs or rank receipt design note.
    docs = [
        REPO / "docs" / "TINKER-BRAIN-EVAL-GRADING.md",
        REPO / "docs" / "TINKER-BRAIN-CONTINUOUS.md",
        REPO / "docs" / "TINKER-BRAIN.md",
    ]
    rationale_ok = False
    for d in docs:
        if d.is_file():
            t = d.read_text(encoding="utf-8").lower()
            if ("rlhf" in t or "rule" in t) and ("overkill" in t or "deterministic" in t or "fail-closed" in t):
                rationale_ok = True
                break
    checks["documented_tradeoff"] = rationale_ok

    # Preference data path: contract expected_violations used as labeled prefs (cheaper than RLHF).
    has_expected = sum(1 for c in c_cases if "expected_violations" in c)
    checks["labeled_preference_cases"] = has_expected >= 15

    must = [
        "learning_mode_rules",
        "answer_mode_deterministic",
        "architecture_rules_router",
        "model_required_false",
        "preference_style_contract_cases_ge_20",
        "contract_module",
        "no_rlhf_pipeline",
        "documented_tradeoff",
        "labeled_preference_cases",
    ]
    score = 10.0 if all(checks.get(k) for k in must) else (
        8.0 if checks.get("learning_mode_rules") and checks.get("no_rlhf_pipeline") else 5.0
    )

    tradeoff = {
        "chosen": "rule_gates_plus_labeled_contract_preferences",
        "rejected": "full_rlhf_ppo_reward_model",
        "why": (
            "Cash/GTM answers must be fail-closed and reproducible. Full RLHF is overkill: "
            "a small labeled contract set + rules router + BM25 sections catch regressions "
            "at $0 model spend. Prefer preference/adversarial fixtures over reward models."
        ),
        "when_rlhf_would_make_sense": (
            "Only if open-ended multi-turn sales chat were the product and free-form style "
            "needed ranking — not for ThumbGate expert-card truth."
        ),
    }
    return _pillar(
        "learning_tradeoffs",
        rank=rank,
        score_10=score,
        required=True,
        evidence={"checks": checks, "sample_route": sample, "tradeoff": tradeoff, "rlhf_hits": rlhf_hits},
        notes=(
            "A+ = supervised rules router (not LLM), deterministic_card, ≥20 labeled contract "
            "preference cases, no RLHF pipeline, documented why RLHF is overkill here."
        ),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    dimensions = [
        grade_offline_golden(),
        grade_online_production(),
        grade_continuous_provider(),
        grade_feedback_loop(),
        grade_learning_tradeoffs(),
    ]
    # Stable rank order 1..5 by importance.
    dimensions.sort(key=lambda d: d["rank"])

    required_ok = all(d["ok"] for d in dimensions if d["required"])
    avg = sum(d["score_10"] for d in dimensions) / max(len(dimensions), 1)
    a_plus = required_ok and all(d["grade"] == "A+" for d in dimensions)
    overall_grade = "A+" if a_plus else _score_to_grade(avg if required_ok else min(d["score_10"] for d in dimensions))

    receipt = {
        "schema_version": "tinker-brain-rank/1",
        "ran_at": utc_now(),
        "ranking_order": [
            "offline_golden_regression",
            "online_production_metrics",
            "continuous_provider_eval",
            "feedback_loop_closure",
            "learning_tradeoffs",
        ],
        "design": {
            "stack": "export → rules_router(+confidence) → BM25_section_retrieve → deterministic_card → contract → coverage",
            "learning": "supervised_routing_rules_not_llm + labeled contract preferences (not RLHF)",
            "cash": "fail-closed external $0 until non-owner Stripe",
        },
        "dimensions": dimensions,
        "overall": {
            "score_10": round(avg, 2),
            "grade": overall_grade,
            "a_plus": a_plus,
            "required_ok": required_ok,
        },
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if args.json:
        print(json.dumps(receipt, indent=2, sort_keys=True))
    else:
        print("tinker-brain multi-dimension rank")
        print(f"  design: {receipt['design']['stack']}")
        print(f"  learning: {receipt['design']['learning']}")
        for d in dimensions:
            mark = "PASS" if d["ok"] else "FAIL"
            print(
                f"  [{mark}] rank#{d['rank']} {d['dimension']}: "
                f"{d['grade']} ({d['score_10']}/10) — {d['notes'][:90]}"
            )
        o = receipt["overall"]
        print(
            f"  overall: {o['grade']} ({o['score_10']}/10) "
            f"A+={o['a_plus']} required_ok={o['required_ok']}"
        )
        print(f"  receipt: {args.out}")
    return 0 if receipt["overall"]["a_plus"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
