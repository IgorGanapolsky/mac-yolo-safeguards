#!/usr/bin/env python3
"""Continuous self-heal / self-learn / self-improve loop for ThumbGate sales GTM brain.

Design constraints (hard — do not break):
  - Deterministic. No LLM, no embeddings, no invented revenue.
  - Fail-closed cash: external $0 until non-owner Stripe receipt.
  - Expert card answers only for GTM; coverage gaps become research agenda.

What "continuous" means here (not AGI theater):
  HEAL     Detect stale/diverged cards, promote the newer AS_OF source, re-export
           snapshot so runtime matches the card the operator can edit in git.
  LEARN    Accumulate coverage misses + funnel/billing probes into a durable agenda
           (coordination/tinker-brain-research-agenda.json + gaps jsonl).
  IMPROVE  Re-run the golden eval + fingerprint; record journal rows so "got worse?"
           is mechanical, not vibes.

Usage:
  python3 tools/tinker-brain/tinker_brain_continuous.py --once --json
  python3 tools/tinker-brain/tinker_brain_continuous.py --once --heal
  python3 tools/tinker-brain/tinker_brain_continuous.py --loop --interval-sec 3600

Exit: 0 if post-heal health ok (or only info findings); 1 if still unhealthy.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent  # …/tools/tinker-brain


def _find_repo_root(start: Path) -> Path:
    """Resolve checkout root for both main tree and .worktrees/<name>/ layouts."""
    for p in [start, *start.parents]:
        if (p / "config" / "THUMBGATE_EXPERT_CARD.txt").is_file() and (
            p / "tools" / "tinker-brain"
        ).is_dir():
            return p
    return start.parents[2]


_REPO = _find_repo_root(_HERE)
sys.path.insert(0, str(_HERE))

from tinker_brain_health import (  # noqa: E402
    _AS_OF,
    _REPO_CARD,
    _SNAPSHOT_CARD,
    _digest,
    check,
    log_gap,
    read_gaps,
)

_JOURNAL = Path.home() / ".hermes" / "receipts" / "tinker-brain" / "continuous-journal.jsonl"
_AGENDA = _REPO / "coordination" / "tinker-brain-research-agenda.json"
_LATEST = Path.home() / ".hermes" / "receipts" / "tinker-brain" / "continuous-latest.json"
_BILLING_URL = "https://thumbgate.app/api/billing/plan"
_HEALTH_URL = "https://thumbgate.app/api/health"


def _utc() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _probe(url: str, timeout: float = 3.0) -> dict[str, Any]:
    try:
        req = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "tinker-brain-continuous/1 (+https://thumbgate.app)",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        return {"ok": True, "body": body if isinstance(body, dict) else {}, "error": None}
    except urllib.error.HTTPError as exc:
        return {"ok": False, "body": None, "error": f"http_{exc.code}"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "body": None, "error": type(exc).__name__}


def _as_of_date(text: str | None) -> str | None:
    if not text:
        return None
    m = _AS_OF.search(text)
    return m.group(1) if m else None


def heal_divergence(*, dry_run: bool = False) -> dict[str, Any]:
    """Promote the newer AS_OF expert card so git + runtime agree.

    Policy (sales-critical):
      - Prefer the card with the newer AS_OF_RESEARCH date.
      - On equal dates, prefer snapshot (runtime truth) then re-export from repo
        only when repo was written as the winner.
      - After any file copy into config/, re-export the full snapshot so ANSWER_CARD
        cash fields stay atomic with the expert card.
    """
    repo = _REPO_CARD.read_text(encoding="utf-8") if _REPO_CARD.is_file() else None
    snap = _SNAPSHOT_CARD.read_text(encoding="utf-8") if _SNAPSHOT_CARD.is_file() else None
    action = {"acted": False, "reason": "already_aligned", "direction": None}

    if repo is None and snap is None:
        return {"ok": False, "error": "no_card", **action}
    if repo is not None and snap is not None and _digest(repo) == _digest(snap):
        return {"ok": True, **action}

    repo_as = _as_of_date(repo)
    snap_as = _as_of_date(snap)

    # Choose winner by date string YYYY-MM-DD lexicographic order.
    if repo is None:
        winner, direction = "snapshot", "snapshot_only"
    elif snap is None:
        winner, direction = "repo", "snapshot_missing_export"
    elif snap_as and repo_as and snap_as > repo_as:
        winner, direction = "snapshot", "snapshot_newer_to_repo"
    elif repo_as and snap_as and repo_as > snap_as:
        winner, direction = "repo", "repo_newer_export"
    elif snap is not None and repo is not None and _digest(repo) != _digest(snap):
        # Same/unknown dates but different content — snapshot is runtime; promote to repo
        # so git edits match answers.
        winner, direction = "snapshot", "content_diverge_snapshot_to_repo"
    else:
        winner, direction = "repo", "default_export"

    action["direction"] = direction
    action["repoAsOf"] = repo_as
    action["snapAsOf"] = snap_as

    if dry_run:
        action["acted"] = False
        action["reason"] = f"would_heal:{direction}"
        return {"ok": True, **action}

    if winner == "snapshot" and snap is not None:
        _REPO_CARD.parent.mkdir(parents=True, exist_ok=True)
        _REPO_CARD.write_text(snap, encoding="utf-8")
        action["acted"] = True
        action["reason"] = "promoted_snapshot_to_repo"
    else:
        action["reason"] = "will_reexport_from_repo"

    # Always re-export after heal so runtime snapshot matches.
    export = _run_export()
    action["export"] = export
    action["acted"] = True if action.get("acted") or export.get("ok") else action["acted"]
    if export.get("ok") and not action.get("reason", "").startswith("promoted"):
        action["reason"] = "reexported_snapshot"
    return {"ok": bool(export.get("ok")), **action}


def _run_export() -> dict[str, Any]:
    script = _HERE / "export_tinker_brain_snapshot.py"
    try:
        r = subprocess.run(
            [sys.executable, str(script)],
            cwd=str(_REPO),
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        return {
            "ok": r.returncode == 0,
            "code": r.returncode,
            "stdout": (r.stdout or "")[-500:],
            "stderr": (r.stderr or "")[-500:],
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": type(exc).__name__, "detail": str(exc)[:200]}


def _run_eval() -> dict[str, Any]:
    script = _HERE / "tinker_brain_eval.py"
    if not script.is_file():
        return {"ok": False, "error": "eval_missing"}
    try:
        r = subprocess.run(
            [sys.executable, str(script), "--json"],
            cwd=str(_REPO),
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
        body: dict[str, Any] = {}
        try:
            body = json.loads(r.stdout or "{}")
        except json.JSONDecodeError:
            body = {"raw": (r.stdout or "")[-800:]}
        return {"ok": r.returncode == 0, "code": r.returncode, "result": body}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": type(exc).__name__}


def _funnel_probe() -> dict[str, Any]:
    """Best-effort Node funnel health — never invents stages."""
    tool = _REPO / "tools" / "funnel-stage-health.js"
    if not tool.is_file():
        return {"ok": False, "error": "funnel_tool_missing"}
    try:
        r = subprocess.run(
            ["node", str(tool), "--json"],
            cwd=str(_REPO),
            capture_output=True,
            text=True,
            timeout=90,
            check=False,
        )
        try:
            data = json.loads(r.stdout or "{}")
        except json.JSONDecodeError:
            return {"ok": False, "error": "funnel_json_parse", "raw": (r.stdout or "")[:300]}
        stages = data.get("stages") or []
        fails = [
            {"id": s.get("id"), "status": (s.get("probe") or {}).get("status")}
            for s in stages
            if (s.get("probe") or {}).get("status") == "fail"
        ]
        return {
            "ok": r.returncode == 0 and not fails,
            "failStages": fails,
            "asOf": data.get("asOf"),
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": type(exc).__name__}


def learn_agenda(health: dict[str, Any], funnel: dict[str, Any], billing: dict[str, Any]) -> dict[str, Any]:
    """Fold coverage gaps + funnel fails into a durable research/sales agenda."""
    gaps = read_gaps()
    top_gaps = sorted(gaps.items(), key=lambda kv: -kv[1])[:20]
    agenda = {
        "updatedAt": _utc(),
        "purpose": "ThumbGate.app sales/marketing research agenda from tinker-brain misses",
        "coverageGaps": [{"term": t, "misses": n} for t, n in top_gaps],
        "funnelFails": funnel.get("failStages") or [],
        "billing": {
            "ok": billing.get("ok"),
            "unitAmount": (billing.get("body") or {}).get("unitAmount"),
            "active": (billing.get("body") or {}).get("active"),
            "error": billing.get("error"),
        },
        "healthFindings": [
            f for f in (health.get("findings") or []) if f.get("severity") in {"fail", "warn", "info"}
        ],
        "nextActions": [],
    }

    # Deterministic next actions from evidence (sales-facing).
    if any(f.get("check") == "stale-card" for f in agenda["healthFindings"]):
        agenda["nextActions"].append(
            "Refresh THUMBGATE_EXPERT_CARD.txt competitive/positioning sections; re-export snapshot."
        )
    if any(f.get("check") == "source-divergence" for f in agenda["healthFindings"]):
        agenda["nextActions"].append(
            "Heal divergence: continuous --heal (promote newer AS_OF; re-export)."
        )
    if top_gaps:
        terms = ", ".join(t for t, _ in top_gaps[:5])
        agenda["nextActions"].append(
            f"Research and add card sections covering top gaps: {terms}."
        )
    for st in agenda["funnelFails"]:
        sid = st.get("id")
        if sid == "campaign_beat":
            agenda["nextActions"].append(
                "Ship one LIVE campaign beat (≤2d cadence) with UTMs to #pricing; Leash/gate-first copy."
            )
        elif sid == "outbound_domain":
            agenda["nextActions"].append(
                "Verify domain From igor@igorganapolsky.com + API reply scan; no gmail.com spam."
            )
        elif sid == "design_partners":
            agenda["nextActions"].append(
                "≤3 personalized design-partner asks on gate value, not Continuity-only."
            )
    if billing.get("ok") and (billing.get("body") or {}).get("unitAmount") is not None:
        agenda["nextActions"].append(
            "Never hard-code Continuity price in promo; live /api/billing/plan outranks card copy."
        )
    if not agenda["nextActions"]:
        agenda["nextActions"].append(
            "No structural fails — execute next money: free-value publish + reply scan; cash only on non-owner Stripe."
        )

    _AGENDA.parent.mkdir(parents=True, exist_ok=True)
    _AGENDA.write_text(json.dumps(agenda, indent=2) + "\n", encoding="utf-8")
    return agenda


def _append_journal(row: dict[str, Any]) -> None:
    _JOURNAL.parent.mkdir(parents=True, exist_ok=True)
    with _JOURNAL.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, sort_keys=True) + "\n")


def run_once(*, heal: bool = True, dry_run: bool = False, run_eval: bool = True) -> dict[str, Any]:
    t0 = time.time()
    pre = check(max_age_days=7)
    heal_result: dict[str, Any] = {"acted": False, "skipped": not heal}
    if heal:
        heal_result = heal_divergence(dry_run=dry_run)

    post = check(max_age_days=7)
    billing = _probe(_BILLING_URL)
    product = _probe(_HEALTH_URL)
    funnel = _funnel_probe()
    agenda = learn_agenda(post, funnel, billing)

    eval_result: dict[str, Any] = {"skipped": True}
    if run_eval and not dry_run:
        eval_result = _run_eval()

    row = {
        "ts": _utc(),
        "phase": "once",
        "preOk": pre.get("ok"),
        "postOk": post.get("ok"),
        "heal": heal_result,
        "billingOk": billing.get("ok"),
        "productOk": product.get("ok"),
        "funnelOk": funnel.get("ok"),
        "funnelFails": funnel.get("failStages"),
        "agendaTop": (agenda.get("coverageGaps") or [])[:5],
        "nextActions": agenda.get("nextActions"),
        "evalOk": eval_result.get("ok"),
        "latency_s": round(time.time() - t0, 3),
        "asOf": post.get("asOf"),
        "effectiveCard": post.get("effectiveCard"),
    }
    if not dry_run:
        _append_journal(row)
        _LATEST.parent.mkdir(parents=True, exist_ok=True)
        _LATEST.write_text(json.dumps(row, indent=2) + "\n", encoding="utf-8")

    return {
        "ok": bool(post.get("ok")),
        "pre": pre,
        "post": post,
        "heal": heal_result,
        "billing": {
            "ok": billing.get("ok"),
            "unitAmount": (billing.get("body") or {}).get("unitAmount"),
            "active": (billing.get("body") or {}).get("active"),
            "error": billing.get("error"),
        },
        "productHealth": {
            "ok": product.get("ok"),
            "status": (product.get("body") or {}).get("status"),
            "error": product.get("error"),
        },
        "funnel": funnel,
        "agendaPath": str(_AGENDA),
        "agenda": agenda,
        "eval": eval_result,
        "journal": str(_JOURNAL),
        "latest": str(_LATEST),
        "latency_s": row["latency_s"],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--once", action="store_true", help="Single cycle (default if no --loop)")
    ap.add_argument("--loop", action="store_true", help="Repeat forever")
    ap.add_argument("--interval-sec", type=int, default=3600)
    ap.add_argument("--heal", action="store_true", default=True, help="Auto-heal divergence (default on)")
    ap.add_argument("--no-heal", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-eval", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    heal = not args.no_heal
    once = args.once or not args.loop

    def cycle() -> int:
        result = run_once(heal=heal, dry_run=args.dry_run, run_eval=not args.no_eval)
        if args.json:
            print(json.dumps(result, indent=2, default=str))
        else:
            print(f"tinker-brain-continuous: {'OK' if result['ok'] else 'UNHEALTHY'}")
            print(f"  heal: {result['heal'].get('reason')} acted={result['heal'].get('acted')}")
            print(f"  card AS_OF={result['post'].get('asOf')} force={result['post'].get('effectiveCard')}")
            print(f"  billing ok={result['billing'].get('ok')} unitAmount={result['billing'].get('unitAmount')}")
            print(f"  funnel ok={result['funnel'].get('ok')} fails={result['funnel'].get('failStages')}")
            print(f"  agenda: {result['agendaPath']}")
            for a in (result.get("agenda") or {}).get("nextActions", [])[:6]:
                print(f"    → {a}")
            print(f"  eval ok={result['eval'].get('ok')} latency={result['latency_s']}s")
        return 0 if result["ok"] else 1

    if once:
        return cycle()

    # Loop mode for LaunchAgent / long-running operator.
    while True:
        code = cycle()
        # Never exit loop on unhealthy — journal + ntfy elsewhere; keep learning.
        _ = code
        time.sleep(max(60, int(args.interval_sec)))


if __name__ == "__main__":
    raise SystemExit(main())
