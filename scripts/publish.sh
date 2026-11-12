#!/usr/bin/env bash
# Publish local edits to the live site.
#
#   npm run publish                 # default commit message
#   npm run publish -- "your note"  # custom message
#
# Does the five things that are easy to forget, in the order that matters:
#   1. normalises the image paths TinaCMS writes in a broken form
#   2. checks the click-to-edit fragments still match the Tina schema
#   3. pulls anything that landed on GitHub while you were editing
#   4. builds, so a broken site fails here instead of on the deploy
#   5. commits and pushes over the portfolio SSH key

set -euo pipefail
cd "$(dirname "$0")/.."

# Publishing is switched off while .publish-lock exists (gitignored, local
# only). Studio's Save button commits locally either way; this only guards
# the push. Delete the file to publish again.
if [ -f .publish-lock ]; then
  echo "Publishing is locked — nothing was pushed."
  echo "Reason: $(head -1 .publish-lock)"
  echo "Your edits are safe locally. Delete .publish-lock to publish again."
  exit 1
fi

# The live site deploys from main. Pushing any other branch from here would
# either fail (no upstream) or create a remote branch that deploys nothing.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "On branch '$BRANCH', not main — nothing was pushed."
  echo "Local saves on this branch go live only when it is merged into main."
  exit 1
fi

MSG="${1:-Content update}"
KEY="$HOME/.ssh/id_ed25519_portfolio"
export GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes"

echo "→ normalising CMS image paths"
node scripts/fix-cms-paths.mjs

# Deliberately NOT in `npm run build`: a stale lock would then fail the GitHub
# Actions deploy and leave the live site silently out of date. Here it only
# stops a push you're standing in front of.
echo "→ checking click-to-edit fragments against the Tina schema"
if ! node scripts/check-tina-fragment.mjs; then
  echo
  echo "Stopped. Publishing this would leave /admin/ showing \"Unexpected Error\"."
  echo "The site itself would be fine — pass --skip-tina-check to publish anyway."
  [ "${2:-}" = "--skip-tina-check" ] || exit 1
  echo "(--skip-tina-check given, carrying on)"
fi

if [ -z "$(git status --porcelain)" ]; then
  # A clean tree isn't the same as "nothing to publish": commits made outside
  # this script (VS Code, or a previous run that committed but failed to push)
  # still need sending. Bailing here left them sitting unpushed and silent.
  git fetch origin --quiet 2>/dev/null || true
  AHEAD=$(git rev-list --count '@{upstream}..HEAD' 2>/dev/null || echo 0)
  if [ "$AHEAD" -gt 0 ]; then
    echo "No uncommitted changes, but $AHEAD commit(s) haven't been pushed:"
    git log --oneline '@{upstream}..HEAD'
    echo
    echo "→ pushing"
    git push --progress
    echo
    echo "✓ Pushed. GitHub Actions is deploying — live in ~2 minutes."
    exit 0
  fi
  echo "Nothing to publish — no local changes, nothing unpushed."
  exit 0
fi

echo
echo "→ about to publish:"
git status --short
echo

# The repo's own rule: never push >5 MB of new binary in one commit, since
# SSH pushes stall on large payloads.
BIG=$(git status --porcelain | awk '{print $2}' | while read -r f; do
  [ -f "$f" ] && [ "$(wc -c <"$f")" -gt 5242880 ] && echo "  $(du -h "$f" | cut -f1)  $f"
done || true)
if [ -n "$BIG" ]; then
  echo "⚠️  Files over 5 MB — these can stall the push:"
  echo "$BIG"
  printf "Continue anyway? [y/N] "
  read -r reply
  [ "$reply" = "y" ] || { echo "Stopped. Shrink them and re-run."; exit 1; }
  echo
fi

# iCloud Drive syncs ~/Documents, and when a build rewrites hundreds of files at
# once it forks "conflict" copies named "thing 2.jpg". dist/ is excluded via
# xattr (see CLAUDE.md), but if one ever lands in the source tree it must not be
# committed — it's never intentional and it confuses the asset pruner.
CONFLICTS=$(find src public resume -name '* [0-9].*' 2>/dev/null || true)
if [ -n "$CONFLICTS" ]; then
  echo "⚠️  iCloud conflict copies in the source tree:"
  echo "$CONFLICTS" | sed 's/^/    /'
  echo "    These are duplicates, not edits. Delete them and re-run:"
  echo "    find src public resume -name '* [0-9].*' -delete"
  exit 1
fi

# Keep src/assets/images tidy: no loose uploads at the root, no camera names,
# no stray date folders. Warn-only in the script itself; --strict here so it
# stops a push Ryan is watching rather than a GitHub Actions deploy he isn't.
if ! node scripts/check-media-layout.mjs --strict; then
  exit 1
fi

# Walkthrough figures ship with placeholder headlines until the diagrams exist.
# The empty-frame skeleton is dev-only, but the COPY is not — a figure with a
# real photo and a "PLACEHOLDER COPY" headline renders that headline to the
# world. Same warn-only/--strict split as the two checks above.
if ! node scripts/check-placeholder-copy.mjs --strict; then
  exit 1
fi

echo "→ pulling anything new from GitHub"
git pull --rebase --autostash

echo "→ building (a failure here means the site would break)"
npm run build >/dev/null

echo "→ committing"
git add -A
git commit -q -m "$MSG"

echo "→ pushing"
git push --progress

echo
echo "✓ Pushed. GitHub Actions is deploying — live in ~2 minutes."
echo "  Status: https://github.com/ryanstrawbridge-2/ryanstrawbridge-2.github.io/actions"
