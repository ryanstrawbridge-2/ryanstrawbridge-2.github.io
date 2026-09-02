# Portfolio handbook

<!--
  User-facing reference for working with this site. Stable info only — anything
  time-bound (session notes, recent build summaries, current TODO state) goes
  in commit messages or PR descriptions, NOT here.

  Sections to keep up to date:
    - Live URLs
    - Three editing methods
    - Common operations cheat sheet
    - Troubleshooting
  Sections to prune as things resolve:
    - "Open setup steps" (only while unfinished)
-->

> **Live site:** https://ryanstrawbridge-2.github.io
> **Repo:** https://github.com/ryanstrawbridge-2/ryanstrawbridge-2.github.io
> **Claude session context:** `CLAUDE.md`

---

## Three ways to edit

| Tool | URL | What it gives you | When to use |
|------|-----|-------------------|-------------|
| **Pages CMS** | https://app.pagescms.org/ | Form-based fields with image uploads | Quick text/photo swaps, daily driver |
| **TinaCMS** | https://ryanstrawbridge-2.github.io/admin/ | Click on any element on the live site, edit inline with side panel | Visual edits where you want to see the result |
| **Local + Claude** | run `scripts/dev-server.sh` → localhost:4321 | Edit code/JSON/markdown directly, see changes in <2s | Layout/structure changes, anything structural |

All three commit to the same git repo. Use whichever fits the task.

---

## Reordering gallery photos

Project gallery photos live in a **Gallery photos** list on each project's form.
Each row is labelled with its filename and alt text (`frame-04.jpeg — Lifting frame`),
so you can tell photos apart at a glance. Grab the handle at the left of a row and
drag to reorder — the order in that list is the order on the page. Save when done.

Only photos under the old `## Gallery` heading moved into this list. Images that sit
inside the write-up itself (swirl-injector, faucet-leak-ring) are still part of the
body text, where they belong.

---

## Click-to-edit (TinaCMS visual editing)

Open `/admin/`, click **Enter Edit Mode**, and the real site loads in a pane next to the form.
Every editable piece of text or image gets a dashed blue outline on hover — click it and the
sidebar jumps straight to that field.

Works on the home page and every project page. Locally (`npm run dev:tina`) saves write to disk
and the preview hot-reloads in a second or two. On the deployed `/admin/`, saves commit to GitHub
and the preview catches up after the deploy finishes (~2 min).

**What isn't clickable:** list fields as a whole — project *Tools / skills* and interest-card
*Extra thumbnails*. TinaCMS can only focus a single field, not a whole list, so those have no
outline on purpose. Edit them from the sidebar. Individual cards inside a list (experience,
interests) *are* clickable.

---

## Open setup steps

<!-- Delete this whole section once both items are done. -->

- [ ] Drop résumé PDF at `public/resume.pdf` so the home page button isn't a dead link.
- [ ] Finish TinaCloud config so `/admin/` lights up:
  - Project page: https://app.tina.io/projects/a5253d2b-6939-4ae7-903b-b1f1e02657fa
  - GitHub secrets needed: `TINA_PUBLIC_CLIENT_ID` and `TINA_TOKEN` (Content Read-only token).
  - Paste with `printf 'value' | pbcopy` so no trailing newline sneaks in.

---

## Visual focal-point picker

Drag a dot on any image to pick exactly where it should anchor when cropped.

**Open:** https://ryanstrawbridge-2.github.io/focal-picker.html

1. Upload an image (or paste a URL).
2. Pick a crop shape that matches where you'll use the photo (Wide for hero, Tall for portraits, etc.).
3. Click or drag the dot to where the photo's subject is.
4. Copy one of:
   - **9-way value** (e.g. `top-left`) → paste into the CMS dropdown.
   - **Exact percentage** (e.g. `37% 22%`) → paste into the markdown for pixel-precise control.

The site accepts both formats — schema is `string`, so any valid CSS `object-position` value works.

---

## Drag-drop section reorder

Once `/admin/` is live, TinaCMS's list fields support drag-and-drop reordering for free:

- Experience cards: `Home page → Experience section → Experience cards`
- Interest cards: same pattern under `Interests section`
- Tool tags on a project: `Projects → [pick one] → Tools / skills`

Grab the handle, drag, save. No code changes needed.

---

## What runs automatically

| What | When | Where to look if it breaks |
|------|------|----------------------------|
| Hourly auto-sync (pull + push) | Every hour, on Mac wake | `~/Library/Logs/portfolio-sync/sync.log` |
| Pre-commit build check | Every `git commit` | Aborts commit with build error |
| GitHub Actions deploy | Every push to `main` | Build status badge in `README.md`, or repo Actions tab |
| macOS notifications on real failures | Auto-sync hits a wall 3+ times | Notification Center |

If you see a "Push stuck" or "Site down" notification, run `tail ~/Library/Logs/portfolio-sync/sync.log`.

---

## Publishing local edits

After editing at `localhost:4321/admin/`, nothing is live until you publish.
One command does it:

```bash
cd ~/Documents/Projects/portfolio && npm run publish
```

With your own message:

```bash
cd ~/Documents/Projects/portfolio && npm run publish -- "Added ball valve photos"
```

It normalises the image paths TinaCMS writes in a broken form, pulls anything
that landed on GitHub while you were editing, builds (so a broken site fails on
your machine, not on the deploy), then commits and pushes. It stops if there's
nothing to publish, and asks before committing anything over 5 MB.

---

## Common operations cheat sheet

```bash
# Edit live with a local preview (changes appear in <2s):
~/Documents/Projects/portfolio/scripts/dev-server.sh
# then open http://localhost:4321/

# Force the auto-sync to run right now:
launchctl start com.ryanstrawbridge.portfolio-sync

# Check sync log:
tail -50 ~/Library/Logs/portfolio-sync/sync.log

# Manual push (if auto-sync didn't fire):
cd ~/Documents/Projects/portfolio && \
  GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_portfolio -o IdentitiesOnly=yes" \
  git push --progress

# See what was committed via CMS while you weren't watching:
cd ~/Documents/Projects/portfolio && git log --oneline -10

# Pause auto-sync (e.g. mid-edit):
launchctl unload ~/Library/LaunchAgents/com.ryanstrawbridge.portfolio-sync.plist

# Resume:
launchctl load -w ~/Library/LaunchAgents/com.ryanstrawbridge.portfolio-sync.plist
```

---

## Troubleshooting

### Push stuck for hours
Pushes have a 90-second timeout; they retry next hour. If 3+ fail in a row a notification fires. Kill zombies (`pkill -9 -f "git push"`), then run the manual push command above. SSH path can be fragile on hotspot/VPN.

### Build fails after a CMS edit
Pre-commit hook catches local commits. CMS commits bypass that hook, so GitHub Actions fails — check the badge in README. Most common cause: broken image path. Fix locally, commit, push.

### Live site shows old content
GitHub Actions deploy takes 2–3 min. Check https://github.com/ryanstrawbridge-2/ryanstrawbridge-2.github.io/actions. If deploy failed, the previous version stays live.

### Auto-sync says "skip: uncommitted changes"
You have uncommitted local edits. Auto-sync never auto-commits — it bails. Commit (`git add -A && git commit -m "…"`) or stash.

### `cannot read working directory` in Terminal
macOS blocked Terminal from `~/Documents`. Fix: System Settings → Privacy & Security → Files and Folders → enable Documents for Terminal.

---

## When to call Claude

Plain English in chat, no code needed:

- Add new images, new sections, new pages
- Change layout, typography, colors, spacing
- Build new CMS knobs when you want a new control
- Fix anything broken
- Migrate to a different platform if you outgrow this one

---

## What's deliberately not in this repo

- `.env.local` (TinaCMS credentials, gitignored)
- Original 5712×4284 source photos — resized to 2400px max before commit
- The 4th hero video (`home-hero.mp4`) — too large to push; not on the live site
