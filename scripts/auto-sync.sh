#!/bin/bash
# Portfolio auto-sync: pulls remote changes and pushes any local commits.
# Run hourly by ~/Library/LaunchAgents/com.ryanstrawbridge.portfolio-sync.plist.
#
# Behavior:
# - If working tree has uncommitted changes: log it (don't auto-commit), still
#   try to absorb remote changes if any.
# - If local is behind: rebase to absorb remote commits.
# - If local is ahead: push (with a 90s timeout so it can't hang for hours).
# - If diverged: rebase first, then push.
# - On success: verify live site returns 200.
# - On failure: post a macOS notification so you see it (silently if Mac is off).
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
  log "ERROR: git fetch timed out or failed"
  # Don't notify on transient network errors. Just log and try again next hour.
  exit 1
fi

# Note uncommitted changes but still try to sync if we can.
HAS_UNCOMMITTED=0
if [ -n "$(git status --porcelain)" ]; then
  HAS_UNCOMMITTED=1
  log "note: uncommitted changes in working tree (skipping rebase if remote also moved)"
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
  if [ "$HAS_UNCOMMITTED" = 1 ]; then
    log "skip: remote has new commits but local has uncommitted changes — won't risk a rebase conflict"
    exit 0
  fi
  log "remote ahead — rebasing local main onto origin/main"
  if timeout_cmd 60 git pull --rebase origin main >>"$LOG_FILE" 2>&1; then
    log "rebase OK; local is now at $(git rev-parse --short HEAD)"
    did_change=1
  else
    log "ERROR: rebase failed; aborting and bailing"
    git rebase --abort 2>>"$LOG_FILE" || true
    notify "Rebase conflict" "Manual resolution needed in portfolio repo"
    exit 1
  fi

# Local is ahead → push
elif [ "$REMOTE" = "$BASE" ]; then
  COMMITS_AHEAD=$(git rev-list --count origin/main..main)
  log "local ahead by $COMMITS_AHEAD commit(s) — pushing"

# Diverged → rebase then push
else
  if [ "$HAS_UNCOMMITTED" = 1 ]; then
    log "skip: history diverged AND uncommitted changes — too risky to auto-resolve"
    notify "Sync skipped" "Diverged history with uncommitted local changes — manual review needed"
    exit 0
  fi
  log "diverged — rebasing then pushing"
  if ! timeout_cmd 60 git pull --rebase origin main >>"$LOG_FILE" 2>&1; then
    log "ERROR: divergent rebase failed"
    git rebase --abort 2>>"$LOG_FILE" || true
    notify "Rebase conflict" "Manual resolution needed in portfolio repo"
    exit 1
  fi
fi

# If we still have commits to push, push them with a timeout.
if [ "$(git rev-list --count origin/main..main)" -gt 0 ]; then
  if timeout_cmd "$PUSH_TIMEOUT" git push origin main >>"$LOG_FILE" 2>&1; then
    log "push OK"
    did_change=1
  else
    rc=$?
    log "ERROR: push timed out after ${PUSH_TIMEOUT}s or failed (rc=$rc, will retry next run)"
    # Don't notify on first failure — retry next hour and only notify if persistent.
    # Track consecutive failures.
    FAIL_FILE="$LOG_DIR/.consecutive-push-failures"
    FAILS=$(cat "$FAIL_FILE" 2>/dev/null || echo 0)
    FAILS=$((FAILS + 1))
    echo "$FAILS" > "$FAIL_FILE"
    if [ "$FAILS" -ge 3 ]; then
      notify "Push stuck" "Pushes have failed $FAILS times in a row — manual look needed"
    fi
    exit 1
  fi
  # Reset consecutive-failure counter on success.
  rm -f "$LOG_DIR/.consecutive-push-failures"
fi

# After a successful sync, verify the live site. Wait a bit for Actions to deploy.
if [ "$did_change" = 1 ]; then
  /bin/sleep 90
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" -L --max-time 30 "$LIVE_URL" || echo "000")
  if [ "$CODE" = "200" ]; then
    log "live site: 200 OK"
  else
    log "WARN: live site returned $CODE (deploy may still be running, will recheck next run)"
    # Track consecutive site failures too.
    SITE_FAIL_FILE="$LOG_DIR/.consecutive-site-failures"
    SITE_FAILS=$(cat "$SITE_FAIL_FILE" 2>/dev/null || echo 0)
    SITE_FAILS=$((SITE_FAILS + 1))
    echo "$SITE_FAILS" > "$SITE_FAIL_FILE"
    if [ "$SITE_FAILS" -ge 2 ]; then
      notify "Site down" "Live site returned $CODE for $SITE_FAILS consecutive checks"
    fi
  fi
fi

# Always do a passive site check at the end (even if we didn't change anything).
# Useful for catching site-down without any local activity.
if [ "$did_change" != 1 ]; then
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" -L --max-time 15 "$LIVE_URL" || echo "000")
  if [ "$CODE" != "200" ]; then
    log "WARN: passive uptime check — live site returned $CODE"
  else
    rm -f "$LOG_DIR/.consecutive-site-failures"
  fi
fi
