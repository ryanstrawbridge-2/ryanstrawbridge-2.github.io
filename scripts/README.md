# Portfolio scripts

## auto-sync.sh

Runs hourly via `~/Library/LaunchAgents/com.ryanstrawbridge.portfolio-sync.plist`.
Pulls remote changes and pushes any unpushed commits with a 90-second timeout
so it can't hang. Logs to `~/Library/Logs/portfolio-sync/sync.log`.

Disable temporarily:
```bash
launchctl unload ~/Library/LaunchAgents/com.ryanstrawbridge.portfolio-sync.plist
```

Re-enable:
```bash
launchctl load -w ~/Library/LaunchAgents/com.ryanstrawbridge.portfolio-sync.plist
```

Trigger a run right now (don't wait for the hour):
```bash
launchctl start com.ryanstrawbridge.portfolio-sync
```

## dev-server.sh

Runs `npm run dev` for the live-preview workflow. **Run this manually** when
you want to edit content and see changes within a few seconds:

```bash
~/Documents/Projects/portfolio/scripts/dev-server.sh
```

Then open http://localhost:4321/ in any browser. Edit content via Pages CMS in
another tab and the preview hot-reloads as the CMS commits land (the auto-sync
pulls the changes within an hour, or you can trigger it sooner with the
launchctl start command above).

If you want it to auto-start on every login, copy the plist file at
`/tmp/com.ryanstrawbridge.portfolio-dev.plist` to `~/Library/LaunchAgents/` and
load it with `launchctl load -w`. (It was kept out of LaunchAgents by default
so you opt in deliberately — auto-running dev servers is a personal call.)

## Logs

All scripts log to `~/Library/Logs/portfolio-sync/`:
- `sync.log` — auto-sync results (pull/push outcomes)
- `dev-server.log` — dev server output
- `*-launchd-*.log` — launchd-level stdout/stderr (mostly empty if things are fine)
