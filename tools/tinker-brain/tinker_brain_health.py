#!/usr/bin/env python3
"""Self-healing checks for tinker-brain: staleness, source divergence, coverage gaps.

Why this exists, and what it deliberately does NOT do
-----------------------------------------------------
tinker-brain's value is that it is deterministic and fail-closed. It refuses to invent
numbers. That property is worth more than fluency. This module adds no model and no
embedding. Observed production failures were:

  1. THE CARD WENT STALE — competitive picture moved while AS_OF_RESEARCH sat still.
  2. TWO SOURCES SILENTLY DIVERGED — snapshot preferred at runtime over repo card.
  3. IT COULD NOT SAY "I DON'T KNOW" — fixed by coverage.py; this logs the misses.

Self-healing means: detect loudly, and with --heal re-export so snapshot == repo.

Usage:
    python3 tools/tinker-brain/tinker_brain_health.py [--json] [--max-age-days 14]
    python3 tools/tinker-brain/tinker_brain_health.py --heal
    python3 tools/tinker-brain/tinker_brain_health.py --log-gap "question text"
Exit: 0 healthy · 1 unhealthy (stale or diverged) · 2 heal failed
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_REPO_CARD = _REPO_ROOT / "config" / "THUMBGATE_EXPERT_CARD.txt"
_SNAPSHOT_CARD = (
    Path.home() / ".hermes" / "business-brain" / "data-snapshot" / "THUMBGATE_EXPERT_CARD.txt"
)
# Private receipts only — never write user questions into the public repo tree
# (customer names / credentials must not land in a later broad commit).
_GAP_LOG = Path.home() / ".hermes" / "receipts" / "tinker-brain" / "coverage-gaps.jsonl"
_EXPORTER = Path(__file__).resolve().parent / "export_tinker_brain_snapshot.py"

_AS_OF = re.compile(r"AS_OF[_A-Z]*\s*:?\s*(\d{4}-\d{2}-\d{2})")


def _digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def _as_of(text: str) -> str | None:
    m = _AS_OF.search(text or "")
    return m.group(1) if m else None


def check(max_age_days: int = 14) -> dict:
    findings: list[dict] = []

    repo = _REPO_CARD.read_text(encoding="utf-8") if _REPO_CARD.is_file() else None
    snap = _SNAPSHOT_CARD.read_text(encoding="utf-8") if _SNAPSHOT_CARD.is_file() else None

    if repo is None and snap is None:
        findings.append(
            {
                "severity": "fail",
                "check": "card-missing",
                "detail": "No expert card at either the snapshot or repo path.",
            }
        )
        return {"ok": False, "findings": findings, "effectiveCard": None, "asOf": None}

    if repo is not None and snap is not None and _digest(repo) != _digest(snap):
        findings.append(
            {
                "severity": "fail",
                "check": "source-divergence",
                "detail": (
                    f"Snapshot and repo cards differ (snapshot {_digest(snap)} vs "
                    f"repo {_digest(repo)}). load_expert_card() prefers the SNAPSHOT."
                ),
                "fix": (
                    "python3 tools/tinker-brain/tinker_brain_health.py --heal  "
                    "# or: python3 tools/tinker-brain/export_tinker_brain_snapshot.py"
                ),
            }
        )

    effective = snap if snap is not None else repo
    effective_name = "snapshot" if snap is not None else "repo"
    as_of = _as_of(effective or "")
    if not as_of:
        findings.append(
            {
                "severity": "warn",
                "check": "no-as-of",
                "detail": f"No AS_OF date in the {effective_name} card.",
            }
        )
    else:
        age = (
            datetime.now(timezone.utc)
            - datetime.fromisoformat(as_of).replace(tzinfo=timezone.utc)
        ).days
        if age > max_age_days:
            findings.append(
                {
                    "severity": "fail",
                    "check": "stale-card",
                    "detail": (
                        f"{effective_name} card is {age} days old "
                        f"(AS_OF {as_of}, limit {max_age_days})."
                    ),
                    "fix": (
                        "Update config/THUMBGATE_EXPERT_CARD.txt research, then --heal."
                    ),
                }
            )

    gaps = read_gaps()
    if gaps:
        top = sorted(gaps.items(), key=lambda kv: -kv[1])[:5]
        findings.append(
            {
                "severity": "info",
                "check": "coverage-gaps",
                "detail": f"{sum(gaps.values())} logged questions the card could not answer.",
                "agenda": [{"term": t, "misses": n} for t, n in top],
            }
        )

    return {
        "ok": not any(f["severity"] == "fail" for f in findings),
        "effectiveCard": effective_name,
        "asOf": as_of,
        "findings": findings,
        "repoDigest": _digest(repo) if repo else None,
        "snapshotDigest": _digest(snap) if snap else None,
    }


def heal() -> dict:
    """Re-export snapshot so expert card + ANSWER_CARD match the repo + live APIs."""
    if not _EXPORTER.is_file():
        return {"ok": False, "error": f"exporter missing: {_EXPORTER}"}
    try:
        proc = subprocess.run(
            [sys.executable, str(_EXPORTER)],
            cwd=str(_REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"ok": False, "error": str(exc)}
    post = check()
    return {
        "ok": post["ok"] and proc.returncode == 0,
        "export_exit": proc.returncode,
        "export_stdout": (proc.stdout or "")[-800:],
        "export_stderr": (proc.stderr or "")[-400:],
        "post_check": post,
    }


def log_gap(question: str, missing: list[str] | None = None) -> None:
    _GAP_LOG.parent.mkdir(parents=True, exist_ok=True)
    rec = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "question": question,
        "missing": missing or [],
    }
    with _GAP_LOG.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec) + "\n")


def read_gaps() -> dict[str, int]:
    if not _GAP_LOG.is_file():
        return {}
    counts: dict[str, int] = {}
    for line in _GAP_LOG.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except ValueError:
            continue
        for term in rec.get("missing", []):
            counts[term] = counts.get(term, 0) + 1
    return counts


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--max-age-days", type=int, default=14)
    ap.add_argument("--log-gap")
    ap.add_argument("--missing", nargs="*", default=[])
    ap.add_argument(
        "--heal",
        action="store_true",
        help="Re-export snapshot to clear source-divergence, then re-check.",
    )
    args = ap.parse_args()

    if args.log_gap:
        log_gap(args.log_gap, args.missing)
        print(f"logged coverage gap: {args.log_gap[:70]}")
        return 0

    if args.heal:
        result = heal()
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"tinker-brain-health heal: {'OK' if result.get('ok') else 'FAILED'}")
            if result.get("error"):
                print(f"  error: {result['error']}")
            post = result.get("post_check") or {}
            print(f"  post: ok={post.get('ok')} card={post.get('effectiveCard')} asOf={post.get('asOf')}")
            for f in post.get("findings") or []:
                print(f"  [{f['severity'].upper()}] {f['check']}: {f['detail']}")
        return 0 if result.get("ok") else 2

    result = check(args.max_age_days)
    if args.json:
        print(json.dumps(result, indent=2))
        return 0 if result["ok"] else 1

    print(f"tinker-brain-health: {'OK' if result['ok'] else 'UNHEALTHY'}")
    print(f"  card in force: {result.get('effectiveCard')} (AS_OF {result.get('asOf')})")
    for f in result["findings"]:
        print(f"  [{f['severity'].upper()}] {f['check']}: {f['detail']}")
        if f.get("fix"):
            print(f"          fix: {f['fix']}")
        for item in f.get("agenda", []):
            print(f"          gap: {item['term']} ({item['misses']} misses)")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
