#!/bin/bash
# Wrapper for `npm run dev` that's safe to run as a launchd service.
# - Logs to ~/Library/Logs/portfolio-sync/dev-server.log.
# - Exits cleanly on SIGTERM so launchd stop is fast.
# - Bails if npm/node aren't on PATH.

set -u
LOG_DIR=~/Library/Logs/portfolio-sync
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/dev-server.log"

# Trim log if it gets large
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG" | tr -d ' ')" -gt 5000 ]; then
  tail -3000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

cd ~/Documents/Projects/portfolio || { echo "$(date) ERROR: cd failed" >> "$LOG"; exit 1; }

if ! command -v npm >/dev/null 2>&1; then
  echo "$(date) ERROR: npm not on PATH" >> "$LOG"
  exit 1
fi

echo "$(date) starting astro dev server on port 4321" >> "$LOG"
exec npm run dev -- --host 127.0.0.1 --port 4321 >> "$LOG" 2>&1
