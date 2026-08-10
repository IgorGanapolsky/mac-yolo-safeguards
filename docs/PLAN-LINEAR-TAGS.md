# Linear-Style Tags for plan.md

This document describes the Linear-style labeling system for organizing tasks in `plan.md`.

## Tag Structure

Add a `[tags]` column after the task ID column for each task row:

```
| T-ID-YYYYMMDD | [P0, bug, ui, hermes] | Description | Status | Owner | Files | Progress |
```

## Priority Tags

- `P0` - Critical / Production blocking
- `P1` - High priority / Must ship
- `P2` - Medium priority
- `P3` - Low priority / Nice to have

## Type Tags

- `feature` - New functionality
- `bug` - Defect fix
- `fix` - Code repair
- `chore` - Maintenance, cleanup, refactoring
- `research` - Investigation, analysis
- `security` - Security hardening, audit
- `testing` - Test creation, test fixes
- `performance` - Performance optimization
- `ui` - User interface changes
- `backend` - Backend/API changes
- `mobile` - Mobile app changes
- `web` - Web app changes
- `infrastructure` - CI/CD, deployment, tooling
- `documentation` - Docs, comments
- `debugging` - Debugging tools, logging

## Domain Tags

- `hermes` - Hermes Mobile app
- `hermes-desktop` - Hermes desktop agent
- `thumbgate` - ThumbGate.app web dashboard
- `mac` - macOS desktop related
- `android` - Android platform
- `ios` - iOS platform
- `web` - Web platform
- `ci-cd` - CI/CD pipelines
- `ota` - OTA (Over-The-Air) updates
- `e2e` - End-to-end tests
- `subscription` - Billing, monetization
- `billing` - Billing, payments
- `wallet` - Wallet, payment intents
- `api` - API, REST/GraphQL
- `tailscale` - Tailscale integration
- `usb` - USB transport
- `relay` - Relay/gateway networking
- `pairing` - Device pairing flow
- `picker` - Computer/modal picker
- `header` - App header
- `banner` - UI banners/toasts
- `context` - Chat context, system prompt
- `session` - Chat session management
- `project` - Vault project integration
- `store` - App Store/Play Store metadata

## Status Tags (derived from status column, but can be explicit)

- `in-progress`
- `done`
- `released`
- `blocked`

## Example Task with Tags

```
| T-P0-APOLLO-SPEND-GUARD-20260802 | [P0, security, billing, api] | P0: hard-block agent-initiated purchases | done | codex-apollo-spend-guard | `hooks/thumbgate-spend-guard/pre-tool-use.js`, ... | PASS: focused test covers 14 read-only allow... |
```

## Automation

From the `mac-yolo-safeguards` repository root:

```bash
# Preview tag additions (dry run)
node tools/linear-tags-plan-md.js --preview

# Apply tags to all tasks
node tools/linear-tags-plan-md.js
```

## Table Format

The task board table has the following columns:

| Column | Description |
|--------|-------------|
| T-ID | Task identifier (e.g., `T-P0-APOLLO-SPEND-GUARD-20260802`) |
| [tags] | Linear-style tags (Priority, Type, Domain) |
| Description | Task title and description |
| Status | `in_progress`, `done`, `released`, `blocked` |
| Owner | Agent ID (e.g., `antigravity`, `cursor-header-ts-hostname`) |
| Files | Source files being modified |
| Progress | Completion evidence |

## Examples

```
| T-P0-APOLLO-SPEND-GUARD-20260802 | [P0, security, billing, api] | P0: hard-block agent-initiated purchases | done | codex-apollo-spend-guard | ... |
| T-LOCAL-CI-DAGGER-ACT-20260806 | [P0, infrastructure, ci-cd] | Local CI Stack, Dagger Portable Pipeline | in_progress | antigravity | ... |
```

## Linear-Style Time Tracking (Optional Extended Columns)

For detailed agent productivity tracking, you can extend the table with additional columns:

| Column | Description |
|--------|-------------|
| T-ID | Task identifier |
| [tags] | Linear-style tags |
| Description | Task title/description |
| Status | `in_progress`, `done`, `released`, `blocked` |
| Owner | Agent ID |
| Files | Source files modified |
| Progress | Completion evidence |
| **Duration** | (Optional) Hours taken to complete |
| **MergeTime** | (Optional) Time from PR open to merge |
| **Improvement** | (Optional) Next-step improvement insight |

### Extended Example with Time Metrics

```
| T-P0-APOLLO-SPEND-GUARD-20260802 | [P0, security, billing] | P0: hard-block purchases | done | codex-apollo-spend-guard | ... | 4h | 2d | Use shared test fixture for spend-guard tests |
```

**Improvement insight format:** "Use X pattern for faster Y"

## Linear Integration

While the `[tags]` column provides Linear-style organization within `plan.md`, the actual Linear integration works via:

1. **Linear Agent** - In-Linear AI assistant for summarizing, creating issues, and updating issues
2. **Linear API** - Programmatic access via `curl -H "Authorization: Bearer $TOKEN"` or `gh` CLI

### How to Use Linear Agent for Task Tracking

1. Open Linear → Agent chat (`⌘J` or `@Linear` in comments)
2. Ask: "Summarize my work from plan.md tasks T-P0-* and their completion times"
3. Ask: "Create improvements for reducing agent task duration"

### Time Tracking Metadata (Manual Entry)

When tasks are completed, add time insights in the **Progress** column or comments:

```
| ... | PASS: 4h work; PR #1581; improvement: cache recomputation took 2h → pre-compute at startup |
```

The key insight for improvement: **measure, analyze, optimize**. For agent task duration, focus on:
- Reducing test iteration time
- Reusing existing patterns/fixtures
- Parallelizable work units
- Early failure detection