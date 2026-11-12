#!/bin/bash
# Portfolio watch: hourly, READ-ONLY. Run by
# ~/Library/LaunchAgents/com.ryanstrawbridge.portfolio-sync.plist.
#
# It used to pull, rebase and push on its own. That predates studio's Save /
# Go live and fought them: when GitHub had new commits it rebased whatever
# branch was checked out (your working branch included), and it pushed main
# whenever main was ahead, i.e. it could publish without anyone pressing Go
# live. Go live now syncs with GitHub itself, safely, while you watch.
#
# What it does now, and nothing else:
# - fetches, and tells you (log + notification) if GitHub's main has commits
#   this Mac doesn't, e.g. a Pages CMS edit. Go live will merge them in.
# - tells you if local main has commits GitHub doesn't (a Go live whose push
#   failed). It does NOT push them; press Go live again.
# - checks the live site answers 200.
# All output goes to ~/Library/Logs/portfolio-sync/sync.log.

set -u
set -o pipefail

REPO=~/Documents/Projects/portfolio
LOG_DIR=~/Library/Logs/portfolio-sync
LOG_FILE="$LOG_DIR/sync.log"
SSH_KEY=~/.ssh/id_ed25519_portfolio
LIVE_URL=https://ryanstrawbridge-2.github.io/
PUSH_TIMEOUT=90

mkdir -p "$LOG_DIR"

log() {
  printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE"
}

# macOS notification helper. Best-effort — silently noops if osascript missing.
notify() {
  local title=$1
  local body=$2
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"$body\" with title \"Portfolio: $title\"" >/dev/null 2>&1 || true
  fi
}

# Portable timeout wrapper. macOS doesn't ship GNU `timeout`; use perl's alarm.
timeout_cmd() {
  local secs=$1; shift
  perl -e 'alarm shift; exec @ARGV or die "exec: $!"' "$secs" "$@"
}

# Trim log if it gets large (keep most recent 2000 lines).
if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE" | tr -d ' ')" -gt 2000 ]; then
  tail -2000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi

cd "$REPO" 2>/dev/null || { log "ERROR: cannot cd to $REPO"; notify "ERROR" "cannot cd to repo"; exit 1; }

# Bail if there's an in-progress rebase/merge from a prior run.
if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] || [ -f .git/MERGE_HEAD ]; then
  log "skip: rebase/merge in progress; resolve it manually"
  notify "Stuck rebase" "Resolve the in-progress rebase manually"
  exit 0
fi

# Skip if SSH key is missing.
if [ ! -f "$SSH_KEY" ]; then
  log "ERROR: ssh key missing at $SSH_KEY"
  notify "ERROR" "SSH key missing — pushes won't work"
  exit 1
fi

export GIT_SSH_COMMAND="ssh -i $SSH_KEY -o IdentitiesOnly=yes -o ConnectTimeout=10 -o ServerAliveInterval=10 -o ServerAliveCountMax=6"

# Fetch remote (with timeout so DNS or network blips don't hang us).
if ! timeout_cmd 30 git fetch origin main 2>>"$LOG_FILE"; then
  log "fetch failed (offline?); will try next hour"
  exit 0
fi

BEHIND=$(git rev-list --count main..origin/main 2>/dev/null || echo 0)
AHEAD=$(git rev-list --count origin/main..main 2>/dev/null || echo 0)

if [ "$BEHIND" -gt 0 ]; then
  log "GitHub has $BEHIND commit(s) this Mac doesn't (CMS edit?). Not touching anything; Go live merges them in."
  notify "Changes on GitHub" "$BEHIND commit(s) on the live branch that aren't on this Mac. Go live will merge them."
fi
if [ "$AHEAD" -gt 0 ]; then
  log "local main is $AHEAD commit(s) ahead of GitHub: a Go live push didn't finish. Not pushing; press Go live again."
  notify "Go live didn't finish" "$AHEAD saved change(s) never reached the live site. Press Go live again."
fi

CODE=$(curl -sS -o /dev/null -w "%{http_code}" -L --max-time 15 "$LIVE_URL" || echo "000")
if [ "$CODE" != "200" ]; then
  log "WARN: live site returned $CODE"
  SITE_FAIL_FILE="$LOG_DIR/.consecutive-site-failures"
  SITE_FAILS=$(( $(cat "$SITE_FAIL_FILE" 2>/dev/null || echo 0) + 1 ))
  echo "$SITE_FAILS" > "$SITE_FAIL_FILE"
  [ "$SITE_FAILS" -ge 2 ] && notify "Site down" "Live site returned $CODE for $SITE_FAILS checks in a row"
else
  rm -f "$LOG_DIR/.consecutive-site-failures"
fi
