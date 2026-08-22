#!/usr/bin/env python3
"""Read-only Gmail helper for Meta glasses / Hermes bridge.

Uses ~/.hermes/google_token.json (iganapolsky@gmail.com). Never prints tokens.
Default: inbox metadata only. Never send.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

TOKEN = os.path.expanduser("~/.hermes/google_token.json")
_VENV_SITE = os.path.expanduser(
    "~/.hermes/venvs/google-workspace/lib/python3.12/site-packages"
)
if os.path.isdir(_VENV_SITE) and _VENV_SITE not in sys.path:
    sys.path.insert(0, _VENV_SITE)


def _svc():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    creds = Credentials.from_authorized_user_file(TOKEN)
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN, "w") as f:
                f.write(creds.to_json())
        else:
            raise RuntimeError("gmail token invalid and cannot refresh")
    return build("gmail", "v1", credentials=creds)


def inbox(n: int = 5, query: str = "in:inbox") -> dict:
    svc = _svc()
    prof = svc.users().getProfile(userId="me").execute()
    listing = svc.users().messages().list(userId="me", maxResults=n, q=query).execute()
    msgs = []
    for m in listing.get("messages", []):
        msg = (
            svc.users()
            .messages()
            .get(
                userId="me",
                id=m["id"],
                format="metadata",
                metadataHeaders=["From", "To", "Subject", "Date"],
            )
            .execute()
        )
        hdrs = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
        msgs.append(
            {
                "id": m["id"],
                "from": hdrs.get("From", ""),
                "subject": hdrs.get("Subject", ""),
                "date": hdrs.get("Date", ""),
                "snippet": (msg.get("snippet") or "")[:160],
            }
        )
    return {
        "ok": True,
        "email": prof.get("emailAddress"),
        "messagesTotal": prof.get("messagesTotal"),
        "threadsTotal": prof.get("threadsTotal"),
        "query": query,
        "messages": msgs,
        "note": "Hermes Gmail rail (iganapolsky@gmail.com). Meta AI Apps connector is separate.",
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--n", type=int, default=5)
    p.add_argument("--query", default="in:inbox")
    args = p.parse_args()
    try:
        print(json.dumps(inbox(args.n, args.query), ensure_ascii=False))
        return 0
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
