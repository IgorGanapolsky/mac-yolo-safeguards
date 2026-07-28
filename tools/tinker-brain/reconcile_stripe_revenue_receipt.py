#!/usr/bin/env python3
"""Reconcile Stripe → ~/.hermes/receipts/tinker-brain/revenue-receipt.json.

Fail-closed cash truth for tinker-brain: only non-owner paid invoice amounts
count as external revenue. Owner/test emails are classified separately and
never counted as revenue.

Key resolution (never logged):
  1. STRIPE_SECRET_KEY / STRIPE_API_KEY env
  2. TINKER_STRIPE_KEY_FILE path
  3. ~/.hermes/secrets/stripe_secret_key (single-line secret)
  4. apps/hermes-control-plane/.dev.vars or .env.local STRIPE_SECRET_KEY=

Without a key, exit 2 and write nothing (export keeps receipt_missing).
With a key, always write a receipt so $0 means "Stripe reconciled empty"
instead of "file missing."
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

REPO = Path(__file__).resolve().parents[2]
RECEIPTS_DIR = Path.home() / ".hermes" / "receipts" / "tinker-brain"
DEFAULT_RECEIPT = RECEIPTS_DIR / "revenue-receipt.json"
STRIPE_API = "https://api.stripe.com/v1"

# Owner / dogfood / test identities — never external revenue.
DEFAULT_OWNER_EMAILS = frozenset(
    {
        "iganapolsky@gmail.com",
        "ig5973700@gmail.com",
        "igor@thumbgate.app",
        "igor@thumbgate.ai",
        "test@example.com",
        "owner@example.com",
    }
)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _read_secret_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    try:
        raw = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    if not raw:
        return None
    # Allow KEY=value or bare secret
    if "=" in raw.splitlines()[0] and not raw.startswith("sk_"):
        for line in raw.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("STRIPE_SECRET_KEY=") or line.startswith("STRIPE_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
        return None
    return raw.splitlines()[0].strip()


def resolve_stripe_key(
    *,
    env: dict[str, str] | None = None,
    repo: Path = REPO,
) -> tuple[str | None, str]:
    """Return (key_or_none, source_label). Never returns the key in source_label alone."""
    env = env if env is not None else dict(os.environ)
    for name in ("STRIPE_SECRET_KEY", "STRIPE_API_KEY"):
        val = (env.get(name) or "").strip()
        if val.startswith("sk_"):
            return val, f"env:{name}"
    explicit = (env.get("TINKER_STRIPE_KEY_FILE") or "").strip()
    if explicit:
        key = _read_secret_file(Path(explicit).expanduser())
        if key and key.startswith("sk_"):
            return key, "file:TINKER_STRIPE_KEY_FILE"
    hermes_secret = Path.home() / ".hermes" / "secrets" / "stripe_secret_key"
    key = _read_secret_file(hermes_secret)
    if key and key.startswith("sk_"):
        return key, "file:~/.hermes/secrets/stripe_secret_key"
    for rel in (
        "apps/hermes-control-plane/.dev.vars",
        "apps/hermes-control-plane/.env.local",
        "apps/hermes-control-plane/.env",
    ):
        key = _read_secret_file(repo / rel)
        if key and key.startswith("sk_"):
            return key, f"file:{rel}"
    return None, "none"


def owner_email_set(env: dict[str, str] | None = None) -> set[str]:
    env = env if env is not None else dict(os.environ)
    emails = set(DEFAULT_OWNER_EMAILS)
    extra = (env.get("TINKER_OWNER_EMAILS") or env.get("STRIPE_OWNER_EMAILS") or "").strip()
    if extra:
        for part in re.split(r"[\s,;]+", extra):
            if part and "@" in part:
                emails.add(part.strip().lower())
    return {e.lower() for e in emails}


def _basic_auth_header(secret: str) -> str:
    token = base64.b64encode(f"{secret}:".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def stripe_get(
    path: str,
    secret: str,
    params: dict[str, Any] | None = None,
    *,
    timeout: float = 20.0,
    opener: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    """GET Stripe API path. opener is urllib.request.urlopen or a test double."""
    query = urllib.parse.urlencode(params or {}, doseq=True)
    url = f"{STRIPE_API}{path}" + (f"?{query}" if query else "")
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": _basic_auth_header(secret),
            "Accept": "application/json",
            "User-Agent": "tinker-brain-stripe-reconcile/1 (+https://thumbgate.app)",
        },
        method="GET",
    )
    open_fn = opener or urllib.request.urlopen
    with open_fn(req, timeout=timeout) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    if not isinstance(body, dict):
        raise RuntimeError("stripe_non_object")
    return body


def _customer_email(customer: Any) -> str | None:
    if isinstance(customer, dict):
        email = customer.get("email") or customer.get("name")
        if isinstance(email, str) and "@" in email:
            return email.strip().lower()
        return None
    return None


def fetch_paid_invoice_totals(
    secret: str,
    *,
    owners: set[str],
    limit: int = 100,
    max_pages: int = 5,
    opener: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    """Sum amount_paid on paid invoices; split owner vs external by customer email."""
    external = 0
    owner = 0
    external_count = 0
    owner_count = 0
    unknown_count = 0
    starting_after: str | None = None
    pages = 0
    sample_external: list[str] = []

    while pages < max_pages:
        params: dict[str, Any] = {
            "status": "paid",
            "limit": min(limit, 100),
            "expand[]": "data.customer",
        }
        if starting_after:
            params["starting_after"] = starting_after
        body = stripe_get("/invoices", secret, params, opener=opener)
        data = body.get("data") if isinstance(body.get("data"), list) else []
        if not data:
            break
        for inv in data:
            if not isinstance(inv, dict):
                continue
            try:
                paid = int(inv.get("amount_paid") or 0)
            except (TypeError, ValueError):
                paid = 0
            if paid <= 0:
                continue
            email = _customer_email(inv.get("customer"))
            if email and email in owners:
                owner += paid
                owner_count += 1
            elif email:
                external += paid
                external_count += 1
                if len(sample_external) < 5:
                    # domain-only sample — never store full email in receipt
                    domain = email.split("@", 1)[-1]
                    sample_external.append(domain)
            else:
                # No email: fail-closed treat as owner/test (never invent external cash)
                owner += paid
                owner_count += 1
                unknown_count += 1
        pages += 1
        if not body.get("has_more"):
            break
        last_id = data[-1].get("id") if isinstance(data[-1], dict) else None
        if not last_id:
            break
        starting_after = str(last_id)

    return {
        "external_net_cents": external,
        "owner_test_net_cents": owner,
        "external_invoice_count": external_count,
        "owner_invoice_count": owner_count,
        "unknown_email_invoice_count": unknown_count,
        "external_customer_domains_sample": sample_external,
        "pages_scanned": pages,
    }


def build_receipt(
    totals: dict[str, Any],
    *,
    key_source: str,
    reconciled_at: str | None = None,
) -> dict[str, Any]:
    return {
        "schema_version": "tinker-brain-revenue-receipt/1",
        "external_net_cents": int(totals.get("external_net_cents") or 0),
        "owner_test_net_cents": int(totals.get("owner_test_net_cents") or 0),
        "reconciled_at": reconciled_at or utc_now(),
        "source": "stripe_reconciliation",
        "verified": True,
        "key_source": key_source,
        "method": "paid_invoices_amount_paid",
        "external_invoice_count": int(totals.get("external_invoice_count") or 0),
        "owner_invoice_count": int(totals.get("owner_invoice_count") or 0),
        "unknown_email_invoice_count": int(totals.get("unknown_email_invoice_count") or 0),
        "external_customer_domains_sample": list(
            totals.get("external_customer_domains_sample") or []
        ),
        "pages_scanned": int(totals.get("pages_scanned") or 0),
        "unit": "US cents; divide by 100 for USD",
        "rule": "external = non-owner paid invoices only; owner/test never revenue",
    }


def write_receipt(path: Path, receipt: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(receipt, indent=2, sort_keys=True) + "\n"
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(raw, encoding="utf-8")
    tmp.chmod(0o600)
    os.replace(tmp, path)
    path.chmod(0o600)


def reconcile(
    *,
    out: Path = DEFAULT_RECEIPT,
    env: dict[str, str] | None = None,
    repo: Path = REPO,
    opener: Callable[..., Any] | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Run reconciliation. Returns machine-readable result (no secrets)."""
    key, key_source = resolve_stripe_key(env=env, repo=repo)
    if not key:
        return {
            "ok": False,
            "error": "stripe_key_unavailable",
            "key_source": key_source,
            "written": False,
            "path": str(out),
            "hint": (
                "Set STRIPE_SECRET_KEY (or STRIPE_API_KEY), or write the key to "
                "~/.hermes/secrets/stripe_secret_key, then re-run reconcile."
            ),
        }
    owners = owner_email_set(env)
    try:
        totals = fetch_paid_invoice_totals(key, owners=owners, opener=opener)
    except urllib.error.HTTPError as exc:
        return {
            "ok": False,
            "error": f"stripe_http_{exc.code}",
            "key_source": key_source,
            "written": False,
            "path": str(out),
        }
    except Exception as exc:  # noqa: BLE001 — never break callers with raw secrets
        return {
            "ok": False,
            "error": type(exc).__name__,
            "key_source": key_source,
            "written": False,
            "path": str(out),
        }
    receipt = build_receipt(totals, key_source=key_source)
    if not dry_run:
        write_receipt(out, receipt)
    return {
        "ok": True,
        "written": not dry_run,
        "path": str(out),
        "key_source": key_source,
        "external_net_cents": receipt["external_net_cents"],
        "owner_test_net_cents": receipt["owner_test_net_cents"],
        "external_invoice_count": receipt["external_invoice_count"],
        "owner_invoice_count": receipt["owner_invoice_count"],
        "reconciled_at": receipt["reconciled_at"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_RECEIPT)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = reconcile(out=args.out, dry_run=args.dry_run)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result.get("ok") else 2


if __name__ == "__main__":
    raise SystemExit(main())
