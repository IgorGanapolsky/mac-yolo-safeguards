#!/usr/bin/env bash
# Tag the commit that produced a Hermes Mobile store binary.
#
# Why this exists: v1.5/versionCode 19 shipped to Google Play on 2026-07-25 with NO tag, so
# there was no way to answer "which commit are users running?" — and therefore no way to
# revert or branch a hotfix. The last version tag before this script was v0.2.4 (2026-05-27),
# two months and ~19 store builds stale.
#
# Scheme (one tag per store artifact, so a tag maps 1:1 to something users can install):
#   mobile/android/v<version>+<versionCode>
#   mobile/ios/v<version>+<buildNumber>
#
# Revert:  git checkout mobile/android/v1.5+19
# Hotfix:  git switch -c hotfix/<thing> mobile/android/v1.5+19
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_JSON="$REPO_ROOT/hermes-mobile/app.json"
PLATFORM="${1:-}"
COMMIT="${2:-HEAD}"
DRY_RUN=0
BUILD_OVERRIDE=""
args=("$@")
for i in "${!args[@]}"; do
  [[ "${args[$i]}" == "--dry-run" ]] && DRY_RUN=1
  [[ "${args[$i]}" == "--build" ]] && BUILD_OVERRIDE="${args[$((i + 1))]:-}"
done

usage() {
  echo "usage: tag-mobile-release.sh <android|ios> [commit] [--build N] [--dry-run]" >&2
  echo "  ios REQUIRES --build N (from App Store Connect or \`eas build:list\`)" >&2
  exit 2
}
[[ "$PLATFORM" == "android" || "$PLATFORM" == "ios" ]] || usage
[[ "$COMMIT" == "--dry-run" || "$COMMIT" == "--build" ]] && COMMIT="HEAD"

# Read app.json AT THE TARGET COMMIT, never from the working tree. Backfilling the first
# tag from a dirty checkout produced `mobile/android/v1.5+19` for a build that actually
# shipped as v1.4 — the working tree had an unreleased 1.5 bump. A release tag that lies
# about its version is worse than no tag.
#
# Here-string, not process substitution: the node payload writes no trailing newline, so a
# `read < <(...)` hits EOF, returns non-zero, and `set -e` kills the script with no output.
# iOS build numbers are NOT in this repo. EAS auto-increments CFBundleVersion remotely, so
# app.json's ios.buildNumber is stale fiction: it said 17 on 2026-07-26 while the App Store
# actually served build 24 (v1.3) with build 28 in review. Tagging iOS from app.json would
# mint `mobile/ios/v1.3+17` — a tag naming a build that never existed. Require the real
# number from App Store Connect or `eas build:list --platform ios`.
if [[ "$PLATFORM" == "ios" && -z "$BUILD_OVERRIDE" ]]; then
  echo "refusing to guess an iOS build number: app.json's ios.buildNumber is stale (EAS auto-increments)." >&2
  echo "Get the real one:  npx eas-cli build:list --platform ios --limit 40 --json --non-interactive" >&2
  echo "Then:              $0 ios <commit> --build <n>" >&2
  exit 1
fi

read -r VERSION BUILD <<<"$(git -C "$REPO_ROOT" show "${COMMIT}:hermes-mobile/app.json" | node -e '
  let raw = "";
  process.stdin.on("data", (d) => (raw += d)).on("end", () => {
    const a = JSON.parse(raw).expo;
    const p = process.argv[1];
    const build = p === "android" ? a.android?.versionCode : a.ios?.buildNumber;
    if (!a.version || build === undefined) { console.error("version/build missing in app.json"); process.exit(1); }
    process.stdout.write(`${a.version} ${build}`);
  });
' "$PLATFORM")"

[[ -n "$BUILD_OVERRIDE" ]] && BUILD="$BUILD_OVERRIDE"
TAG="mobile/${PLATFORM}/v${VERSION}+${BUILD}"
SHA="$(git -C "$REPO_ROOT" rev-parse --short "$COMMIT")"

# Idempotent: re-running on the same commit is a no-op, but pointing an existing tag at a
# DIFFERENT commit is refused — a store artifact is immutable, so silently moving its tag
# would destroy the only record of what users actually have.
# `^{commit}` is required: these are ANNOTATED tags, so a bare rev-parse returns the tag
# OBJECT sha, which never equals a commit sha — the comparison then always fell through to
# "refusing to move" and the idempotent path was unreachable.
if existing="$(git -C "$REPO_ROOT" rev-parse -q --verify "refs/tags/$TAG^{commit}" 2>/dev/null)"; then
  if [[ "$(git -C "$REPO_ROOT" rev-parse --short "$existing")" == "$SHA" ]]; then
    echo "$TAG already points at $SHA — nothing to do"; exit 0
  fi
  echo "refusing to move $TAG ($(git -C "$REPO_ROOT" rev-parse --short "$existing") -> $SHA): store builds are immutable" >&2
  exit 1
fi

if (( DRY_RUN )); then
  # `push.followTags=true` is set on this repo, so a stray local tag rides out on the next
  # push — a fabricated release tag reached origin exactly that way while testing this
  # script. Dry-run exists so verifying it can never publish a lie.
  echo "[dry-run] would create $TAG -> $SHA"; exit 0
fi

git -C "$REPO_ROOT" tag -a "$TAG" "$COMMIT" -m "Hermes Mobile ${PLATFORM} store release: v${VERSION} (build ${BUILD})

Revert: git checkout ${TAG}
Hotfix: git switch -c hotfix/<thing> ${TAG}"
echo "created $TAG -> $SHA"
echo "push with: git push origin $TAG"
