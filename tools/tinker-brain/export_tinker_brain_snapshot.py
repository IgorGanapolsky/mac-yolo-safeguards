#!/usr/bin/env python3
"""Export one atomic ThumbGate.app revenue snapshot for tinker-brain.

ThumbGate-native since 2026-07-28 (no skool_top1percent dependency). Evidence:
- live https://thumbgate.app/api/health and /api/billing/plan readbacks
  (fail-soft: unreachable is recorded as unreachable, never invented)
- optional local receipts: ~/.hermes/receipts/tinker-brain/revenue-receipt.json
  (Stripe reconciliation written by a separate process) and
  ~/.hermes/receipts/thumbgate-aeo/latest.json (weekly AEO monitor)
- the scorecard from tools/ml-system-scores.js (SYSTEM_SCORES)
- the GTM expert card at config/THUMBGATE_EXPERT_CARD.txt (shipped alongside
  the ANSWER_CARD so answers stay atomic with the export)

Fail-closed: no revenue receipt means external cash is $0 — never invented, and
no scorecard means not_scored. Every piece of evidence is gathered into the
snapshot payload; write_snapshot() only serialises what the payload already
carries, so an export is reproducible from its own evidence.
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
DEFAULT_OUT = (
    Path.home() / ".hermes" / "business-brain" / "data-snapshot" / "business_snapshot.json"
)
HEALTH_URL = "https://thumbgate.app/api/health"
BILLING_URL = "https://thumbgate.app/api/billing/plan"
PROBE_TIMEOUT_S = 2.0


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


FUNNEL_KEYS = (
    "landingViewsToday",
    "signInClicksToday",
    "cloudContinuityClicksToday",
    "loginsLast24h",
    "pairingsLast24h",
    "checkoutCreatedLast24h",
    "usersTotal",
    "paidOrganizationsTotal",
)


def extract_funnel(body: dict[str, Any]) -> dict[str, Any]:
    """Pull live funnel counters out of /api/health.

    The endpoint was already being probed, but only `status` was kept and the whole
    `telemetry` block was discarded — so the brain could say "external revenue is $0"
    while being structurally unable to see WHY. On 2026-07-30 the decisive numbers were
    landingViewsToday=12 with signInClicksToday=0: traffic arrived and converted nothing.
    No card carried that, so "ship another campaign beat" kept coming back as the next
    action when the page, not the traffic, was the binding constraint.

    Absent/unreachable telemetry yields present=False rather than zeros — a zero here
    means "measured zero", and must never be manufactured from a failed probe.
    """
    telemetry = body.get("telemetry")
    if not isinstance(telemetry, dict):
        return {"present": False}
    funnel: dict[str, Any] = {"present": True}
    for key in FUNNEL_KEYS:
        value = telemetry.get(key)
        funnel[key] = value if isinstance(value, int) else None
    return funnel


def funnel_read(funnel: dict[str, Any]) -> str:
    """One honest sentence about where the funnel is actually stuck."""
    if not funnel.get("present"):
        return "Funnel telemetry unavailable — do not infer conversion health."
    views = funnel.get("landingViewsToday")
    signins = funnel.get("signInClicksToday")
    if views is None or signins is None:
        return "Funnel telemetry incomplete — do not infer conversion health."
    if views == 0:
        return "No landing views today: the constraint is reach, not the page."
    if signins == 0:
        return (
            f"{views} landing view(s) today and 0 sign-in clicks: arrivals convert at zero, "
            "so the page/offer is the live constraint — more distribution amplifies nothing."
        )
    return f"{views} landing view(s) today, {signins} sign-in click(s): both reach and conversion are non-zero."


def probe_health() -> dict[str, Any]:
    result = probe_json(HEALTH_URL)
    body = result.get("body") or {}
    funnel = extract_funnel(body)
    return {
        "ok": bool(result["ok"]),
        "status": str(body.get("status") or body.get("ok") or ("up" if result["ok"] else "unreachable")),
        "error": result.get("error"),
        "url": HEALTH_URL,
        "funnel": funnel,
        "funnel_read": funnel_read(funnel),
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


def _unscored(reason: str) -> dict[str, Any]:
    """Fail-closed scorecard: say not_scored rather than imply a grade."""
    return {"line": f"not_scored ({reason})", "source": "unavailable"}


def read_system_scores() -> dict[str, Any]:
    """Evidence-backed scores from tools/ml-system-scores.js; never invent.

    This is the live gather, so only the production export path (main()) calls
    it. Everything else — tests, replays, any rebuild from recorded evidence —
    passes a scorecard into build_snapshot() instead, exactly like the health,
    billing, revenue and AEO evidence.
    """
    script = REPO / "tools" / "ml-system-scores.js"
    if not script.is_file():
        return _unscored(
            "tools/ml-system-scores.js missing; eval receipts at "
            "~/.hermes/receipts/tinker-brain/ are the quality signal"
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
                return {"line": line.strip(), "source": "ml-system-scores.js"}
    except Exception:  # noqa: BLE001 — export must never die on scores
        pass
    # Fall back to the last written scorecard receipt.
    cached = load_json(Path.home() / ".hermes" / "ml" / "system-scores.json")
    line = cached.get("system_scores_line")
    if isinstance(line, str) and line.strip():
        return {"line": f"{line.strip()} (cached)", "source": "system-scores-receipt"}
    return _unscored("ml-system-scores failed; run node tools/ml-system-scores.js --write")


def build_snapshot(
    *,
    health: dict[str, Any] | None = None,
    billing: dict[str, Any] | None = None,
    revenue: dict[str, Any] | None = None,
    aeo: dict[str, Any] | None = None,
    system_scores: dict[str, Any] | None = None,
) -> dict[str, Any]:
    health = health if health is not None else probe_health()
    billing = billing if billing is not None else probe_billing()
    revenue = revenue if revenue is not None else load_revenue_receipt()
    aeo = aeo if aeo is not None else aeo_summary()
    system_scores = (
        system_scores
        if system_scores is not None
        else _unscored("no scorecard supplied; run node tools/ml-system-scores.js --write")
    )

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

    # The next money action has to follow the funnel, not a fixed script. Before this,
    # the card unconditionally recommended shipping another campaign beat — which on
    # 2026-07-30 put three mutually contradictory lines next to each other in one answer:
    # WHY_ZERO said "the lever is distribution", FUNNEL_STATE said "more distribution
    # amplifies nothing", and NEXT_MONEY said "ship another beat". Six campaigns had
    # already returned zero attributed funnel hits by then.
    funnel = health.get("funnel") or {}
    views = funnel.get("landingViewsToday") if funnel.get("present") else None
    signins = funnel.get("signInClicksToday") if funnel.get("present") else None
    distribution_beat = (
        "Ship today's ThumbGate.app campaign beat (one persona + one pain + cited evidence + "
        "hook) across the fan-out matrix with verified permalinks; recruit toward 3 Continuity "
        "design partners; check the AEO monitor weekly. Reddit stays draft-only under the burn "
        "rule. Cash counts only on a non-owner Stripe subscription payment."
    )
    if isinstance(views, int) and isinstance(signins, int) and views > 0 and signins == 0:
        next_money = (
            f"Do NOT ship another distribution beat yet: {views} arrival(s) today converted 0 "
            "sign-in clicks, so added reach multiplies a zero. Fix the landing/offer step first "
            "(what the visitor sees before sign-in), then re-read /api/health and confirm "
            "signInClicksToday moved off zero before spending on reach again. Direct 1:1 contact "
            "with a named human who has the pain still counts — that path does not depend on the "
            "landing page converting. Cash counts only on a non-owner Stripe subscription payment."
        )
    else:
        next_money = distribution_beat

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
        "system_scores": system_scores,
        "aeo_monitor": aeo,
        "next_money_action": next_money,
        "visibility_limits": [
            "This snapshot is not live after export; check exported_at / SNAPSHOT_TIME.",
            "Cash truth is only as fresh as the local revenue receipt; Stripe is canonical.",
            "AEO receipt is a citation proxy, not real AI Overview telemetry.",
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
    scores = payload.get("system_scores") or {}
    scores_line = str(scores.get("line") or _unscored("snapshot carries no scorecard")["line"])
    aeo_line = (
        f"present=true; checked_at={aeo.get('checked_at')}"
        if aeo.get("present")
        else "present=false; run tools/thumbgate-aeo-monitor.js weekly"
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
                # tinker_brain_answer.py has read FUNNEL_STATE since it was written, but
                # nothing ever emitted it — a display with no source. Without this the
                # brain can report "$0 external" while being blind to whether the funnel
                # is starved of traffic or converting arrivals at zero, which are opposite
                # problems with opposite next actions.
                f"FUNNEL_STATE={health.get('funnel_read')}",
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
                f"SYSTEM_SCORES={scores_line}",
                "SCORE_SCOPE=copy SYSTEM_SCORES exactly; do not invent better grades than the line",
                f"NEXT_MONEY={payload.get('next_money_action')}",
                "RULE: zero tools; do not list_files; answer now from this card.",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    card.chmod(0o600)

    if EXPERT_SRC.is_file():
        expert_dst = out.parent / "THUMBGATE_EXPERT_CARD.txt"
        try:
            shutil.copyfile(EXPERT_SRC, expert_dst)
            expert_dst.chmod(0o600)
        except OSError:
            pass  # answer path falls back to the repo copy


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
    payload = build_snapshot(system_scores=read_system_scores())
    write_snapshot(out, payload)
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
                "system_scores_source": payload["system_scores"].get("source"),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
