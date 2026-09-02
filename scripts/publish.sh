#!/usr/bin/env bash
# Publish local edits to the live site.
#
#   npm run publish                 # default commit message
#   npm run publish -- "your note"  # custom message
#
# Does the four things that are easy to forget, in the order that matters:
#   1. normalises the image paths TinaCMS writes in a broken form
#   2. pulls anything that landed on GitHub while you were editing
#   3. builds, so a broken site fails here instead of on the deploy
#   4. commits and pushes over the portfolio SSH key

set -euo pipefail
cd "$(dirname "$0")/.."

MSG="${1:-Content update}"
KEY="$HOME/.ssh/id_ed25519_portfolio"
export GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes"

echo "→ normalising CMS image paths"
node scripts/fix-cms-paths.mjs

if [ -z "$(git status --porcelain)" ]; then
  echo "Nothing to publish — no local changes."
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
