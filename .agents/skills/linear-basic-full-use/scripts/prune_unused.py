#!/usr/bin/env python3
"""Delete unused Linear labels + empty stale projects. --apply required to mutate.

Split queries (never nest labels→issues(first:N) for N>5 across 250 labels —
Linear returns QUERY_TOO_COMPLEX ~29k). Session-slug labels delete only when
empty or every attached issue is completed/canceled. Live started locks stay.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

KEY = pathlib.Path.home().joinpath(".config/linear/api_key").read_text().strip()
TEL = re.compile(r"^(pr_merge_time:|duration:|pr_open_to_green:)")
SESSION = re.compile(
    r"^agent-(codex|hermes|cursor|grok|claude-code|antigravity|jcode)-.+",
    re.I,
)
CANONICAL = {
    "agent-lock",
    "agent-grok",
    "agent-codex",
    "agent-claude-code",
    "agent-cursor",
    "agent-antigravity",
    "agent-hermes",
    "agent-Hermes",
    "agent-jcode",
    "agents-multi",
    "status:agent-working",
    "Bug",
    "Feature",
    "Improvement",
}
STALE_PROJECT_SUBSTR = (
    "Storefront Debugging",
    "Agentic Personas Storefront",
    "Interview — Agentic",
    "Interview — Agentic Personas",
)


def gql(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        "https://api.linear.app/graphql",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": KEY},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"errors": [{"message": raw[:800], "http": e.code}]}


def label_issues(label_id: str):
    r = gql(
        "query($id:String!){ issueLabel(id:$id){ issues(first:25){ nodes { identifier state { type } } } } }",
        {"id": label_id},
    )
    if r.get("errors"):
        return [], r["errors"]
    nodes = (
        (((r.get("data") or {}).get("issueLabel") or {}).get("issues") or {}).get(
            "nodes"
        )
    ) or []
    return nodes, None


def project_issues(project_id: str):
    r = gql(
        """
      query($id: ID!) {
        issues(filter: { project: { id: { eq: $id } } }, includeArchived: true, first: 5) {
          nodes { identifier state { type } }
        }
      }
    """,
        {"id": project_id},
    )
    if r.get("errors"):
        return [], r["errors"]
    return (((r.get("data") or {}).get("issues") or {}).get("nodes")) or [], None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument(
        "--receipt",
        default="/tmp/linear-basic-prune-receipt.json",
        help="JSON receipt path",
    )
    args = ap.parse_args()
    receipt = {
        "when": datetime.now(timezone.utc).isoformat(),
        "apply": args.apply,
        "projects_deleted": [],
        "projects_kept": [],
        "labels_deleted": [],
        "labels_kept_open": [],
        "app_users": [],
        "errors": [],
    }

    # --- projects: trashed empty OR stale-named empty backlog duplicates ---
    pd = gql(
        "{ projects(includeArchived:true, first:100){ nodes { id name state trashed } } }"
    )
    if pd.get("errors"):
        receipt["errors"].append(pd["errors"])
        print("ERR projects", json.dumps(pd["errors"])[:400])
    else:
        for p in pd["data"]["projects"]["nodes"]:
            name = p["name"]
            stale = any(s in name for s in STALE_PROJECT_SUBSTR)
            trashed = bool(p.get("trashed"))
            # duplicate Cortiqa backlog while completed sibling exists
            cortiqa_dup = name == "Cortiqa Engagement" and p.get("state") == "backlog"
            if not (trashed or (stale and p.get("state") in ("backlog", "canceled")) or cortiqa_dup):
                continue
            issues, err = project_issues(p["id"])
            if err:
                receipt["errors"].append(err)
                continue
            openish = [
                i
                for i in issues
                if (i.get("state") or {}).get("type") not in ("completed", "canceled")
            ]
            if openish:
                receipt["projects_kept"].append(
                    {
                        "name": name,
                        "open": [x["identifier"] for x in openish],
                    }
                )
                print("KEEP project", name, [x["identifier"] for x in openish])
                continue
            if issues and not trashed and not cortiqa_dup:
                # has terminal history and not trashed — keep unless stale empty
                if not stale:
                    receipt["projects_kept"].append(
                        {"name": name, "reason": "has-issues"}
                    )
                    continue
            print("candidate project", name, "trashed="+str(trashed), "issues", len(issues))
            if args.apply:
                r = gql(
                    "mutation($id:String!){ projectDelete(id:$id){ success } }",
                    {"id": p["id"]},
                )
                ok = bool(
                    r.get("data")
                    and r["data"].get("projectDelete", {}).get("success")
                )
                if not ok and r.get("errors") and "not found" in json.dumps(r["errors"]).lower():
                    ok = True
                print("DEL" if ok else "FAIL", "project", name)
                receipt["projects_deleted"].append(
                    {"name": name, "id": p["id"], "ok": ok}
                )
                time.sleep(0.05)

    # --- labels (slim list + per-label issue probe) ---
    labs = gql(
        "{ issueLabels(first:250){ nodes { id name team { key } } } }"
    )
    if labs.get("errors"):
        receipt["errors"].append(labs["errors"])
        print("ERR labels", json.dumps(labs["errors"])[:400])
        pathlib.Path(args.receipt).write_text(json.dumps(receipt, indent=2))
        raise SystemExit(1)

    targets = []
    for lab in labs["data"]["issueLabels"]["nodes"]:
        name = lab["name"]
        if name in CANONICAL:
            continue
        team = (lab.get("team") or {}).get("key")
        issues, err = label_issues(lab["id"])
        if err:
            receipt["errors"].append({"label": name, "errors": err})
            continue
        openish = [
            i
            for i in issues
            if (i.get("state") or {}).get("type") not in ("completed", "canceled")
        ]
        empty = not issues
        closed_only = bool(issues) and not openish
        reason = None
        if TEL.match(name):
            reason = "telemetry"
        elif SESSION.match(name) and (empty or closed_only):
            reason = "closed-session" if closed_only else "empty-session"
        elif empty and not (
            team == "AGENT" and name.startswith(("agent-", "agent:", "status:", "agents-"))
        ):
            reason = "empty"
        if reason:
            targets.append((lab, reason, len(issues)))
        elif SESSION.match(name) and openish:
            receipt["labels_kept_open"].append(
                {
                    "name": name,
                    "open": [
                        f"{i['identifier']}:{(i.get('state') or {}).get('type')}"
                        for i in openish
                    ],
                }
            )

    print("label candidates", len(targets))
    for lab, reason, n in targets:
        print(" ", (lab.get("team") or {}).get("key"), lab["name"], reason, f"issues={n}")
    print("labels_kept_open", len(receipt["labels_kept_open"]))

    if not args.apply:
        print("dry-run; pass --apply to delete")
    else:
        for lab, reason, n in targets:
            r = gql(
                "mutation($id:String!){ issueLabelDelete(id:$id){ success } }",
                {"id": lab["id"]},
            )
            ok = bool(
                r.get("data") and r["data"].get("issueLabelDelete", {}).get("success")
            )
            if not ok and r.get("errors") and "not found" in json.dumps(r["errors"]).lower():
                ok = True
            print("DEL" if ok else "FAIL", lab["name"], reason)
            receipt["labels_deleted"].append(
                {"name": lab["name"], "reason": reason, "ok": ok, "issue_count": n}
            )
            time.sleep(0.04)

    users = gql(
        "{ users(includeDisabled:true, first:50){ nodes { name active app createdIssueCount assignedIssueCount } } }"
    )
    for u in ((users.get("data") or {}).get("users") or {}).get("nodes") or []:
        if u.get("app"):
            receipt["app_users"].append(u)
            print(
                "APP_USER",
                u["name"],
                "active="+str(u["active"]),
                "created="+str(u.get("createdIssueCount")),
                "assigned="+str(u.get("assignedIssueCount")),
            )
            if (
                not u.get("active")
                and (u.get("createdIssueCount") or 0) == 0
                and (u.get("assignedIssueCount") or 0) == 0
                and u["name"] not in ("Linear", "Linear Agent")
            ):
                print(
                    "NOTE app user inactive — API cannot delete; revoke OAuth in Linear UI if desired:",
                    u["name"],
                )

    pathlib.Path(args.receipt).write_text(json.dumps(receipt, indent=2))
    print("RECEIPT", args.receipt)
    print(
        "SUMMARY projects_deleted",
        len(receipt["projects_deleted"]),
        "labels_deleted",
        len(receipt["labels_deleted"]),
        "labels_kept_open",
        len(receipt["labels_kept_open"]),
    )


if __name__ == "__main__":
    main()
