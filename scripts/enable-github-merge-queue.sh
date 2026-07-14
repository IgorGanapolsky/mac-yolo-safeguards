#!/usr/bin/env bash
# Enable GitHub merge queue on main via GraphQL rulesets API.
# Blocked on personal Free accounts — see docs/GITHUB-WEEK1-HARDENING.md.
set -euo pipefail

repo="${GITHUB_REPO:-IgorGanapolsky/mac-yolo-safeguards}"
owner="${repo%%/*}"
name="${repo##*/}"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI required" >&2
  exit 1
fi

repo_id="$(gh api graphql -f query='query($o:String!,$n:String!){repository(owner:$o,name:$n){id}}' -f o="$owner" -f n="$name" --jq .data.repository.id)"
if [[ -z "$repo_id" || "$repo_id" == "null" ]]; then
  echo "Could not resolve repository id for $repo" >&2
  exit 1
fi

build_concurrency="${MERGE_QUEUE_BUILD_CONCURRENCY:-5}"
max_merge="${MERGE_QUEUE_MAX_ENTRIES:-1}"
min_merge="${MERGE_QUEUE_MIN_ENTRIES:-1}"
wait_minutes="${MERGE_QUEUE_MIN_WAIT_MINUTES:-5}"
timeout_minutes="${MERGE_QUEUE_CHECK_TIMEOUT_MINUTES:-360}"
merge_method="${MERGE_QUEUE_MERGE_METHOD:-SQUASH}"
grouping="${MERGE_QUEUE_GROUPING:-HEADGREEN}"

payload="$(mktemp)"
trap 'rm -f "$payload"' EXIT

cat >"$payload" <<EOF
{
  "query": "mutation(\$input: CreateRepositoryRulesetInput!) { createRepositoryRuleset(input: \$input) { ruleset { id name enforcement } } }",
  "variables": {
    "input": {
      "sourceId": "$repo_id",
      "name": "main merge queue (Week 1 hardening)",
      "target": "BRANCH",
      "enforcement": "ACTIVE",
      "conditions": {
        "refName": {
          "include": ["refs/heads/main"],
          "exclude": []
        }
      },
      "rules": [
        {
          "type": "MERGE_QUEUE",
          "parameters": {
            "mergeQueue": {
              "checkResponseTimeoutMinutes": $timeout_minutes,
              "groupingStrategy": "$grouping",
              "maxEntriesToBuild": $build_concurrency,
              "maxEntriesToMerge": $max_merge,
              "mergeMethod": "$merge_method",
              "minEntriesToMerge": $min_merge,
              "minEntriesToMergeWaitMinutes": $wait_minutes
            }
          }
        }
      ]
    }
  }
}
EOF

echo "Enabling merge queue on $repo (build concurrency=$build_concurrency) ..."
if gh api graphql --input "$payload" 2>&1 | tee /tmp/merge-queue-enable.log; then
  if grep -q '"createRepositoryRuleset":null' /tmp/merge-queue-enable.log 2>/dev/null; then
    echo "" >&2
    echo "BLOCKED: GitHub rejected merge queue for this account/repo." >&2
    echo "Personal Free repos cannot use merge queue — move to an org or upgrade to Team." >&2
    echo "See docs/GITHUB-WEEK1-HARDENING.md" >&2
    exit 2
  fi
  echo "OK merge queue ruleset created. Confirm at: https://github.com/$repo/settings/rules"
else
  exit 1
fi
