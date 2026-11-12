#!/usr/bin/env bash
# Publish local edits to the live site.
#
#   npm run publish                 # default commit message
#   npm run publish -- "your note"  # custom message
#
# Does the four things that are easy to forget, in the order that matters:
#   1. normalises image paths a CMS may write in a broken form
#   2. pulls anything that landed on GitHub while you were editing
#   3. builds, so a broken site fails here instead of on the deploy
#   4. commits and pushes over the portfolio SSH key
#
# Works from any branch. The live site deploys from main, so this pushes
# whatever is checked out (saves plus anything unsaved) onto GitHub's main,
# then moves the local main to match. Studio's Go live button runs this same
# script, behind a confirm popup.

set -euo pipefail
cd "$(dirname "$0")/.."

MSG="${1:-Content update}"
KEY="$HOME/.ssh/id_ed25519_portfolio"
export GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes -o ConnectTimeout=10 -o ServerAliveInterval=10 -o ServerAliveCountMax=6"
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# macOS has no `timeout`; SSH pushes of big payloads stall rather than fail.
timeout_cmd() { local secs=$1; shift; perl -e 'alarm shift; exec @ARGV or die "exec: $!"' "$secs" "$@"; }

echo "→ normalising CMS image paths"
node scripts/fix-cms-paths.mjs


# iCloud Drive syncs ~/Documents, and when a build rewrites hundreds of files at
# once it forks "conflict" copies named "thing 2.jpg". If one ever lands in the
# source tree it must not be committed.
CONFLICTS=$(find src public resume -name '* [0-9].*' 2>/dev/null || true)
if [ -n "$CONFLICTS" ]; then
  echo "⚠️  iCloud conflict copies in the source tree:"
  echo "$CONFLICTS" | sed 's/^/    /'
  echo "    These are duplicates, not edits. Delete them and re-run:"
  echo "    find src public resume -name '* [0-9].*' -delete"
  exit 1
fi

# Keep src/assets/images tidy. Warn-only in the script itself; --strict here.
node scripts/check-media-layout.mjs --strict || exit 1

# Placeholder copy in anything that would actually render (figures with no
# picture and draft projects never publish, so they don't count).
node scripts/check-placeholder-copy.mjs --strict || exit 1

echo "→ checking GitHub for changes made elsewhere (Pages CMS, another machine)"
timeout_cmd 30 git fetch origin main --quiet

# Unsaved edits go out too: save them first, on whatever branch this is.
if [ -n "$(git status --porcelain)" ]; then
  echo "→ saving unsaved edits first"
  git status --short
  git add -A
  git commit -q --no-verify -m "$MSG"
fi

# Bring in anything that landed on GitHub's main since this work started.
if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "→ GitHub has changes this branch doesn't; merging them in"
  if ! git merge --no-edit -q origin/main; then
    git merge --abort 2>/dev/null || true
    echo
    echo "Stopped: your work and the changes on GitHub edit the same lines."
    echo "Nothing was pushed. Ask Claude to resolve the merge."
    exit 1
  fi
fi

AHEAD=$(git rev-list --count origin/main..HEAD)
if [ "$AHEAD" -eq 0 ]; then
  echo "Nothing to publish — the live site already has all of this."
  exit 0
fi

echo
echo "→ going live with $AHEAD save(s):"
git log --oneline origin/main..HEAD | sed 's/^/    /'
echo

echo "→ building (a failure here means the site would break)"
npm run build >/dev/null

# The repo's rule: never more than 5 MB of new binary in one push. Under that,
# push in one go; over it, push one save at a time so each payload stays small.
BIN=$(git diff --name-only --diff-filter=AM origin/main HEAD \
  | { grep -E '\.(png|jpe?g|webp|gif|heic|mp4|m4v|mov|glb|pdf)$' || true; } \
  | while read -r f; do [ -f "$f" ] && wc -c <"$f"; done | awk '{s+=$1} END {print s+0}')

# PUBLISH_DRY_RUN=1 runs every step except the push itself.
push_to_main() {
  if [ -n "${PUBLISH_DRY_RUN:-}" ]; then echo "  (dry run) would push $(git rev-parse --short "$1") to main"; return; fi
  timeout_cmd 120 git push --progress origin "$1:refs/heads/main"
}

echo "→ pushing to GitHub"
if [ "$BIN" -le 5242880 ]; then
  push_to_main HEAD
else
  echo "  ($(awk -v b="$BIN" 'BEGIN{printf "%.1f", b/1048576}') MB of images/video: pushing one save at a time)"
  for c in $(git rev-list --reverse origin/main..HEAD); do
    push_to_main "$c"
  done
fi

# Keep the local main in step, so auto-sync sees nothing left to push.
if [ -n "${PUBLISH_DRY_RUN:-}" ]; then
  echo
  echo "Dry run: nothing was pushed."
  exit 0
fi
if [ "$BRANCH" != "main" ]; then
  git branch -f main HEAD
fi
git fetch origin main --quiet || true

echo
echo "✓ Live in ~2 minutes (GitHub Actions is deploying)."
echo "  Status: https://github.com/ryanstrawbridge-2/ryanstrawbridge-2.github.io/actions"
