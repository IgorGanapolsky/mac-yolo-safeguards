---
name: linear-agent-skills
description: Use Linear Basic as the issue and planning bus with provider-readback claims, projects, cycles, statuses, GitHub links, Obsidian file claims, and read-only workspace hygiene.
---

# Linear Basic operations

Use this skill for Linear issue ownership, project/cycle status, agent attribution, GitHub evidence links, Obsidian handoffs, or workspace hygiene. Linear owns task state; the canonical Obsidian vault owns live file/WIP claims; git owns code.

## Verified Basic surface

The live command reads `organization.subscription.type`; do not assume the plan from prose. Linear's official pricing currently gives Basic five teams, unlimited issues and file uploads, admin roles, core issues/projects/cycles/initiatives, API/webhook access, Agent platform, MCP access, and Linear Agent. Loops, Insights, Triage Intelligence, Code Intelligence, and Linear Asks are Business-plan features.

Official references:

- https://linear.app/pricing
- https://linear.app/docs/linear-agent
- https://linear.app/developers/graphql
- https://linear.app/docs/github-integration

## Session start

```bash
node tools/linear-agent-bridge.js --doctor --json
node tools/linear-agent-bridge.js --coord-status --json
node tools/linear-workspace-hygiene.js --dry-run --stale-days 90 --json
```

Stop if provider readback fails. Do not substitute cached counts or a local vault note for Linear state.

## Claim one issue

Create the public-safe GitHub issue first, then create/claim its Linear issue and name the files:

```bash
node tools/linear-agent-bridge.js --create \
  --title "<TITLE>" \
  --description "GitHub #<NUMBER>; <ACCEPTANCE>" \
  --team AGENT \
  --json

node tools/linear-agent-bridge.js --claim <ISSUE_ID> \
  --agent <AGENT_NAME> \
  --files <FILE_A>,<FILE_B> \
  --comment "https://github.com/<OWNER>/<REPO>/issues/<NUMBER>" \
  --json
```

A successful claim must read back all of these:

- `state=In Progress`;
- human Linear assignee retained;
- `agent-lock` and `agent-<name>` labels;
- vault receipt under `Handoffs/linear-claims/`;
- matching append-only `plan.md` file claim.

The bridge paginates all team labels. If either required label is missing, it fails closed before writing a vault claim.

## Inventory and hygiene

```bash
node tools/linear-workspace-hygiene.js --inventory --json
node tools/linear-workspace-hygiene.js --dry-run --stale-days 90 --json
```

The command paginates and deduplicates provider projects, cycles, labels, workflow states, users/agents, teams, and issues. It joins GitHub issue/PR URLs from Linear descriptions with canonical Obsidian claim receipts and emits a stable SHA-256 fingerprint.

It is read-only. There is no `--apply`, `--archive`, or `--delete` mode.

| Object | Review candidate only when | Hard blockers |
|---|---|---|
| Project | completed/canceled, stale, zero open issues | active/recent, GitHub-linked history, Obsidian claim history, already archived |
| Label | stale and zero issue references | any issue reference, recent use, agent-lock/attribution protocol label |
| Cycle | past, stale, zero open issues | current/future, GitHub/Obsidian history, already archived |
| Agent lock | issue closed, stale, vault claim inactive | open issue, recent activity, active vault claim |
| User/provider agent | never automatic | always manual review |

Any provider archive/delete decision belongs to a separately authorized operator who re-runs the dry-run immediately before mutation. This skill never deletes live Linear objects.

## Projects, cycles, and status

- Assign issues to projects/cycles with native Linear fields; do not encode them as one-off labels.
- Draft project updates from current issue statuses, blockers, owners, latest update, and GitHub evidence.
- Publish an update only when requested. Set health only when cited evidence supports `on track`, `at risk`, or `off track`; otherwise report it as unmeasured.
- Do not schedule Loops on Basic. Keep repeated local automation in repository tooling or upgrade deliberately to Business.

## GitHub and Obsidian links

- Put the GitHub issue URL in the Linear description or claim comment.
- Put PR URL, merge SHA, and exact-head CI URL in the Linear closeout comment.
- Cite an Obsidian path only after the bridge returns it; never infer vault sync from Linear success.
- Never collapse provider state, vault state, git state, deploy state, device proof, or revenue into one claim.

## Closeout

After the PR is actually merged and exact-head CI is verified:

```bash
node tools/linear-agent-bridge.js --done <ISSUE_ID> \
  --agent <AGENT_NAME> \
  --comment "<PR_URL> <MERGE_SHA> <CI_URL>; bottleneck=<OBSERVED>; next=<TESTABLE_CHANGE>" \
  --json
```

Re-read the issue and vault receipt. The current bridge does not compute cycle-time telemetry; do not invent it.

## Linear Agent UI skills

Export the reviewed native/repository skill prompts:

```bash
node tools/linear-agent-skill-exporter.js --json
```

The exporter references only commands present in the repository and delegates no PR merge or workspace deletion authority.

## Verification

```bash
node tests/test-linear-agent-bridge.js
node tests/test-linear-agent-skill-exporter.js
node --test tests/test-linear-workspace-hygiene.js
node tools/skill-card-validate.js --dir .agents/skills --strict
```
