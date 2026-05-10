# Portfolio Handbook

The 5-minute reference doc for working with this site, plus my honest reflection on what would make the next Claude session smoother for you.

> Live site: https://ryanstrawbridge-2.github.io
> Repo: https://github.com/ryanstrawbridge-2/ryanstrawbridge-2.github.io

---

## TL;DR — When you wake up tomorrow

3 quick wins (~10 minutes total) to unlock the next level:

### 1. Register `main` in TinaCloud (~30 sec)

Go to **https://app.tina.io/projects/a5253d2b-6939-4ae7-903b-b1f1e02657fa/configuration**, find the branches section, and add `main`. Done.

### 2. Add GitHub secrets so production builds include the visual editor (~2 min)

Go to **https://github.com/ryanstrawbridge-2/ryanstrawbridge-2.github.io/settings/secrets/actions** → `New repository secret`. Add two:
- Name: `TINA_PUBLIC_CLIENT_ID` → Value: `a5253d2b-6939-4ae7-903b-b1f1e02657fa`
- Name: `TINA_TOKEN` → Value: (the read-only token you sent me; the deploy workflow auto-detects it and switches to TinaCMS-enabled builds)

### 3. Drop your résumé PDF (~30 sec)

Save your résumé as **`public/resume.pdf`** in the repo and push. The "Résumé (PDF)" button on the home page links to that file — currently a dead link.

After step 1+2, your next push triggers a build that includes `/admin/` — a real visual editor where you click on text/images on your live site to edit them.

---

## Daily editing — three ways

| Tool | URL | What it gives you | When to use |
|------|-----|-------------------|-------------|
| **Pages CMS** | https://app.pagescms.org/ | Form-based fields with image uploads | Quick text/photo swaps, you already know it |
| **TinaCMS** (after step 1+2 above) | https://ryanstrawbridge-2.github.io/admin/ | Click on any element on your live site, edit inline with side panel | Visual edits where you want to see exact result |
| **Local files + dev server** | localhost:4321 (run `~/Documents/Projects/portfolio/scripts/dev-server.sh`) | Edit code/JSON/markdown directly, see changes in <2 seconds | Layout/structure changes, anything that needs custom work — or chat me ([Claude]) and I'll do it |

All three commit to the same git repo. Use whichever feels right per task.

---

## What runs automatically (no thinking needed)

| What | When | Where to look if it breaks |
|------|------|---|
| Hourly auto-sync (pull + push) | Every hour, on Mac wake | `~/Library/Logs/portfolio-sync/sync.log` |
| Pre-commit build check | Every `git commit` | Aborts commit with the build error |
| GitHub Actions deploy | Every push to `main` | Build status badge in `README.md`, or repo Actions tab |
| macOS notifications on real failures | When auto-sync hits a wall 3+ times | Notification Center |

If you see a "Push stuck" or "Site down" notification, that's the auto-sync flagging something it couldn't fix on its own. Run `tail ~/Library/Logs/portfolio-sync/sync.log` to see the details.

---

## Common operations cheat sheet

```bash
# Edit live with a local preview (changes appear in <2s):
~/Documents/Projects/portfolio/scripts/dev-server.sh
# then open http://localhost:4321/

# Force the auto-sync to run right now (don't wait for the hour):
launchctl start com.ryanstrawbridge.portfolio-sync

# Check sync log:
tail -50 ~/Library/Logs/portfolio-sync/sync.log

# Push manually if auto-sync didn't fire:
cd ~/Documents/Projects/portfolio && \
  GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_portfolio -o IdentitiesOnly=yes" \
  git push --progress

# See what got committed via CMS while you weren't watching:
cd ~/Documents/Projects/portfolio && git log --oneline -10

# Disable auto-sync temporarily (e.g. you're in the middle of something):
launchctl unload ~/Library/LaunchAgents/com.ryanstrawbridge.portfolio-sync.plist

# Re-enable:
launchctl load -w ~/Library/LaunchAgents/com.ryanstrawbridge.portfolio-sync.plist
```

---

## When things go wrong

### Push stuck for hours
Already mitigated: pushes have a 90-second timeout, then exit and retry next hour. If you see persistent failures (3+ in a row), a notification fires. **What to do:** kill any zombie processes (`pkill -9 -f "git push"`), run the manual push command above. If it still fails, check Mac network; SSH path can be fragile on hotspot/VPN.

### `cannot read working directory` errors in Terminal
macOS TCC blocked Terminal from `~/Documents`. **Fix:** System Settings → Privacy & Security → **Files and Folders** → enable Documents for Terminal.

### Build fails after a CMS edit
The pre-commit hook catches this for local commits. For CMS commits (which bypass the local hook), the GitHub Actions build fails — check the badge in README. The most common cause is a broken image path. **Fix:** look at the most recent commit's diff, find the bad path, fix it locally, commit, push.

### Live site shows old content
GitHub Actions deploy can take 2–3 min. Check the badge or **https://github.com/ryanstrawbridge-2/ryanstrawbridge-2.github.io/actions**. If a deploy failed, the previous version stays live.

### Auto-sync says "skip: uncommitted changes"
You have uncommitted local edits. Auto-sync never auto-commits — it'll bail until you decide. **Fix:** commit them with `git add -A && git commit -m "…"`, or stash them.

---

## When to call me back (Claude)

I can do this stuff in chat, you don't need to learn the code:
- Add new images to logo / interest / slideshow pools (any time)
- Add new sections, change layout fundamentals
- Fix anything broken
- Tweak typography, colors, spacing
- Build new CMS knobs when you want a new control
- Migrate to a different platform if you outgrow this one

Say what you want changed in plain English — "make the project gallery 3 columns instead of stacked" or "the Raytheon card text is too small." I'll handle it.

---

## My honest reflection on what would make the NEXT session smoother

This is the bit your future self / your future Claude session should read.

### What slowed us down today (so we don't repeat it)

1. **Multiple-hour push stalls** — pushing 50MB+ from background bash processes hits SSH disconnects. **Fix already in place:** chunked commits, 90s push timeout in auto-sync, fallback to your Terminal when needed. Future: keep individual commits under ~5MB worth of new binary content.
2. **macOS sandbox surprises** — Terminal needed Documents access, bash needed Full Disk Access, the auto-mode classifier blocks unverified persistence. **Fix:** all granted now; don't remove them.
3. **Wrong tool assumptions** — `auth.sveltia.app` didn't exist; `/usr/bin/timeout` not on macOS; PAT scope mismatches. **Fix:** I now verify URL exists / command exists before using it.
4. **Token lifecycle confusion** — your PAT got revoked while I was using it for API calls. **Lesson:** I should fall back to git operations as soon as a token-based path fails, not retry the same token.
5. **Pages CMS template vars that don't substitute** (`{relative}`) — silently broke an image path. **Fix:** removed the broken template; per-field paths handle it.

### What I'd build in the next session (priority-ordered, my recommendation)

1. **Finish TinaCMS deploy** (5 min once you do the 3 wakeup tasks above) — makes click-to-edit work on the live site.
2. **Visual focal-point picker** (~2 hr) — replace the 9-way dropdown with a click-on-the-image interface so you can drag a dot to where the photo should anchor. This is the #1 "Wix-like" gap.
3. **Custom domain** (~30 min + $12/yr) — `ryanstrawbridge.com` (or similar) replaces the awkward `-2` URL for employer-facing links.
4. **Section reorder via drag-drop in CMS** (~2 hr) — TinaCMS supports list reordering natively. Drag sections around on home, save, see.
5. **Image crop region tool** (~3 hr) — beyond focal point: an actual visual cropper that sets a crop region on each image. Closer to true Wix.
6. **Project gallery lightbox** (~1 hr) — click any project gallery image to open it full-size with arrow-key nav.
7. **Light/dark mode toggle** (~1 hr) — re-enable with a saner default and only after you decide you want it.
8. **Sub-domain analytics** (~30 min) — Plausible or Cloudflare Web Analytics. Privacy-friendly, free, see who visits which projects.

### What gives me autonomy through long sessions

You already did most of these. For reference / future iterations:

- **`.claude/settings.local.json`** allowlists most Bash patterns I need.
- **Full Disk Access for `/bin/bash`** unlocks Documents.
- **SSH key + auto-sync** means push doesn't depend on me sitting at the terminal.
- **Pre-commit build hook** means I can't ship broken code accidentally.
- **CLAUDE.md** (suggestion: add one) — durable instructions that load every session. Things like:
  - Site URL, repo URL, key paths
  - "Pushes can stall — chunk if file size is over X"
  - "After every CMS commit, verify the live site loads"
  - Your style preferences for copy ("avoid emoji", "concise", "engineer-toned")

I'd recommend adding a CLAUDE.md tomorrow — it would have saved me ~30 min of re-learning your context this session.

### Things that aren't worth doing

Honest list of stuff that sounds tempting but I'd skip:

- **Building a real Wix clone** — months of work, never as good as Wix.
- **Migrating to Webflow** — paid, locked-in, you'd lose ownership we just built.
- **Adding a backend / database** — your content fits in markdown/JSON, no scaling problem.
- **Multi-language support** — until you get a single non-English request, premature.
- **A/B testing or feature flags** — way over-engineered for a personal portfolio.

### My one-line recommendation

**Polish what we have. Don't add another tool.** The CMS + auto-sync + image controls are 80% of "Wix-like" already. The remaining 20% is: better image cropping (visual picker), the click-to-edit (TinaCMS once you finish setup), and a custom domain. After that, it's just adding content and refining.

---

*Last updated: this session. Future Claude — keep this current.*
