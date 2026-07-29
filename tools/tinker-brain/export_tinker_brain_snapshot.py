#!/usr/bin/env python3
"""Export one atomic ThumbGate.app revenue snapshot for tinker-brain.

ThumbGate-native since 2026-07-28 (no skool_top1percent dependency). Evidence:
- live https://thumbgate.app/api/health and /api/billing/plan readbacks
  (fail-soft: unreachable is recorded as unreachable, never invented)
- optional local receipts: ~/.hermes/receipts/tinker-brain/revenue-receipt.json
  (Stripe reconciliation written by a separate process) and
  ~/.hermes/receipts/thumbgate-aeo/latest.json (weekly AEO monitor)
- the GTM expert card at config/THUMBGATE_EXPERT_CARD.txt (shipped alongside
  the ANSWER_CARD so answers stay atomic with the export)

Fail-closed: no revenue receipt means external cash is $0 — never invented.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
EXPERT_SRC = REPO / "config" / "THUMBGATE_EXPERT_CARD.txt"
RECEIPTS_DIR = Path.home() / ".hermes" / "receipts" / "tinker-brain"
REVENUE_RECEIPT = RECEIPTS_DIR / "revenue-receipt.json"
AEO_LATEST = Path.home() / ".hermes" / "receipts" / "thumbgate-aeo" / "latest.json"
RETRIEVAL_RECEIPT = RECEIPTS_DIR / "retrieval-stack-latest.json"
DEFAULT_OUT = (
    Path.home() / ".hermes" / "business-brain" / "data-snapshot" / "business_snapshot.json"
)
HEALTH_URL = "https://thumbgate.app/api/health"
BILLING_URL = "https://thumbgate.app/api/billing/plan"
PROBE_TIMEOUT_S = 2.0
# Local Node probes must stay fail-soft and bounded so export never hangs agents.
NODE_PROBE_TIMEOUT_S = float(os.environ.get("TINKER_NODE_PROBE_TIMEOUT_S") or "25")
RAG_EVAL_TIMEOUT_S = float(os.environ.get("TINKER_RAG_EVAL_TIMEOUT_S") or "45")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def cents_to_usd(cents: Any) -> float:
    try:
        return round(int(cents) / 100.0, 2)
    except (TypeError, ValueError):
        return 0.0


def probe_json(url: str, timeout: float = PROBE_TIMEOUT_S) -> dict[str, Any]:
    """GET url, return {'ok': bool, 'body': dict|None, 'error': str|None}."""
    try:
        req = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json",
                # Cloudflare rejects urllib's default python UA; identify honestly.
                "User-Agent": "tinker-brain/1 (mac-yolo-safeguards; +https://thumbgate.app)",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        return {"ok": True, "body": body if isinstance(body, dict) else {}, "error": None}
    except urllib.error.HTTPError as exc:
        return {"ok": False, "body": None, "error": f"http_{exc.code}"}
    except Exception as exc:  # noqa: BLE001 — probes must never break the export
        return {"ok": False, "body": None, "error": type(exc).__name__}


def probe_health() -> dict[str, Any]:
    result = probe_json(HEALTH_URL)
    body = result.get("body") or {}
    return {
        "ok": bool(result["ok"]),
        "status": str(body.get("status") or body.get("ok") or ("up" if result["ok"] else "unreachable")),
        "error": result.get("error"),
        "url": HEALTH_URL,
    }


def probe_billing() -> dict[str, Any]:
    """Live price readback. The research rule: this endpoint outranks any cached price."""
    result = probe_json(BILLING_URL)
    body = result.get("body") or {}
    price_cents = None
    for key in ("unitAmount", "price_cents", "priceCents", "amount", "unit_amount", "cents"):
        if isinstance(body.get(key), int):
            price_cents = body[key]
            break
    if price_cents is None and isinstance(body.get("plan"), dict):
        for key in ("unitAmount", "price_cents", "priceCents", "amount", "unit_amount"):
            if isinstance(body["plan"].get(key), int):
                price_cents = body["plan"][key]
                break
    return {
        "ok": bool(result["ok"]),
        "price_cents": price_cents,
        "price_usd": cents_to_usd(price_cents) if price_cents is not None else None,
        "error": result.get("error"),
        "url": BILLING_URL,
    }


def load_revenue_receipt() -> dict[str, Any]:
    """Verified cash truth. Absent receipt = $0 external, honestly."""
    receipt = load_json(REVENUE_RECEIPT)
    external_cents = receipt.get("external_net_cents")
    owner_cents = receipt.get("owner_test_net_cents")
    has_receipt = isinstance(external_cents, int)
    return {
        "has_receipt": has_receipt,
        "external_net_cents": int(external_cents) if has_receipt else 0,
        "owner_test_net_cents": int(owner_cents) if isinstance(owner_cents, int) else 0,
        "reconciled_at": receipt.get("reconciled_at"),
        "source": receipt.get("source") or ("receipt_missing" if not has_receipt else "unknown"),
        "path": str(REVENUE_RECEIPT),
    }


def aeo_summary() -> dict[str, Any]:
    receipt = load_json(AEO_LATEST)
    if not receipt:
        return {"present": False}
    return {
        "present": True,
        "checked_at": receipt.get("checkedAt") or receipt.get("checked_at") or receipt.get("ts"),
        "metrics": receipt.get("metrics"),
        "delta": receipt.get("delta"),
    }


def _run_node_json(
    script_rel: str,
    args: list[str],
    *,
    timeout_s: float = NODE_PROBE_TIMEOUT_S,
) -> dict[str, Any]:
    """Run a repo Node probe with --json. Fail-soft: never raise to the exporter.

    Writes stdout to a tempfile (not a pipe) so large reports (e.g. lessons
    doctor ~100KB with synthesized-rule excerpts) are not truncated at the
    OS pipe buffer (~64KB) when the parent is not draining concurrently.
    """
    script = REPO / script_rel
    if not script.is_file():
        return {
            "ok": False,
            "error": "script_missing",
            "script": script_rel,
            "skipped": True,
        }
    out_path: Path | None = None
    err_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix=".tinker-probe-", suffix=".json", delete=False, mode="wb"
        ) as out_handle:
            out_path = Path(out_handle.name)
        with tempfile.NamedTemporaryFile(
            prefix=".tinker-probe-", suffix=".err", delete=False, mode="wb"
        ) as err_handle:
            err_path = Path(err_handle.name)
        with open(out_path, "wb") as out_f, open(err_path, "wb") as err_f:
            proc = subprocess.run(
                ["node", str(script), *args],
                cwd=str(REPO),
                stdout=out_f,
                stderr=err_f,
                timeout=timeout_s,
                check=False,
            )
        raw = out_path.read_text(encoding="utf-8", errors="replace").strip()
        err_raw = err_path.read_text(encoding="utf-8", errors="replace").strip()
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "error": f"timeout_{int(timeout_s)}s",
            "script": script_rel,
            "skipped": True,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "error": type(exc).__name__,
            "script": script_rel,
            "skipped": True,
        }
    finally:
        for path in (out_path, err_path):
            if path is None:
                continue
            try:
                path.unlink()
            except OSError:
                pass
    if not raw:
        return {
            "ok": False,
            "error": (err_raw[:200] if err_raw else f"empty_stdout_exit_{proc.returncode}"),
            "script": script_rel,
            "exit_code": proc.returncode,
            "skipped": True,
        }
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Some tools print human lines before JSON; take last JSON object.
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                data = json.loads(raw[start : end + 1])
            except json.JSONDecodeError:
                return {
                    "ok": False,
                    "error": "invalid_json",
                    "script": script_rel,
                    "exit_code": proc.returncode,
                    "skipped": True,
                }
        else:
            return {
                "ok": False,
                "error": "invalid_json",
                "script": script_rel,
                "exit_code": proc.returncode,
                "skipped": True,
            }
    if not isinstance(data, dict):
        return {
            "ok": False,
            "error": "non_object_json",
            "script": script_rel,
            "exit_code": proc.returncode,
            "skipped": True,
        }
    data.setdefault("exit_code", proc.returncode)
    data.setdefault("script", script_rel)
    return data


def _compact_problems(problems: Any, *, limit: int = 2) -> str:
    if not isinstance(problems, list) or not problems:
        return "none"
    parts: list[str] = []
    for item in problems[:limit]:
        text = str(item).replace("\n", " ").strip()
        if len(text) > 120:
            text = text[:117] + "..."
        parts.append(text)
    extra = len(problems) - limit
    if extra > 0:
        parts.append(f"+{extra} more")
    return "; ".join(parts) if parts else "none"


def _line_grepae(canary: dict[str, Any], ensure: dict[str, Any]) -> str:
    if canary.get("skipped") and ensure.get("skipped"):
        return (
            f"skipped canary={canary.get('error')}; ensure={ensure.get('error')} "
            "(install tools/grepai-index-canary.js + tools/ensure-grepai-index.js)"
        )
    ok = bool(canary.get("ok")) if not canary.get("skipped") else bool(ensure.get("ok"))
    bytes_n = canary.get("indexBytes") or ensure.get("repoIndexBytes") or ensure.get("isolatedBytes")
    problems = canary.get("problems") if isinstance(canary.get("problems"), list) else []
    linked = ensure.get("linked")
    search_n = ensure.get("searchFromRepo")
    return (
        f"ok={str(ok).lower()}; "
        f"bytes={bytes_n if bytes_n is not None else 'unknown'}; "
        f"linked={str(bool(linked)).lower() if linked is not None else 'unknown'}; "
        f"search_hits={search_n if search_n is not None else 'n/a'}; "
        f"problems={_compact_problems(problems)}"
    )


def _line_retrieval_eval(eval_report: dict[str, Any]) -> str:
    if eval_report.get("skipped"):
        return (
            f"skipped ({eval_report.get('error')}); "
            "run: node tools/rag-retrieval-eval.js --json"
        )
    return (
        f"ok={str(bool(eval_report.get('ok'))).lower()}; "
        f"pass={eval_report.get('passCount', 0)}/{eval_report.get('caseCount', 0)}; "
        f"mean_recall@k={eval_report.get('meanRecallAtK', 'n/a')}; "
        f"mean_mrr@k={eval_report.get('meanMrrAtK', 'n/a')}; "
        f"mean_ndcg@k={eval_report.get('meanNdcgAtK', 'n/a')}"
    )


def _line_ingestion(report: dict[str, Any]) -> str:
    if report.get("skipped"):
        return f"skipped ({report.get('error')}); run: node tools/document-ingestion-health.js --json"
    fails = report.get("criticalFails") or []
    n_fails = len(fails) if isinstance(fails, list) else fails
    return (
        f"overall={report.get('overallGrade', 'unknown')}; "
        f"ok={str(bool(report.get('ok'))).lower()}; "
        f"critical_fails={n_fails}; "
        f"offline={str(bool(report.get('offline'))).lower()}"
    )


def _line_funnel(report: dict[str, Any]) -> str:
    if report.get("skipped"):
        return f"skipped ({report.get('error')}); run: node tools/funnel-stage-health.js --json"
    fails = report.get("criticalFails") or []
    n_fails = len(fails) if isinstance(fails, list) else fails
    stages = report.get("stages") if isinstance(report.get("stages"), list) else []
    status_bits: list[str] = []
    for stage in stages:
        if not isinstance(stage, dict):
            continue
        sid = stage.get("id") or "?"
        probe = stage.get("probe") if isinstance(stage.get("probe"), dict) else {}
        st = probe.get("status") or "unknown"
        if st in {"fail", "warn", "ok"}:
            status_bits.append(f"{sid}={st}")
    sample = ", ".join(status_bits[:6]) if status_bits else "no_local_probes"
    return (
        f"ok={str(bool(report.get('ok'))).lower()}; "
        f"critical_fails={n_fails}; "
        f"stages=[{sample}]"
    )


def _line_lessons(report: dict[str, Any]) -> str:
    if report.get("skipped"):
        return f"skipped ({report.get('error')}); run: node tools/thumbgate-lessons-doctor.js --json"
    note = report.get("note")
    if isinstance(note, str) and note.strip() and "storeDrift" not in report:
        return f"ok=false; note={note.strip()[:160]}"
    drift = report.get("storeDrift") if isinstance(report.get("storeDrift"), dict) else {}
    emb = report.get("embeddings") if isinstance(report.get("embeddings"), dict) else {}
    lance = report.get("lancedb") if isinstance(report.get("lancedb"), dict) else {}
    coverage = drift.get("coverage")
    cov_pct = f"{float(coverage) * 100:.1f}%" if isinstance(coverage, (int, float)) else "unknown"
    problems = report.get("problems") if isinstance(report.get("problems"), list) else []
    return (
        f"ok={str(bool(report.get('ok'))).lower()}; "
        f"sqlite_coverage={cov_pct} "
        f"({drift.get('sqliteCount', '?')}/{drift.get('ledgerCount', '?')}); "
        f"embeddings={emb.get('status', 'unknown')}; "
        f"lancedb={lance.get('status', 'unknown')}; "
        f"problems={_compact_problems(problems)}"
    )


def _retrieval_summary_line(card_fields: dict[str, str]) -> str:
    """One-line operator summary; never invent health beyond probe lines."""
    grepae = card_fields.get("GREPAI_STATUS", "unknown")
    retr = card_fields.get("RETRIEVAL_EVAL", "unknown")
    ingest = card_fields.get("INGESTION_GRADE", "unknown")
    lessons = card_fields.get("LESSONS_DOCTOR", "unknown")
    grepae_ok = grepae.startswith("ok=true")
    retr_ok = retr.startswith("ok=true")
    ingest_ok = "ok=true" in ingest
    lessons_ok = lessons.startswith("ok=true")
    flags = []
    if not grepae_ok:
        flags.append("grepae")
    if not retr_ok:
        flags.append("retrieval_eval")
    if not ingest_ok:
        flags.append("ingestion")
    if not lessons_ok:
        flags.append("lessons_fts")
    if not flags:
        return "retrieval stack: grepae + eval + ingestion + lessons probes green (re-export to refresh)"
    return (
        "retrieval stack attention: "
        + ", ".join(flags)
        + " — see GREPAI_STATUS / RETRIEVAL_EVAL / INGESTION_GRADE / LESSONS_DOCTOR; "
        "fix with node tools/ensure-grepai-index.js --canary and node tools/rag-retrieval-eval.js --json"
    )


def probe_retrieval_stack(
    *,
    offline: bool | None = None,
    skip_rag_eval: bool | None = None,
) -> dict[str, Any]:
    """Probe grepae / retrieval eval / ingestion / funnel / lessons. Fail-soft always.

    Env:
      TINKER_RETRIEVAL_OFFLINE=1 — force --offline on funnel + ingestion (CI-safe)
      TINKER_SKIP_RAG_EVAL=1 — skip slow rag-retrieval-eval.js (use receipt cache only)
    """
    if offline is None:
        offline = os.environ.get("TINKER_RETRIEVAL_OFFLINE", "").strip() in {
            "1",
            "true",
            "yes",
        }
    if skip_rag_eval is None:
        skip_rag_eval = os.environ.get("TINKER_SKIP_RAG_EVAL", "").strip() in {
            "1",
            "true",
            "yes",
        }

    canary = _run_node_json("tools/grepai-index-canary.js", ["--json"])
    # ensure without --canary (canary already ran); avoid rebuild side effects.
    ensure = _run_node_json("tools/ensure-grepai-index.js", ["--json"])
    ingest_args = ["--json"]
    if offline:
        ingest_args.append("--offline")
    ingestion = _run_node_json("tools/document-ingestion-health.js", ingest_args)
    funnel_args = ["--json"]
    if offline:
        funnel_args.append("--offline")
    funnel = _run_node_json("tools/funnel-stage-health.js", funnel_args)
    # Prefer home ~/.thumbgate (live MCP store) when REPO worktree has no .thumbgate.
    lessons_dir = REPO / ".thumbgate"
    home_thumbgate = Path.home() / ".thumbgate"
    lessons_args = ["--json"]
    if not lessons_dir.is_dir() and home_thumbgate.is_dir():
        lessons_args.extend(["--dir", str(home_thumbgate)])
    # Home lessons stores can be large (JSONL + embeddings); allow up to 60s.
    lessons = _run_node_json(
        "tools/thumbgate-lessons-doctor.js",
        lessons_args,
        timeout_s=max(NODE_PROBE_TIMEOUT_S, 60.0),
    )

    if skip_rag_eval:
        retrieval_eval: dict[str, Any] = {
            "ok": False,
            "skipped": True,
            "error": "TINKER_SKIP_RAG_EVAL",
            "script": "tools/rag-retrieval-eval.js",
        }
    else:
        retrieval_eval = _run_node_json(
            "tools/rag-retrieval-eval.js",
            ["--json"],
            timeout_s=RAG_EVAL_TIMEOUT_S,
        )
        # Prefer last good receipt if live eval timed out / skipped.
        if retrieval_eval.get("skipped"):
            cached = load_json(RETRIEVAL_RECEIPT)
            cached_eval = cached.get("retrieval_eval") if isinstance(cached, dict) else None
            if isinstance(cached_eval, dict) and "meanRecallAtK" in cached_eval:
                retrieval_eval = {
                    **cached_eval,
                    "from_cache": True,
                    "cache_error": retrieval_eval.get("error"),
                }

    card_fields = {
        "GREPAI_STATUS": _line_grepae(canary, ensure),
        "RETRIEVAL_EVAL": _line_retrieval_eval(retrieval_eval),
        "INGESTION_GRADE": _line_ingestion(ingestion),
        "FUNNEL_HEALTH": _line_funnel(funnel),
        "LESSONS_DOCTOR": _line_lessons(lessons),
    }
    card_fields["RETRIEVAL_SUMMARY"] = _retrieval_summary_line(card_fields)

    return {
        "probed_at": utc_now(),
        "offline": offline,
        "grepae_canary": canary,
        "grepae_ensure": ensure,
        "retrieval_eval": retrieval_eval,
        "ingestion": {
            "ok": ingestion.get("ok"),
            "overallGrade": ingestion.get("overallGrade"),
            "criticalFails": ingestion.get("criticalFails"),
            "offline": ingestion.get("offline"),
            "skipped": ingestion.get("skipped"),
            "error": ingestion.get("error"),
        },
        "funnel": {
            "ok": funnel.get("ok"),
            "criticalFails": funnel.get("criticalFails"),
            "offline": funnel.get("offline"),
            "skipped": funnel.get("skipped"),
            "error": funnel.get("error"),
        },
        "lessons_doctor": {
            "ok": lessons.get("ok"),
            "problems": lessons.get("problems"),
            "storeDrift": lessons.get("storeDrift"),
            "embeddings": lessons.get("embeddings"),
            "lancedb": lessons.get("lancedb"),
            "skipped": lessons.get("skipped"),
            "error": lessons.get("error"),
        },
        "card_lines": card_fields,
    }


def build_snapshot(
    *,
    health: dict[str, Any] | None = None,
    billing: dict[str, Any] | None = None,
    revenue: dict[str, Any] | None = None,
    aeo: dict[str, Any] | None = None,
    retrieval: dict[str, Any] | None = None,
) -> dict[str, Any]:
    health = health if health is not None else probe_health()
    billing = billing if billing is not None else probe_billing()
    revenue = revenue if revenue is not None else load_revenue_receipt()
    aeo = aeo if aeo is not None else aeo_summary()
    retrieval = retrieval if retrieval is not None else probe_retrieval_stack()

    external_cents = int(revenue.get("external_net_cents") or 0)
    owner_cents = int(revenue.get("owner_test_net_cents") or 0)
    if external_cents > 0:
        why_zero = (
            f"External revenue is verified at ${cents_to_usd(external_cents):.2f} "
            f"(source={revenue.get('source')}; reconciled_at={revenue.get('reconciled_at')}). "
            "Grow it: ship the campaign beat, convert design partners, keep Continuity honest."
        )
    elif revenue.get("has_receipt"):
        why_zero = (
            "No non-owner buyer completed a ThumbGate.app subscription payment "
            f"(verified by receipt source={revenue.get('source')}, "
            f"reconciled_at={revenue.get('reconciled_at')}). Funnel reach is unproven "
            "(store installs ~0, ~2 internal accounts); the lever is distribution + "
            "design partners, not new SKUs."
        )
    else:
        why_zero = (
            "No non-owner buyer payment is verifiable: no revenue receipt exists at "
            "~/.hermes/receipts/tinker-brain/revenue-receipt.json, so external cash is "
            "$0 by fail-closed rule (never invent cash). Funnel reach is unproven; the "
            "lever is the daily campaign beat + 3 Continuity design partners."
        )

    if billing.get("ok") and billing.get("price_usd") is not None:
        live_price = (
            f"live /api/billing/plan readback OK: Pro Continuity ${billing['price_usd']:.2f}/mo "
            f"({billing['price_cents']} cents) — this outranks any cached or copied price"
        )
    else:
        live_price = (
            f"live /api/billing/plan unreachable ({billing.get('error')}); re-read it before "
            "any campaign copy — never hard-code a price"
        )

    next_money = (
        "Ship today's ThumbGate.app campaign beat (one persona + one pain + cited evidence + "
        "hook) across the fan-out matrix with verified permalinks; recruit toward 3 Continuity "
        "design partners; check the AEO monitor weekly. Reddit stays draft-only under the burn "
        "rule. Cash counts only on a non-owner Stripe subscription payment."
    )

    return {
        "schema_version": "tinker-thumbgate-snapshot/1",
        "exported_at": utc_now(),
        "unit_rule": "all *_cents fields are US cents; divide by 100 for USD",
        "focus": {
            "default_scope": "thumbgate_app_revenue",
            "primary_product": "thumbgate_app",
            "marketing_channels": [
                "linkedin",
                "x",
                "bluesky",
                "threads",
                "devto",
                "medium",
                "show_hn",
                "youtube_community",
            ],
            "acquisition_watch": ["skool", "reddit"],
            "business_goal": "verified external cash from ThumbGate.app Continuity subscriptions",
            "out_of_scope_by_default": [
                "skool_top1percent operations (retired 2026-07-28)",
                "Obsidian operations",
                "generic technology research",
            ],
        },
        "products": {
            "thumbgate_app": {
                "name": "ThumbGate.app — free Hermes web control plane + paid Continuity",
                "primary": True,
                "skus": "Web Control $0/mo; Pro Continuity $10/mo (14-day trial, 5 cloud runs); Team $49/mo",
                "price_source": "live https://thumbgate.app/api/billing/plan outranks any cached price",
                "companion_of": "Hermes Mobile ($4.99 pay-once) — additive upsell, never a rescue",
                "distinct_from": "the $19 firewall is a separate product — never conflate",
                "gtm_card": "config/THUMBGATE_EXPERT_CARD.txt",
                "product_model": "SaaS_subscription",
            },
        },
        "hard_bans": [
            "invent_cash",
            "continuity_rescue_framing",
            "conflate_with_firewall_product",
            "hardcode_price_in_copy",
            "overclaim_reliability_without_slo",
            "reddit_promo_without_override",
        ],
        "cash": {
            "external_net_cents": external_cents,
            "external_net_usd": cents_to_usd(external_cents),
            "owner_test_net_cents": owner_cents,
            "owner_test_net_usd": cents_to_usd(owner_cents),
            "owner_test_counts_as_revenue": False,
            "why_external_zero_if_zero": why_zero,
            "receipt": revenue,
        },
        "live": {"health": health, "billing": billing, "live_price_line": live_price},
        "aeo_monitor": aeo,
        "retrieval": retrieval,
        "next_money_action": next_money,
        "visibility_limits": [
            "This snapshot is not live after export; check exported_at / SNAPSHOT_TIME.",
            "Cash truth is only as fresh as the local revenue receipt; Stripe is canonical.",
            "AEO receipt is a citation proxy, not real AI Overview telemetry.",
            "Retrieval lines are probe snapshots (grepae/eval/ingestion/funnel/lessons); re-export to refresh.",
        ],
    }


def atomic_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    fd, name = tempfile.mkstemp(prefix=".snap-", suffix=".json", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(name, 0o600)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            try:
                os.unlink(name)
            except OSError:
                pass


def write_snapshot(out: Path, payload: dict[str, Any]) -> None:
    atomic_write(out, payload)
    stamp = out.parent / "SNAPSHOT_TIME.txt"
    stamp.write_text(str(payload.get("exported_at") or utc_now()) + "\n", encoding="utf-8")
    stamp.chmod(0o600)

    cash = payload.get("cash") or {}
    live = payload.get("live") or {}
    health = live.get("health") or {}
    aeo = payload.get("aeo_monitor") or {}
    retrieval = payload.get("retrieval") if isinstance(payload.get("retrieval"), dict) else {}
    card_lines = (
        retrieval.get("card_lines") if isinstance(retrieval.get("card_lines"), dict) else {}
    )
    aeo_line = (
        f"present=true; checked_at={aeo.get('checked_at')}"
        if aeo.get("present")
        else "present=false; run tools/thumbgate-aeo-monitor.js weekly"
    )
    grepae_line = card_lines.get("GREPAI_STATUS") or "not_probed"
    retr_line = card_lines.get("RETRIEVAL_EVAL") or "not_probed"
    ingest_line = card_lines.get("INGESTION_GRADE") or "not_probed"
    funnel_line = card_lines.get("FUNNEL_HEALTH") or "not_probed"
    lessons_line = card_lines.get("LESSONS_DOCTOR") or "not_probed"
    retr_summary = card_lines.get("RETRIEVAL_SUMMARY") or (
        "retrieval stack not probed this export"
    )
    card = out.parent / "ANSWER_CARD.txt"
    card.write_text(
        "\n".join(
            [
                f"AS_OF={payload.get('exported_at')}",
                (
                    "FOCUS=Sell ThumbGate.app (primary product); fan-out matrix for marketing; "
                    "Skool and Reddit stay watch-only acquisition channels"
                ),
                (
                    "THUMBGATE_PRODUCT=ThumbGate.app: free Hermes web control plane (Leash "
                    "approvals, P-256 pairing) + paid Continuity add-on (Pro $10/mo, Team $49/mo, "
                    "14-day trial w/ 5 cloud runs); companion to Hermes Mobile $4.99 pay-once, "
                    "never a rescue for it; the $19 firewall is a separate product — never conflate"
                ),
                (
                    "THUMBGATE_POSITIONING=own the 'Mac is primary; pay only for offline "
                    "continuation' wedge; local-first privacy; sell resilience not compute; "
                    "priced under the ~$20 cloud-agent cluster"
                ),
                (
                    "THUMBGATE_NEXT_GTM=one campaign beat per 1-2 days (persona+pain+cited "
                    "evidence+hook) across LinkedIn/X/Bluesky/Threads/dev.to/Show HN; weekly AEO "
                    "citation monitor; Reddit draft-only under burn rule; recruit 3 Continuity "
                    "design partners"
                ),
                (
                    "THUMBGATE_EXPERT_CARD=THUMBGATE_EXPERT_CARD.txt in this directory; answer "
                    "monetize/market/promote/sell questions from it"
                ),
                f"THUMBGATE_LIVE_PRICE={live.get('live_price_line')}",
                (
                    "THUMBGATE_HEALTH="
                    f"status={health.get('status')}; ok={str(bool(health.get('ok'))).lower()}"
                ),
                f"AEO_MONITOR={aeo_line}",
                f"EXTERNAL_USD={cash.get('external_net_usd')}  (cents={cash.get('external_net_cents')})",
                (
                    f"OWNER_TEST_USD={cash.get('owner_test_net_usd')}  "
                    f"(cents={cash.get('owner_test_net_cents')}; NOT revenue)"
                ),
                "BAN_SUM_CASH=never add EXTERNAL+OWNER_TEST into 'total revenue' or 'total cash'",
                f"WHY_ZERO={cash.get('why_external_zero_if_zero')}",
                "PRIVATE_CONVERT_AUTHORIZED=false",
                (
                    "PRIVATE_CONVERT_RULE=false means do not recommend DM/private conversion; "
                    "value-first public content only until a provider-verified explicit request exists"
                ),
                (
                    "SAAS=fan-out free value → thumbgate.app visit → WorkOS sign-in → pair → "
                    "first chat → Continuity trial → non-owner Stripe subscription"
                ),
                "BAN_CONVERT_WITHOUT_INTEREST=only after the exact human requests a trial, demo, or intake",
                "BAN_INVENT_SCORES=never invent DS/ML or GTM scores; only SYSTEM_SCORES line below",
                f"SYSTEM_SCORES={_system_scores_line()}",
                "SCORE_SCOPE=copy SYSTEM_SCORES exactly; do not invent better grades than the line",
                # Retrieval / grepae / ingestion / funnel / lessons — probe-backed, never invented.
                f"GREPAI_STATUS={grepae_line}",
                f"RETRIEVAL_EVAL={retr_line}",
                f"INGESTION_GRADE={ingest_line}",
                f"FUNNEL_HEALTH={funnel_line}",
                f"LESSONS_DOCTOR={lessons_line}",
                f"RETRIEVAL_SUMMARY={retr_summary}",
                (
                    "RETRIEVAL_SCOPE=copy GREPAI_STATUS/RETRIEVAL_EVAL/INGESTION_GRADE/"
                    "FUNNEL_HEALTH/LESSONS_DOCTOR/RETRIEVAL_SUMMARY exactly; re-export to refresh; "
                    "never invent recall@k / nDCG / grepae health"
                ),
                f"NEXT_MONEY={payload.get('next_money_action')}",
                "RULE: zero tools; do not list_files; answer now from this card.",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    card.chmod(0o600)

    # Persist compact retrieval receipt for next export if rag-eval times out.
    try:
        RECEIPTS_DIR.mkdir(parents=True, exist_ok=True)
        compact = {
            "probed_at": retrieval.get("probed_at"),
            "retrieval_eval": retrieval.get("retrieval_eval"),
            "card_lines": card_lines,
        }
        RETRIEVAL_RECEIPT.write_text(
            json.dumps(compact, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        RETRIEVAL_RECEIPT.chmod(0o600)
    except OSError:
        pass

    if EXPERT_SRC.is_file():
        expert_dst = out.parent / "THUMBGATE_EXPERT_CARD.txt"
        try:
            shutil.copyfile(EXPERT_SRC, expert_dst)
            expert_dst.chmod(0o600)
        except OSError:
            pass  # answer path falls back to the repo copy


def _system_scores_line() -> str:
    """Evidence-backed scores from tools/ml-system-scores.js; never invent."""
    script = REPO / "tools" / "ml-system-scores.js"
    if not script.is_file():
        return (
            "not_scored (tools/ml-system-scores.js missing; "
            "eval receipts at ~/.hermes/receipts/tinker-brain/ are the quality signal)"
        )
    try:
        proc = subprocess.run(
            ["node", str(script), "--json", "--write"],
            cwd=str(REPO),
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            data = json.loads(proc.stdout)
            line = data.get("system_scores_line")
            if isinstance(line, str) and line.strip():
                return line.strip()
    except Exception:  # noqa: BLE001 — export must never die on scores
        pass
    # Fall back to last written receipt
    scores_path = Path.home() / ".hermes" / "ml" / "system-scores.json"
    cached = load_json(scores_path)
    line = cached.get("system_scores_line") if isinstance(cached, dict) else None
    if isinstance(line, str) and line.strip():
        return line.strip() + " (cached)"
    return (
        "not_scored (ml-system-scores failed; "
        "run node tools/ml-system-scores.js --write)"
    )


def validate_snapshot(path: Path) -> list[str]:
    errors: list[str] = []
    data = load_json(path)
    if data.get("schema_version") != "tinker-thumbgate-snapshot/1":
        errors.append("bad_schema")
    cash = data.get("cash") if isinstance(data.get("cash"), dict) else {}
    if "external_net_cents" not in cash or "external_net_usd" not in cash:
        errors.append("cash_fields_missing")
    else:
        try:
            if abs(float(cash["external_net_usd"]) - int(cash["external_net_cents"]) / 100.0) > 0.001:
                errors.append("cents_usd_mismatch")
        except (TypeError, ValueError):
            errors.append("cash_not_numeric")
    focus = data.get("focus") if isinstance(data.get("focus"), dict) else {}
    if focus.get("default_scope") != "thumbgate_app_revenue":
        errors.append("focus_scope_missing")
    products = data.get("products") if isinstance(data.get("products"), dict) else {}
    if "thumbgate_app" not in products or not (products.get("thumbgate_app") or {}).get("primary"):
        errors.append("primary_product_missing")
    encoded = json.dumps(data, sort_keys=True).lower()
    if "thumbgate" not in encoded:
        errors.append("primary_product_leaked_out")
    if "endpoint security" in encoded:
        errors.append("miscategorized_as_endpoint_security")
    if not data.get("next_money_action"):
        errors.append("next_money_missing")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--check", type=Path, default=None)
    args = parser.parse_args()
    if args.check is not None:
        errors = validate_snapshot(args.check)
        print(json.dumps({"ok": not errors, "errors": errors, "path": str(args.check)}, indent=2))
        return 0 if not errors else 2
    out = args.out or DEFAULT_OUT
    payload = build_snapshot()
    write_snapshot(out, payload)
    retrieval = payload.get("retrieval") if isinstance(payload.get("retrieval"), dict) else {}
    card_lines = (
        retrieval.get("card_lines") if isinstance(retrieval.get("card_lines"), dict) else {}
    )
    print(
        json.dumps(
            {
                "ok": True,
                "out": str(out),
                "exported_at": payload["exported_at"],
                "external_net_usd": payload["cash"]["external_net_usd"],
                "health_ok": bool(payload["live"]["health"].get("ok")),
                "billing_ok": bool(payload["live"]["billing"].get("ok")),
                "revenue_receipt": payload["cash"]["receipt"].get("has_receipt"),
                "retrieval_summary": card_lines.get("RETRIEVAL_SUMMARY"),
                "grepae_status": card_lines.get("GREPAI_STATUS"),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
