#!/usr/bin/env bash
# Fail if a shipped Hermes Mobile versionCode has no release tag.
#
# The regression this prevents: v1.4/versionCode 19 went to Google Play on 2026-07-25 with
# no tag. Nobody noticed until a user asked "which version is live?" and the answer had to
# be reconstructed by grepping git log for the versionCode bump. Until then, reverting to
# the shipped build or branching a hotfix from it was impossible.
#
# Contract: every commit that BUMPS android.versionCode in hermes-mobile/app.json must have
# a `mobile/android/v<version>+<code>` tag pointing at it. Checked in CI so an untagged
# release cannot reach main unnoticed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
LOOKBACK="${RELEASE_TAG_LOOKBACK:-40}"

read_code() {  # $1=commit -> versionCode at that commit ("" if unreadable)
  git show "$1:hermes-mobile/app.json" 2>/dev/null | node -e '
    let raw = "";
    process.stdin.on("data", (d) => (raw += d)).on("end", () => {
      try { process.stdout.write(String(JSON.parse(raw).expo?.android?.versionCode ?? "")); }
      catch { process.stdout.write(""); }
    });
  ' 2>/dev/null || true
}

# Enforce forward, warn backward. History has 9 untagged versionCode bumps, and most were
# never store releases (RC/internal builds). Backfilling tags for them would fabricate
# "this shipped to users" records — the same failure mode that put a bogus
# mobile/ios/v1.4+17 on origin. The policy starts at the first verified store release.
ENFORCE_SINCE="${RELEASE_TAG_ENFORCE_SINCE:-199e1481}"
enforce_cut="$(git rev-parse -q --verify "${ENFORCE_SINCE}^{commit}" 2>/dev/null || true)"

missing=0
warned=0
checked=0
for commit in $(git log --format=%H -n "$LOOKBACK" -- hermes-mobile/app.json); do
  code="$(read_code "$commit")"
  parent="$(git rev-parse -q --verify "${commit}^" 2>/dev/null || true)"
  [[ -z "$parent" ]] && continue
  prev="$(read_code "$parent")"
  # Only a BUMP is a release. Unchanged versionCode = ordinary commit.
  [[ -z "$code" || "$code" == "$prev" ]] && continue
  checked=$((checked + 1))
  version="$(git show "${commit}:hermes-mobile/app.json" 2>/dev/null | node -e '
    let raw=""; process.stdin.on("data",d=>raw+=d).on("end",()=>{
      try { process.stdout.write(String(JSON.parse(raw).expo?.version ?? "")); } catch { process.stdout.write(""); }
    });' 2>/dev/null || true)"
  tag="mobile/android/v${version}+${code}"
  if git rev-parse -q --verify "refs/tags/${tag}^{commit}" >/dev/null 2>&1; then
    echo "  ok   ${tag} -> $(git rev-parse --short "$commit")"
  elif [[ -n "$enforce_cut" ]] && ! git merge-base --is-ancestor "$enforce_cut" "$commit" 2>/dev/null; then
    # Predates the policy — report, never fail.
    echo "  warn (pre-policy) ${tag} for $(git rev-parse --short "$commit") — untagged, not enforced"
    warned=$((warned + 1))
  else
    echo "  MISSING ${tag} for $(git rev-parse --short "$commit") ($(git log -1 --format=%s "$commit" | cut -c1-60))" >&2
    missing=$((missing + 1))
  fi
done

if (( missing > 0 )); then
  echo "" >&2
  echo "::error::${missing} shipped versionCode bump(s) have no release tag — revert/hotfix is impossible for them." >&2
  echo "Fix: bash scripts/tag-mobile-release.sh android <commit> && git push origin <tag>" >&2
  exit 1
fi
echo "release tags: ${checked} bump(s) checked, ${warned} pre-policy warning(s), 0 missing"
