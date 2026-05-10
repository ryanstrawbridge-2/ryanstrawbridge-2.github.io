#!/bin/bash
# Portfolio auto-sync: pulls remote changes and pushes any local commits.
# Run hourly by ~/Library/LaunchAgents/com.ryanstrawbridge.portfolio-sync.plist.
#
# Behavior:
# - If working tree has uncommitted changes, do nothing (don't auto-commit).
# - If local is behind: rebase to absorb remote commits.
# - If local is ahead: push (with a 90s timeout so it can't hang for hours).
# - If diverged: rebase first, then push.
# - Verify live site returns 200 after a successful push.
# - All output goes to ~/Library/Logs/portfolio-sync/sync.log.

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

# Portable timeout wrapper. macOS doesn't ship GNU `timeout`; use perl's alarm.
# Usage: timeout_cmd 30 git fetch origin main
timeout_cmd() {
  local secs=$1; shift
  perl -e 'alarm shift; exec @ARGV or die "exec: $!"' "$secs" "$@"
}

# Trim log if it gets large (keep most recent 2000 lines).
if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE" | tr -d ' ')" -gt 2000 ]; then
  tail -2000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi

cd "$REPO" 2>/dev/null || { log "ERROR: cannot cd to $REPO"; exit 1; }

# Bail if there's an in-progress rebase/merge from a prior run.
if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] || [ -f .git/MERGE_HEAD ]; then
  log "skip: rebase/merge in progress; resolve it manually"
  exit 0
fi

# Bail if working tree has uncommitted changes — never auto-commit user work.
if [ -n "$(git status --porcelain)" ]; then
  log "skip: uncommitted changes in working tree (commit them first or they'll block sync)"
  exit 0
fi

# Skip if SSH key is missing.
if [ ! -f "$SSH_KEY" ]; then
  log "ERROR: ssh key missing at $SSH_KEY"
  exit 1
fi

export GIT_SSH_COMMAND="ssh -i $SSH_KEY -o IdentitiesOnly=yes -o ConnectTimeout=10 -o ServerAliveInterval=10 -o ServerAliveCountMax=6"

# Fetch remote (with timeout so DNS or network blips don't hang us).
if ! timeout_cmd 30 git fetch origin main 2>>"$LOG_FILE"; then
  log "ERROR: git fetch timed out or failed"
  exit 1
fi

LOCAL=$(git rev-parse main)
REMOTE=$(git rev-parse origin/main)
BASE=$(git merge-base main origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0  # nothing to do, no log noise
fi

did_change=0

# Local is behind (remote ahead) → fast-forward / rebase
if [ "$LOCAL" = "$BASE" ]; then
  log "remote ahead — rebasing local main onto origin/main"
  if timeout_cmd 60 git pull --rebase --autostash origin main >>"$LOG_FILE" 2>&1; then
    log "rebase OK; local is now at $(git rev-parse --short HEAD)"
    did_change=1
  else
    log "ERROR: rebase failed; aborting and bailing"
    git rebase --abort 2>>"$LOG_FILE" || true
    exit 1
  fi

# Local is ahead → push
elif [ "$REMOTE" = "$BASE" ]; then
  COMMITS_AHEAD=$(git rev-list --count origin/main..main)
  log "local ahead by $COMMITS_AHEAD commit(s) — pushing"

# Diverged → rebase then push
else
  log "diverged — rebasing then pushing"
  if ! timeout_cmd 60 git pull --rebase --autostash origin main >>"$LOG_FILE" 2>&1; then
    log "ERROR: divergent rebase failed"
    git rebase --abort 2>>"$LOG_FILE" || true
    exit 1
  fi
fi

# If we still have commits to push, push them with a timeout.
if [ "$(git rev-list --count origin/main..main)" -gt 0 ]; then
  if timeout_cmd "$PUSH_TIMEOUT" git push origin main >>"$LOG_FILE" 2>&1; then
    log "push OK"
    did_change=1
  else
    log "ERROR: push timed out after ${PUSH_TIMEOUT}s or failed (will retry next run)"
    exit 1
  fi
fi

# Verify live site is up after any change. Wait briefly for Actions deploy.
if [ "$did_change" = 1 ]; then
  /bin/sleep 60
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" -L --max-time 30 "$LIVE_URL" || echo "000")
  if [ "$CODE" = "200" ]; then
    log "live site: 200 OK"
  else
    log "WARN: live site returned $CODE (deploy may still be running)"
  fi
fi
