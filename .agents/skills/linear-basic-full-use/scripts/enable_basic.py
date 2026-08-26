#!/usr/bin/env python3
"""Enable Linear Basic controls that were still off. Idempotent. Never prints the PAT."""
import json
import pathlib
import sys
import urllib.error
import urllib.request

KEY = pathlib.Path.home().joinpath(".config/linear/api_key").read_text().strip()
AGENT = "9568bb27-2bd2-4dc8-b834-6575f2299af0"
IGOR = "e8944b3f-e22d-4615-8721-1306597e3e9b"
LOCK = "09fd73a6-55a0-4cd8-a67e-b26eadbd91fb"
GROK = "0e086d53-0a09-42eb-923b-f913222e3212"
BUG = "2d4284a3-b86d-4a96-9230-db569b395f49"
EMPTY_TRASH = [
    ("a608dbed-c9a8-4549-9a85-6142f6f87a62", "Cortiqa Engagement (duplicate backlog)"),
    ("67f4fbcb-8621-4ddc-87fc-05a937006134", "Interview — Agentic Personas Storefront"),
]
CYCLE2 = "0546a4c8-679a-4328-a845-5ba2ca0905fa"


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


def ok(label, data):
    if data.get("errors"):
        print("FAIL", label, json.dumps(data["errors"])[:500])
        return False
    print("OK", label)
    return True


def main():
    r = gql(
        """
      mutation {
        organizationUpdate(input: {
          customersEnabled: true
          feedEnabled: true
          generatedUpdatesEnabled: true
          gitLinkbackMessagesEnabled: true
          gitLinkbackDescriptionsEnabled: true
          gitPublicLinkbackMessagesEnabled: false
          linearAgentEnabled: true
          codingAgentEnabled: true
          roadmapEnabled: true
          aiDiscussionSummariesEnabled: true
          aiThreadSummariesEnabled: true
        }) { success }
      }
    """
    )
    ok("organizationUpdate customers+pulse+linkbacks (no SLA — Business)", r)
    sla = gql("mutation { organizationUpdate(input: { slaEnabled: true }) { success } }")
    if sla.get("errors"):
        print("PLAN_WALL Business: issue SLAs", json.dumps(sla["errors"])[:300])
    else:
        ok("slaEnabled", sla)

    r = gql(
        """
      mutation($id: String!) {
        teamUpdate(id: $id, input: {
          cyclesEnabled: true
          triageEnabled: true
          cycleDuration: 1
          cycleStartDay: 1
          cycleCooldownTime: 0
          upcomingCycleCount: 4
          cycleIssueAutoAssignStarted: true
          cycleIssueAutoAssignCompleted: true
          timezone: "America/New_York"
        }) { success }
      }
    """,
        {"id": AGENT},
    )
    ok("AGENT weekly cycles no cooldown + triage", r)

    r = gql(
        """
      mutation($id: String!) {
        cycleUpdate(id: $id, input: {
          name: "AGENT Cycle 2"
          startsAt: "2026-09-07T04:00:00.000Z"
          endsAt: "2026-09-14T04:00:00.000Z"
        }) { success }
      }
    """,
        {"id": CYCLE2},
    )
    ok("shift cycle 2 to immediately follow cycle 1", r)

    r = gql(
        """
      mutation($id: String!) {
        cycleUpdate(id: $id, input: { name: "AGENT Cycle 1" }) { success }
      }
    """,
        {"id": "f3732cfb-5c54-4362-9105-a6f95b737e5a"},
    )
    ok("name cycle 1", r)

    print("PLAN_WALL Business: triageResponsibilityCreate — skip")

    tpls = gql("{ templates { name team { key } } }")
    have = {
        (x.get("name"), (x.get("team") or {}).get("key"))
        for x in (tpls.get("data") or {}).get("templates") or []
    }

    def ensure_template(name, description, template_data):
        if (name, "AGENT") in have or (name, None) in have:
            print("SKIP template", name)
            return
        r = gql(
            """
          mutation($input: TemplateCreateInput!) {
            templateCreate(input: $input) { success }
          }
        """,
            {
                "input": {
                    "type": "issue",
                    "teamId": AGENT,
                    "name": name,
                    "description": description,
                    "templateData": template_data,
                }
            },
        )
        ok("template " + name, r)

    ensure_template(
        "Fleet claim",
        "Claim an AGENT issue. Sets lock taxonomy; never steal another agent-lock.",
        {
            "title": "[claim] ",
            "description": (
                "## Goal\n\n## Repo / PR\n\n## Proof of done\n"
                "- [ ] tests\n- [ ] PR URL\n- [ ] vault handoff\n\n"
                "Do not steal `agent-lock` from another agent."
            ),
            "labelIds": [LOCK, GROK],
        },
    )
    ensure_template(
        "Bug",
        "Repro + expected + evidence. Use instead of a one-off label.",
        {
            "title": "[bug] ",
            "description": "## Repro\n\n## Expected\n\n## Actual\n\n## Evidence (CI/log/screenshot)\n",
            "labelIds": [BUG],
        },
    )
    ensure_template(
        "Agency cash",
        "First-cash / AHLS work on the AGENT board.",
        {
            "title": "[cash] ",
            "description": (
                "## Offer\n$149 After-Hours Leak Score\n\n"
                "## Prospect / evidence\n\n## Next action (draft only unless CEO authorized send)\n"
            ),
        },
    )

    for pid, name in EMPTY_TRASH:
        issues = gql(
            """
          query($id: ID!) {
            issues(filter: { project: { id: { eq: $id } } }, includeArchived: true, first: 1) {
              nodes { identifier }
            }
          }
        """,
            {"id": pid},
        )
        nodes = (((issues.get("data") or {}).get("issues") or {}).get("nodes")) or []
        if nodes:
            print("KEEP project has issues", name, nodes[0]["identifier"])
            continue
        r = gql(
            "mutation($id: String!){ projectDelete(id: $id){ success } }",
            {"id": pid},
        )
        ok("delete empty trashed project " + name, r)

    print("enable_basic finished")
    return 0


if __name__ == "__main__":
    sys.exit(main())
