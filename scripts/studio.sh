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

# The cleanup trap below also stops the writer, so it can't survive Ctrl-C and
# hold 4322 against the next run.

echo
echo "Studio is up. Open a project page:"
for f in src/content/projects/*.md; do
  echo "  http://localhost:4321/projects/$(basename "$f" .md)/"
done
echo

# A stale preview from an earlier run would push this one onto another port.
lsof -ti "tcp:4321" -sTCP:LISTEN | xargs kill 2>/dev/null || true

# Supervise astro dev. When package.json, the lockfile or the Astro config
# changes, Vite restarts itself in-process, and its content watcher never
# comes back: saves land on disk and the page keeps showing the old version
# (CLAUDE.md gotcha 15). Restarting the whole process is the only cure, so do
# it automatically instead of leaving a page that silently stops updating.
WATCHED="package.json package-lock.json astro.config.mjs"
stamp() { stat -f '%m' $WATCHED 2>/dev/null | tr '\n' ' '; }

ASTRO_PID=""
start_astro() { npx astro dev "$@" & ASTRO_PID=$!; }
stop_astro() {
  [ -n "$ASTRO_PID" ] && kill "$ASTRO_PID" 2>/dev/null || true
  lsof -ti "tcp:4321" -sTCP:LISTEN | xargs kill 2>/dev/null || true
  wait "$ASTRO_PID" 2>/dev/null || true
}
cleanup() { stop_astro; kill "$STUDIO_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

start_astro "$@"
LAST=$(stamp)
while kill -0 "$ASTRO_PID" 2>/dev/null; do
  sleep 2
  NOW=$(stamp)
  if [ "$NOW" != "$LAST" ]; then
    LAST=$NOW
    echo
    echo "studio: package.json / astro config changed, restarting the preview so it keeps updating"
    stop_astro
    start_astro "$@"
  fi
done
