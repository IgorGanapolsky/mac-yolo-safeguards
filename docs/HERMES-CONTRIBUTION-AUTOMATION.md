# Hermes Contribution Automation

This repo includes a read-only job that continuously finds high-signal
contribution opportunities in `NousResearch/hermes-agent`.

It is intentionally conservative:

- uses `gh` and the GitHub API instead of HTML scraping
- scores open issues and PRs with labels, recency, comments, mergeability,
  duplicate detection, and Telegram/gateway keyword hits
- retrieves local evidence from a JSONL RAG store
- writes reports outside the repo by default
- does not comment, push, merge, close, or install itself

## Run Once

```sh
node tools/hermes-contribution-opportunities.js
```

Default outputs:

- `~/Library/Application Support/mac-yolo-safeguards/hermes-contribution-opportunities.json`
- `~/Library/Application Support/mac-yolo-safeguards/hermes-contribution-opportunities.md`
- `~/Library/Application Support/mac-yolo-safeguards/hermes-contribution-rag.jsonl`

## Continuous Job

The LaunchAgent template is:

```sh
com.igor.hermes-contribution-opportunities.plist
```

Install from the repo root:

```sh
repo="$(pwd)"
home="$HOME"
node_bin="$(command -v node)"
sed "s#{{REPO}}#$repo#g; s#{{HOME}}#$home#g; s#{{NODE}}#$node_bin#g" \
  com.igor.hermes-contribution-opportunities.plist \
  > "$HOME/Library/LaunchAgents/com.igor.hermes-contribution-opportunities.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.igor.hermes-contribution-opportunities.plist"
launchctl enable "gui/$(id -u)/com.igor.hermes-contribution-opportunities"
launchctl kickstart -k "gui/$(id -u)/com.igor.hermes-contribution-opportunities"
```

Verify:

```sh
launchctl print "gui/$(id -u)/com.igor.hermes-contribution-opportunities"
tail -n 80 "$HOME/Library/Logs/hermes-contribution-opportunities.log"
```

Unload:

```sh
launchctl bootout "gui/$(id -u)/com.igor.hermes-contribution-opportunities"
rm -f "$HOME/Library/LaunchAgents/com.igor.hermes-contribution-opportunities.plist"
```

## Decision Rules

The highest-scoring items are usually:

- P1/P2 Telegram gateway bugs
- mergeable non-draft PRs where reproduction evidence helps maintainers
- issues with low comments and strong local reproduction overlap
- opportunities with no duplicate PR already active

If the report flags a duplicate, consolidate evidence into the older or more
canonical thread before opening a new PR.
