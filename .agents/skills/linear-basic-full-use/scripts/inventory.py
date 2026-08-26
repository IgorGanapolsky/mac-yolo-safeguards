#!/usr/bin/env python3
"""Read-only Linear Basic inventory. Never prints the PAT."""
import json
import pathlib
import urllib.request

KEY = pathlib.Path.home().joinpath(".config/linear/api_key").read_text().strip()


def gql(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        "https://api.linear.app/graphql",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": KEY},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = json.loads(resp.read().decode())
    if data.get("errors"):
        raise SystemExit(json.dumps(data["errors"], indent=2)[:2000])
    return data["data"]


def main():
    org = gql(
        """
    {
      organization {
        urlKey gitBranchFormat
        subscription { type seats }
        customersEnabled feedEnabled
        linearAgentEnabled codingAgentEnabled
        codeIntelligenceEnabled releasesEnabled
        gitLinkbackMessagesEnabled gitPublicLinkbackMessagesEnabled
        createdIssueCount userCount
      }
    }
    """
    )["organization"]
    print(
        "plan",
        org["subscription"]["type"],
        "seats",
        org["subscription"]["seats"],
        "issues",
        org["createdIssueCount"],
    )
    print("gitBranchFormat", org["gitBranchFormat"])
    print(
        "flags",
        "customers=" + str(org["customersEnabled"]),
        "pulse=" + str(org["feedEnabled"]),
        "linearAgent=" + str(org["linearAgentEnabled"]),
        "codingAgent=" + str(org["codingAgentEnabled"]),
        "codeIntel=" + str(org["codeIntelligenceEnabled"]),
        "releases=" + str(org["releasesEnabled"]),
        "linkback=" + str(org["gitLinkbackMessagesEnabled"]),
        "publicLinkback=" + str(org["gitPublicLinkbackMessagesEnabled"]),
    )

    teams = gql(
        """
    {
      teams {
        nodes {
          key issueCount cyclesEnabled triageEnabled
          cycleDuration cycleCooldownTime cycleStartDay upcomingCycleCount
          timezone
          activeCycle { number name startsAt endsAt }
          triageResponsibility { id action }
        }
      }
    }
    """
    )["teams"]["nodes"]
    print("teams")
    for t in teams:
        tr = t.get("triageResponsibility")
        print(
            " ",
            t["key"],
            "issues=" + str(t["issueCount"]),
            "cycles=" + str(t["cyclesEnabled"]),
            "cooldown=" + str(t["cycleCooldownTime"]),
            "triage=" + str(t["triageEnabled"]),
            "triageOwner=" + (tr["action"] if tr else "none"),
            "activeCycle=" + str((t.get("activeCycle") or {}).get("name")),
        )

    cycles = gql(
        """
    {
      team(id: "9568bb27-2bd2-4dc8-b834-6575f2299af0") {
        cycles(first: 8) { nodes { number name startsAt endsAt } }
      }
    }
    """
    )["team"]["cycles"]["nodes"]
    print("AGENT cycles")
    for c in cycles:
        print(" ", c["number"], c.get("name"), c["startsAt"][:10], "→", c["endsAt"][:10])

    users = gql(
        """
    {
      users(includeDisabled: true) {
        nodes { name active app guest createdIssueCount }
      }
    }
    """
    )["users"]["nodes"]
    print("users")
    for u in users:
        print(
            " ",
            u["name"],
            "active=" + str(u["active"]),
            "app=" + str(u["app"]),
            "created=" + str(u["createdIssueCount"]),
        )

    labels = gql("{ issueLabels(first: 250) { nodes { name team { key } issues(first: 1) { nodes { id } } } } }")[
        "issueLabels"
    ]["nodes"]
    empty = [
        ((x.get("team") or {}).get("key") or "WS", x["name"])
        for x in labels
        if not x["issues"]["nodes"]
    ]
    print("labels", len(labels), "empty", len(empty))
    for row in empty:
        print("  EMPTY", row[0], row[1])

    projects = gql(
        """
    {
      projects(first: 50, includeArchived: true) {
        nodes { name state archivedAt trashed }
      }
    }
    """
    )["projects"]["nodes"]
    live = [p for p in projects if not p["archivedAt"] and not p["trashed"]]
    trash = [p for p in projects if p["trashed"] or p["archivedAt"]]
    print("projects live", [(p["name"], p["state"]) for p in live])
    print("projects archived/trashed", [(p["name"], p["state"]) for p in trash])

    inits = gql("{ initiatives { nodes { name status } } }")["initiatives"]["nodes"]
    print("initiatives", [(i["name"][:60], i["status"]) for i in inits])

    tpls = gql("{ templates { name type } }")
    print("templates", [(t["name"], t["type"]) for t in tpls["templates"] or []])

    hooks = gql("{ webhooks { nodes { url enabled } } }")["webhooks"]["nodes"]
    print("webhooks", len(hooks))

    integ = gql("{ organization { integrations { nodes { service } } } }")[
        "organization"
    ]["integrations"]["nodes"]
    print("integrations", [i["service"] for i in integ])


if __name__ == "__main__":
    main()
