#!/usr/bin/env bash
# Live editor: `npm run studio`
#
# Runs two things together:
#   - scripts/studio-server.mjs on 4322, which writes to the markdown
#   - astro dev on 4321, which renders and hot-reloads
#
# Open http://localhost:4321/projects/<slug>/ and edit the page directly:
# drag a photo to set its crop, hover it for width / section / order / remove,
# drop files anywhere to add them. Every change saves straight to frontmatter.
#
# Publish when you're done:  npm run publish -- "your note"

set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/fix-cms-paths.mjs

# A writer left over from an earlier session (or one restarted by hand) would
# hold 4322 and make this one exit on EADDRINUSE while the page kept talking to
# the stale code. Clear it first.
STUDIO_PORT="${STUDIO_PORT:-4322}"
if command -v lsof >/dev/null 2>&1; then
  lsof -ti "tcp:$STUDIO_PORT" -sTCP:LISTEN | xargs kill 2>/dev/null || true
fi

node scripts/studio-server.mjs &
STUDIO_PID=$!

# Without this the writer survives Ctrl-C and holds 4322 against the next run.
cleanup() { kill "$STUDIO_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo
echo "Studio is up. Open a project page:"
for f in src/content/projects/*.md; do
  echo "  http://localhost:4321/projects/$(basename "$f" .md)/"
done
echo

npx astro dev "$@"
