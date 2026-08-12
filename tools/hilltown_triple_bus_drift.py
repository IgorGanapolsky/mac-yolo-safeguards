#!/usr/bin/env python3
"""
Hilltown / YourStage triple-bus drift audit (read-mostly; vault Drift.md writer).

Authority map (fail-closed):
  Money  → Resume ERP milestone_master_map.json + Upwork txs (not GH labels)
  Product → GitHub HilltownMedia/YourStageTickets
  Locks  → Linear AGENT issues (optional project Hilltown / YourStage)
  Narrative → Obsidian Projects/YourStageTickets/

Does NOT: send Upwork messages, merge PRs, invent paid status from Linear Done.
Exit 0 always for LaunchAgent health unless --strict (then exit 1 on blockers).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

VAULT = Path.home() / "Documents" / "AI-Agent-Sync"
YST = VAULT / "Projects" / "YourStageTickets"
DRIFT_MD = YST / "Drift.md"
DRIFT_JSON = YST / "Drift.json"
ERP_MAP = (
    Path.home()
    / "workspace/git/igor/Resume/applications/hilltown-media-group/erp/milestone_master_map.json"
)
GH_REPO = "HilltownMedia/YourStageTickets"
LINEAR_TEAM_KEY = "AGENT"
LINEAR_PROJECT_NAME = "Hilltown / YourStage"
# Linear issues that belong on the Hilltown project
LINEAR_HILLTOWN_IDS = (
    "AGENT-355",
    "AGENT-368",
    "AGENT-370",
    "AGENT-372",
    "AGENT-373",
    "AGENT-374",
    "AGENT-375",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run(cmd: list[str], timeout: int = 60) -> tuple[int, str, str]:
    try:
        p = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "PATH": "/opt/homebrew/bin:/usr/local/bin:" + os.environ.get("PATH", "")},
        )
        return p.returncode, p.stdout or "", p.stderr or ""
    except Exception as e:
        return 1, "", str(e)


def linear_key() -> str | None:
    k = os.environ.get("LINEAR_API_KEY")
    if k:
        return k.strip()
    p = Path.home() / ".config/linear/api_key"
    if p.is_file():
        return p.read_text().strip() or None
    rc, out, _ = run(
        ["security", "find-generic-password", "-s", "LINEAR_API_KEY", "-w"],
        timeout=10,
    )
    if rc == 0 and out.strip():
        return out.strip()
    return None


def linear_gql(key: str, query: str, variables: dict | None = None) -> dict:
    body = {"query": query}
    if variables is not None:
        body["variables"] = variables
    req = urllib.request.Request(
        "https://api.linear.app/graphql",
        data=json.dumps(body).encode(),
        headers={"Authorization": key, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read().decode())


def load_erp() -> dict[str, Any]:
    if not ERP_MAP.is_file():
        return {"error": f"missing {ERP_MAP}"}
    data = json.loads(ERP_MAP.read_text())
    out = {"milestones": {}, "raw_updated": data.get("updated_at")}
    for m in data.get("milestones") or []:
        sku = m.get("sku") or ""
        ums = m.get("upwork_ms")
        out["milestones"][sku] = m
        if ums is not None:
            out["milestones"][f"upwork_ms_{ums}"] = m
    return out


def gh_json(args: list[str]) -> Any:
    rc, out, err = run(["gh", *args], timeout=90)
    if rc != 0:
        return {"error": err or out or f"gh exit {rc}"}
    try:
        return json.loads(out) if out.strip() else {}
    except json.JSONDecodeError:
        return {"error": "json decode", "raw": out[:500]}


def collect_github() -> dict[str, Any]:
    issues = gh_json(
        [
            "issue",
            "list",
            "-R",
            GH_REPO,
            "--state",
            "open",
            "--limit",
            "50",
            "--json",
            "number,title,labels,updatedAt,state",
        ]
    )
    prs = gh_json(
        [
            "pr",
            "list",
            "-R",
            GH_REPO,
            "--state",
            "open",
            "--limit",
            "20",
            "--json",
            "number,title,isDraft,labels,updatedAt,url",
        ]
    )
    closed_109 = gh_json(
        [
            "issue",
            "view",
            "109",
            "-R",
            GH_REPO,
            "--json",
            "number,title,state,labels,closedAt",
        ]
    )
    open_78 = gh_json(
        [
            "issue",
            "view",
            "78",
            "-R",
            GH_REPO,
            "--json",
            "number,title,state,labels,updatedAt",
        ]
    )
    return {
        "open_issues": issues if isinstance(issues, list) else [],
        "open_prs": prs if isinstance(prs, list) else [],
        "issue_109": closed_109 if isinstance(closed_109, dict) else {},
        "issue_78": open_78 if isinstance(open_78, dict) else {},
        "errors": [x for x in (issues, prs) if isinstance(x, dict) and x.get("error")],
    }


def collect_linear(key: str | None) -> dict[str, Any]:
    if not key:
        return {"error": "no LINEAR_API_KEY"}
    # Search Hilltown/YourStage issues
    q = """
    query($term: String!) {
      searchIssues(term: $term, first: 30) {
        nodes {
          id identifier title url
          state { name type }
          project { id name }
          labels { nodes { name } }
        }
      }
    }
    """
    nodes = []
    for term in ("Hilltown", "YourStage", "waitlist M7"):
        try:
            d = linear_gql(key, q, {"term": term})
            for n in (d.get("data") or {}).get("searchIssues", {}).get("nodes") or []:
                if n["identifier"] not in {x["identifier"] for x in nodes}:
                    nodes.append(n)
        except Exception as e:
            return {"error": str(e), "nodes": nodes}
    # projects
    try:
        pd = linear_gql(
            key,
            """query {
              projects(first: 50) { nodes { id name state } }
              teams { nodes { id key } }
            }""",
        )
        projects = (pd.get("data") or {}).get("projects", {}).get("nodes") or []
        teams = (pd.get("data") or {}).get("teams", {}).get("nodes") or []
    except Exception as e:
        projects, teams = [], []
        return {"error": str(e), "nodes": nodes}
    hilltown_proj = next(
        (p for p in projects if "hilltown" in (p.get("name") or "").lower()),
        None,
    )
    return {
        "nodes": nodes,
        "projects": projects,
        "teams": teams,
        "hilltown_project": hilltown_proj,
    }


def vault_state_age() -> dict[str, Any]:
    state = YST / "State.md"
    logs = YST / "Logs.md"
    out: dict[str, Any] = {}
    for label, path in (("State.md", state), ("Logs.md", logs), ("Drift.md", DRIFT_MD)):
        if path.is_file():
            m = path.stat().st_mtime
            out[label] = {
                "path": str(path),
                "mtime_utc": datetime.fromtimestamp(m, tz=timezone.utc).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                ),
                "age_hours": round(
                    (datetime.now(timezone.utc).timestamp() - m) / 3600.0, 2
                ),
            }
        else:
            out[label] = {"missing": True}
    # extract last Sync timestamp from State
    if state.is_file():
        text = state.read_text(errors="replace")
        m = re.search(r"## Sync:\s*(\S+)", text)
        out["last_sync_heading"] = m.group(1) if m else None
    return out


def analyze(erp: dict, gh: dict, lin: dict, vault: dict) -> list[dict]:
    findings: list[dict] = []

    m7 = erp.get("milestones", {}).get("M7_AUTOMATED_WAITLIST_ENGINE") or erp.get(
        "milestones", {}
    ).get("upwork_ms_7")
    if not m7:
        findings.append(
            {
                "id": "ERP-M7-MISSING",
                "severity": "block",
                "surface": "erp",
                "detail": "M7_AUTOMATED_WAITLIST_ENGINE not in milestone_master_map.json",
            }
        )
    elif m7.get("status") != "PAID_DELIVERED":
        findings.append(
            {
                "id": "ERP-M7-STATUS",
                "severity": "block",
                "surface": "erp",
                "detail": f"M7 status is {m7.get('status')!r}, expected PAID_DELIVERED",
            }
        )

    issue_78 = gh.get("issue_78") or {}
    labels_78 = {x.get("name") for x in (issue_78.get("labels") or []) if isinstance(x, dict)}
    if issue_78.get("state") == "OPEN":
        if "z-funding:proposed" in labels_78 or "z-funding:proposed" in str(labels_78):
            findings.append(
                {
                    "id": "GH-78-FUNDING-PROPOSED",
                    "severity": "block",
                    "surface": "github",
                    "detail": (
                        "GH #78 waitlist use-case still OPEN with z-funding:proposed "
                        "while ERP/Upwork M7 is PAID_DELIVERED and #109 is closed paid. "
                        "Label drift re-enables M11 double-bill risk."
                    ),
                }
            )
        if any("m6" in (n or "").lower() for n in labels_78):
            findings.append(
                {
                    "id": "GH-78-M6-LABEL",
                    "severity": "warn",
                    "surface": "github",
                    "detail": "GH #78 still labeled under internal M6 waitlist numbering; Upwork waitlist is M7.",
                }
            )

    issue_109 = gh.get("issue_109") or {}
    if issue_109.get("state") and issue_109.get("state") != "CLOSED":
        findings.append(
            {
                "id": "GH-109-NOT-CLOSED",
                "severity": "block",
                "surface": "github",
                "detail": f"Expected paid waitlist milestone #109 CLOSED, got {issue_109.get('state')}",
            }
        )

    # Door #110 open + paid label
    for iss in gh.get("open_issues") or []:
        if iss.get("number") == 110:
            labs = {x.get("name") for x in (iss.get("labels") or [])}
            if "z-funding:paid" in labs:
                findings.append(
                    {
                        "id": "GH-110-OPEN-PAID",
                        "severity": "warn",
                        "surface": "github",
                        "detail": "GH #110 Door POS open with z-funding:paid (Upwork M8 paid) — close or retarget as residual only.",
                    }
                )

    # Linear project missing
    if not lin.get("error") and not lin.get("hilltown_project"):
        findings.append(
            {
                "id": "LINEAR-NO-PROJECT",
                "severity": "warn",
                "surface": "linear",
                "detail": "No Linear project named like Hilltown — issues exist but Projects UI is empty for Hilltown.",
            }
        )

    # AGENT-372 Done while E2E residual expected
    for n in lin.get("nodes") or []:
        if n.get("identifier") == "AGENT-372":
            st = (n.get("state") or {}).get("name") or ""
            if st.lower() == "done":
                findings.append(
                    {
                        "id": "LINEAR-372-DONE-EARLY",
                        "severity": "warn",
                        "surface": "linear",
                        "detail": (
                            "AGENT-372 is Done but production Join→vault→charge Stripe TEST "
                            "proof may still be open (do not treat Linear Done as E2E proof)."
                        ),
                    }
                )
        if n.get("identifier") == "AGENT-373":
            owner_labels = [
                x.get("name")
                for x in ((n.get("labels") or {}).get("nodes") or [])
                if isinstance(x, dict)
            ]
            # labels shape may be nodes already unwrapped
            if not owner_labels and isinstance(n.get("labels"), list):
                owner_labels = [x.get("name") for x in n["labels"] if isinstance(x, dict)]

    # Vault stale
    state_meta = vault.get("State.md") or {}
    if state_meta.get("age_hours", 0) and state_meta["age_hours"] > 6:
        findings.append(
            {
                "id": "VAULT-STATE-STALE",
                "severity": "warn",
                "surface": "vault",
                "detail": f"YourStageTickets/State.md age_hours={state_meta['age_hours']}",
            }
        )

    # Open PRs informational
    drafts = [p for p in (gh.get("open_prs") or []) if p.get("isDraft")]
    if any(p.get("number") == 191 for p in drafts):
        findings.append(
            {
                "id": "GH-191-DRAFT",
                "severity": "info",
                "surface": "github",
                "detail": "PR #191 waitlist charge recovery still draft — do not claim production deploy of hardening.",
            }
        )

    if erp.get("error"):
        findings.append(
            {
                "id": "ERP-READ-FAIL",
                "severity": "block",
                "surface": "erp",
                "detail": erp["error"],
            }
        )
    if lin.get("error"):
        findings.append(
            {
                "id": "LINEAR-READ-FAIL",
                "severity": "warn",
                "surface": "linear",
                "detail": lin["error"],
            }
        )
    for e in gh.get("errors") or []:
        findings.append(
            {
                "id": "GH-READ-FAIL",
                "severity": "block",
                "surface": "github",
                "detail": str(e),
            }
        )

    return findings


def ensure_linear_project(key: str, lin: dict) -> dict[str, Any]:
    """Create project if missing; attach Hilltown issues. Idempotent."""
    result: dict[str, Any] = {"created": False, "attached": [], "errors": []}
    team = next(
        (t for t in (lin.get("teams") or []) if t.get("key") == LINEAR_TEAM_KEY),
        None,
    )
    if not team:
        result["errors"].append("AGENT team not found")
        return result

    proj = lin.get("hilltown_project")
    if not proj:
        mut = """
        mutation($input: ProjectCreateInput!) {
          projectCreate(input: $input) {
            success
            project { id name url }
          }
        }
        """
        try:
            d = linear_gql(
                key,
                mut,
                {
                    "input": {
                        "name": LINEAR_PROJECT_NAME,
                        "teamIds": [team["id"]],
                        "description": (
                            "Hilltown Media / YourStageTickets client work. "
                            "Money SSOT = Upwork + Resume ERP (not this project). "
                            "Locks = AGENT issues. Never re-sell paid M7 waitlist as M11."
                        ),
                    }
                },
            )
            pc = (d.get("data") or {}).get("projectCreate") or {}
            if pc.get("success") and pc.get("project"):
                proj = pc["project"]
                result["created"] = True
                result["project"] = proj
            else:
                result["errors"].append({"projectCreate": d})
                return result
        except Exception as e:
            result["errors"].append(str(e))
            return result
    else:
        result["project"] = proj

    project_id = proj["id"]
    # Resolve issue IDs and attach
    for ident in LINEAR_HILLTOWN_IDS:
        try:
            d = linear_gql(
                key,
                """query($id: String!) {
                  issue(id: $id) { id identifier project { id name } }
                }""",
                {"id": ident},
            )
            # Linear issue(id) may need UUID — try filter
        except Exception:
            pass
        try:
            d = linear_gql(
                key,
                """query($filter: IssueFilter) {
                  issues(filter: $filter, first: 1) {
                    nodes { id identifier project { id name } }
                  }
                }""",
                {"filter": {"number": {"eq": int(ident.split("-")[1])}, "team": {"key": {"eq": "AGENT"}}}},
            )
            nodes = (d.get("data") or {}).get("issues", {}).get("nodes") or []
            if not nodes:
                # fallback search
                d2 = linear_gql(
                    key,
                    """query($term: String!) {
                      searchIssues(term: $term, first: 5) {
                        nodes { id identifier project { id name } }
                      }
                    }""",
                    {"term": ident},
                )
                nodes = [
                    n
                    for n in ((d2.get("data") or {}).get("searchIssues", {}).get("nodes") or [])
                    if n.get("identifier") == ident
                ]
            if not nodes:
                result["errors"].append(f"issue not found {ident}")
                continue
            issue = nodes[0]
            cur = (issue.get("project") or {}).get("id")
            if cur == project_id:
                result["attached"].append({"id": ident, "status": "already"})
                continue
            mut = """
            mutation($id: String!, $input: IssueUpdateInput!) {
              issueUpdate(id: $id, input: $input) {
                success
                issue { identifier project { name } }
              }
            }
            """
            u = linear_gql(
                key,
                mut,
                {"id": issue["id"], "input": {"projectId": project_id}},
            )
            ok = ((u.get("data") or {}).get("issueUpdate") or {}).get("success")
            result["attached"].append(
                {"id": ident, "status": "attached" if ok else "failed", "raw": u if not ok else None}
            )
        except Exception as e:
            result["errors"].append(f"{ident}: {e}")
    return result


def linear_comment(key: str, identifier: str, body: str) -> dict:
    try:
        d = linear_gql(
            key,
            """query($term: String!) {
              searchIssues(term: $term, first: 5) {
                nodes { id identifier }
              }
            }""",
            {"term": identifier},
        )
        nodes = [
            n
            for n in ((d.get("data") or {}).get("searchIssues", {}).get("nodes") or [])
            if n.get("identifier") == identifier
        ]
        if not nodes:
            return {"error": f"not found {identifier}"}
        issue_id = nodes[0]["id"]
        mut = """
        mutation($input: CommentCreateInput!) {
          commentCreate(input: $input) { success comment { id url } }
        }
        """
        return linear_gql(
            key,
            mut,
            {"input": {"issueId": issue_id, "body": body}},
        )
    except Exception as e:
        return {"error": str(e)}


def write_drift_md(bundle: dict) -> None:
    try:
        YST.mkdir(parents=True, exist_ok=True)
    except OSError:
        # LaunchAgent may lack TCC for ~/Documents — fall back under workspace
        alt = Path.home() / "workspace/git/igor/mac-yolo-safeguards/tools/hilltown_drift_out"
        alt.mkdir(parents=True, exist_ok=True)
        global DRIFT_MD, DRIFT_JSON
        DRIFT_MD = alt / "Drift.md"
        DRIFT_JSON = alt / "Drift.json"
        YST_FALLBACK = alt  # noqa: F841
    findings = bundle["findings"]
    blocks = [f for f in findings if f["severity"] == "block"]
    warns = [f for f in findings if f["severity"] == "warn"]
    infos = [f for f in findings if f["severity"] == "info"]
    m7 = (bundle.get("erp") or {}).get("milestones", {}).get(
        "M7_AUTOMATED_WAITLIST_ENGINE"
    ) or {}
    lines = [
        "# YourStage / Hilltown — Triple-bus Drift",
        "",
        f"_Auto-generated {bundle['generated_at']} by `scripts/hilltown_triple_bus_drift.py`. Do not hand-edit blockers; re-run the script._",
        "",
        "## Authority",
        "",
        "| Concern | Source |",
        "|---------|--------|",
        "| Money / paid scope | Upwork txs + `Resume/.../erp/milestone_master_map.json` |",
        "| Product bugs / PRs | `HilltownMedia/YourStageTickets` |",
        "| Agent locks | Linear AGENT issues (+ project Hilltown / YourStage) |",
        "| Client narrative | This vault + live Upwork (human paste only) |",
        "",
        "## Money snapshot (ERP)",
        "",
        f"- **M7 Automated Waitlist:** `{m7.get('status', 'UNKNOWN')}` · paid `{m7.get('date_paid', '?')}` · gross `${m7.get('gross', '?')}`",
        f"- **SKU:** `{m7.get('sku', 'M7_AUTOMATED_WAITLIST_ENGINE')}`",
        "- **Rule:** Never re-sell as Upwork M11. Full rebuild = double-bill.",
        "",
        f"## Findings — {len(blocks)} block · {len(warns)} warn · {len(infos)} info",
        "",
    ]
    if not findings:
        lines.append("**CLEAN** — no blockers or warnings from this pass.")
        lines.append("")
    else:
        for sev, group in (("block", blocks), ("warn", warns), ("info", infos)):
            if not group:
                continue
            lines.append(f"### {sev.upper()}")
            lines.append("")
            for f in group:
                lines.append(f"- **`{f['id']}`** ({f['surface']}): {f['detail']}")
            lines.append("")

    # GitHub open table
    lines += ["## GitHub open (product)", ""]
    for iss in bundle.get("github", {}).get("open_issues") or []:
        labs = ",".join(
            sorted(
                x.get("name", "")
                for x in (iss.get("labels") or [])
                if isinstance(x, dict)
            )
        )
        lines.append(
            f"- **#{iss.get('number')}** {iss.get('title')} · labels: `{labs}`"
        )
    lines.append("")
    lines += ["## GitHub open PRs", ""]
    for pr in bundle.get("github", {}).get("open_prs") or []:
        d = "draft" if pr.get("isDraft") else "ready"
        lines.append(f"- **PR #{pr.get('number')}** ({d}) {pr.get('title')}")
    lines.append("")

    # Linear
    lines += ["## Linear Hilltown-related", ""]
    hp = (bundle.get("linear") or {}).get("hilltown_project")
    if hp:
        lines.append(f"- **Project:** {hp.get('name')} (`{hp.get('id')}`)")
    else:
        lines.append("- **Project:** _(none)_")
    for n in bundle.get("linear", {}).get("nodes") or []:
        if not any(
            x in (n.get("title") or "") + (n.get("identifier") or "")
            for x in ("Hilltown", "YourStage", "waitlist", "M7", "SMTP")
        ) and not (n.get("identifier") or "").startswith("AGENT-37"):
            # keep all searched nodes; already filtered by search
            pass
        st = (n.get("state") or {}).get("name")
        proj = (n.get("project") or {}).get("name") or "—"
        lines.append(
            f"- **{n.get('identifier')}** · {st} · project:{proj} · {n.get('title')}"
        )
    lines.append("")

    # Vault
    lines += ["## Vault YourStageTickets freshness", ""]
    for k, v in (bundle.get("vault") or {}).items():
        if isinstance(v, dict) and "mtime_utc" in v:
            lines.append(
                f"- **{k}**: mtime `{v['mtime_utc']}` · age_hours={v.get('age_hours')}"
            )
        elif k == "last_sync_heading":
            lines.append(f"- **last Sync heading:** `{v}`")
    lines.append("")
    lines += [
        "## Agent checklist (Jeff / M7)",
        "",
        "1. Live Upwork read-only before any reply (`/jeff-upwork-read-only`).",
        "2. ERP `propose-check` before any priced paste.",
        "3. Do not mark production audit complete without Join→vault→charge Stripe TEST proof.",
        "4. Paste only from `~/Downloads/*READY_TO_PASTE*` — never agent Send on Upwork.",
        "5. After work: update Linear claim + `Projects/YourStageTickets/State.md` + this Drift via re-run.",
        "",
        f"## Project ensure result",
        "",
        f"```json\n{json.dumps(bundle.get('project_ensure') or {}, indent=2)[:4000]}\n```",
        "",
    ]
    try:
        DRIFT_MD.write_text("\n".join(lines) + "\n")
        DRIFT_JSON.write_text(json.dumps(bundle, indent=2, default=str) + "\n")
    except OSError:
        alt = Path.home() / "workspace/git/igor/mac-yolo-safeguards/tools/hilltown_drift_out"
        alt.mkdir(parents=True, exist_ok=True)
        (alt / "Drift.md").write_text("\n".join(lines) + "\n")
        (alt / "Drift.json").write_text(json.dumps(bundle, indent=2, default=str) + "\n")


def print_preflight_block(bundle: dict) -> None:
    m7 = (bundle.get("erp") or {}).get("milestones", {}).get(
        "M7_AUTOMATED_WAITLIST_ENGINE"
    ) or {}
    print("--- Hilltown / YourStage focus ---")
    print(
        f"ERP M7: status={m7.get('status')} paid={m7.get('date_paid')} gross={m7.get('gross')}"
    )
    i78 = bundle.get("github", {}).get("issue_78") or {}
    print(f"GH #78: state={i78.get('state')} title={i78.get('title')}")
    i109 = bundle.get("github", {}).get("issue_109") or {}
    print(f"GH #109: state={i109.get('state')} (paid waitlist milestone)")
    for pr in bundle.get("github", {}).get("open_prs") or []:
        if pr.get("number") in (188, 191):
            print(
                f"GH PR #{pr['number']}: draft={pr.get('isDraft')} {pr.get('title')}"
            )
    for n in bundle.get("linear", {}).get("nodes") or []:
        if n.get("identifier") in ("AGENT-373", "AGENT-372", "AGENT-374", "AGENT-375", "AGENT-368"):
            st = (n.get("state") or {}).get("name")
            print(f"Linear {n['identifier']}: {st} — {n.get('title')}")
    vs = (bundle.get("vault") or {}).get("State.md") or {}
    print(
        f"Vault State.md age_hours={vs.get('age_hours')} mtime={vs.get('mtime_utc')}"
    )
    blocks = [f for f in bundle.get("findings") or [] if f["severity"] == "block"]
    print(f"Drift blockers: {len(blocks)} → {DRIFT_MD}")
    for f in blocks[:8]:
        print(f"  BLOCK {f['id']}: {f['detail'][:120]}")


def main(argv: list[str]) -> int:
    ensure_project = "--ensure-project" in argv
    preflight = "--preflight" in argv
    strict = "--strict" in argv
    comment_hygiene = "--hygiene-comments" in argv
    quiet = "--quiet" in argv

    erp = load_erp()
    gh = collect_github()
    key = linear_key()
    lin = collect_linear(key)
    vault = vault_state_age()
    findings = analyze(erp, gh, lin, vault)

    project_ensure: dict[str, Any] = {}
    if ensure_project and key:
        project_ensure = ensure_linear_project(key, lin)
        # refresh project presence for findings
        if project_ensure.get("project"):
            lin["hilltown_project"] = project_ensure["project"]
            findings = [
                f for f in findings if f["id"] != "LINEAR-NO-PROJECT"
            ]

    hygiene: dict[str, Any] = {}
    if comment_hygiene and key:
        hygiene["agent_372"] = linear_comment(
            key,
            "AGENT-372",
            (
                "## Hygiene (automated 2026-08-12)\n\n"
                "Do **not** treat this issue Done as proof that Join Waitlist → vault → "
                "charge Stripe TEST E2E passed on Railway. Money SSOT remains Upwork M7 "
                "PAID 2026-06-24; residual production proof tracks under AGENT-373 / GH "
                "smoke path. Client replies must stay honest residual until TEST charge evidence exists."
            ),
        )

    if comment_hygiene:
        # GH #78 comment (no label mutation without --mutate-labels)
        body = (
            "## Hygiene note (automated, 2026-08-12)\n\n"
            "**Money SSOT:** Upwork Milestone **7** — Automated Waitlist / Never Lose a Sale Engine — "
            "was **paid 2026-06-24** (ERP `M7_AUTOMATED_WAITLIST_ENGINE` / PAID_DELIVERED). "
            "Canonical paid milestone issue is **#109** (closed, `z-funding:paid`).\n\n"
            "This use-case issue remaining open with `z-funding:proposed` + internal `m6` labels "
            "is **label drift** and has already contributed to an accidental M11 re-pitch. "
            "Treat remaining work as **production verification / residual product gap under paid M7**, "
            "not as unpaid waitlist scope.\n\n"
            "Agents: run `python3 ~/Documents/AI-Agent-Sync/scripts/hilltown_triple_bus_drift.py` "
            "and read `Projects/YourStageTickets/Drift.md` before client messages."
        )
        rc, out, err = run(
            [
                "gh",
                "issue",
                "comment",
                "78",
                "-R",
                GH_REPO,
                "--body",
                body,
            ],
            timeout=60,
        )
        hygiene["gh_78_comment"] = {"rc": rc, "out": out[:300], "err": err[:300]}

        if "--mutate-labels" in argv:
            # Remove proposed funding; add paid residual note labels if exist
            rc2, out2, err2 = run(
                [
                    "gh",
                    "issue",
                    "edit",
                    "78",
                    "-R",
                    GH_REPO,
                    "--remove-label",
                    "z-funding:proposed",
                ],
                timeout=60,
            )
            hygiene["gh_78_remove_proposed"] = {
                "rc": rc2,
                "out": out2[:200],
                "err": err2[:200],
            }
            # try add paid if label exists
            rc3, out3, err3 = run(
                [
                    "gh",
                    "issue",
                    "edit",
                    "78",
                    "-R",
                    GH_REPO,
                    "--add-label",
                    "z-funding:paid",
                ],
                timeout=60,
            )
            hygiene["gh_78_add_paid"] = {
                "rc": rc3,
                "out": out3[:200],
                "err": err3[:200],
            }

    bundle = {
        "generated_at": now_iso(),
        "erp": {
            "milestones": {
                k: v
                for k, v in (erp.get("milestones") or {}).items()
                if k.startswith("M") or k.startswith("upwork")
            },
            "error": erp.get("error"),
            "updated_at": erp.get("raw_updated"),
        },
        "github": {
            "open_issues": gh.get("open_issues"),
            "open_prs": gh.get("open_prs"),
            "issue_78": gh.get("issue_78"),
            "issue_109": gh.get("issue_109"),
            "errors": gh.get("errors"),
        },
        "linear": {
            "nodes": lin.get("nodes"),
            "hilltown_project": lin.get("hilltown_project"),
            "error": lin.get("error"),
        },
        "vault": vault,
        "findings": findings,
        "project_ensure": project_ensure,
        "hygiene": hygiene,
    }
    write_drift_md(bundle)

    if preflight or not quiet:
        print_preflight_block(bundle)
    if not quiet:
        print(f"Wrote {DRIFT_MD}")
        print(f"Wrote {DRIFT_JSON}")
        if project_ensure:
            print("project_ensure:", json.dumps(project_ensure, default=str)[:800])
        if hygiene:
            print("hygiene:", json.dumps(hygiene, default=str)[:800])

    blocks = [f for f in findings if f["severity"] == "block"]
    if strict and blocks:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
