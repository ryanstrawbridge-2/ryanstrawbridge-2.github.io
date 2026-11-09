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
| **Live editor** | `npm run studio` → localhost:4321 | Drag to crop, hover for width/section/order, drop files to add | Fastest for photo work — see below |
| **`npm run photos`** | terminal | Resizes, strips metadata, files and labels new photos/video | Bulk imports from a folder |

All three commit to the same git repo. Use whichever fits the task.

---

## Live editor (the fast way)

```bash
cd ~/Documents/Projects/portfolio && npm run studio
```

Opens the site at **http://localhost:4321** with the page itself editable. Nothing
here exists on the deployed site — it's dev-only.

On any project page:

| Do this | Get this |
|---------|----------|
| **Drag a photo** | Moves its crop. The picture reframes under your cursor as you drag — no save-and-look. |
| **Hover a photo** | Toolbar: `full` / `half` / `third`, a section dropdown, `←` `→` to reorder, `✕` to remove. |
| **Drop files anywhere on the page** | Resized, metadata stripped, filed, and added to the gallery. Drop below a heading and it lands in that section. |
| **Click `library`** | Browse `portfolio-photos/` as thumbnails and click one to add it. No Finder, no folder matching. |

Every change writes straight into the project's frontmatter and the page reloads
with the real render, so what you see is what deploys. A one-field edit produces
a one-line diff — nothing else in the file gets reformatted.

Dropped `.mov` files are converted to `.mp4` automatically (macOS `avconvert`,
no install needed). Photos go through the same resize as `npm run photos`.

The pill at the bottom of the screen shows status. If its dot is **red**, the
writer isn't running — quit and start `npm run studio` again.

When you're happy:

```bash
cd ~/Documents/Projects/portfolio && npm run publish -- "Ball valve writeup"
```

### The library panel

Click **library** in the studio pill. Pick the section and width at the top,
then click a photo. The sidebar has two groups:

**On this Mac** — your `portfolio-photos/` folders. Picking makes an optimised
copy in the project folder. **Your library is never written to**: nothing is
moved, renamed or deleted. Keep organising it however you like — the folder
names don't have to match anything. Already-used photos are badged **added**.

**Already on the site** — everything committed to the repo: `src/assets/images/`
(including anything the CMS uploaded, like the `11/9` folder) and
`public/videos/`. Picking here only adds a gallery row pointing at the existing
file — no copy, no second version of the same photo. Photos already on the open
page are badged **on this page**.

`.mov` files show a ▶ badge and convert to `.mp4` on the way in.

---

**Why the page refreshes a beat after each change:** the studio forces Astro to
re-read the file so you're looking at the real render, not a preview of it.

**If edits stop showing up:** quit and run `npm run studio` again. Editing
`package.json` or `astro.config.mjs` while it's running restarts the dev server
and breaks its content watching for the rest of the session.

---

## Adding photos and video

**Don't upload originals through the CMS.** It drops the untouched file into the
root of `src/assets/images/` — which is how a 14 MB PNG and a 9.2 MB JPEG ended
up committed, and why files called `IMG_6268.jpeg` are sitting loose in there.

Use the intake instead. Drop files in `photo-inbox/<project-slug>/`, then:

```bash
cd ~/Documents/Projects/portfolio && npm run photos
```

For each file it bakes in the EXIF rotation, strips all metadata (GPS included),
resizes the long edge to 2400 px, re-encodes, files it under
`src/assets/images/projects/<slug>/` with a readable name, and appends a gallery
row to the project's markdown. Typical result: 5.6 MB → 0.7 MB.

Originals are never deleted — they move to `photo-inbox/_done/`.

Your 262 MB library in `portfolio-photos/` is left alone, but you can point the
script straight at it:

```bash
cd ~/Documents/Projects/portfolio && npm run photos -- --library
```

```bash
cd ~/Documents/Projects/portfolio && npm run photos -- lifting-frame "portfolio-photos/3 Point Lifting Frame"
```

Files named by path are only read, never moved.

**Videos:** drop an `.mp4` in the same place and it lands in `public/videos/`
with a gallery row using the `video` field. `.mov` needs converting first
(QuickTime: File → Export As). Anything over 5 MB gets flagged — commit those on
their own, since big pushes stall.

Useful flags: `--dry-run` (show, change nothing), `--jpeg` (force PNGs to JPEG —
much smaller, but bad for CAD line art), `--no-append` (print the YAML instead of
editing the markdown), `--max 1800` (smaller cap).

---

## Where each photo goes on the page

Every gallery row has three placement controls beyond drag-to-reorder:

| Control | What it does |
|---------|--------------|
| **Place under which heading?** | Type a heading from the body, e.g. `Testing`. The photo renders at the end of *that section* instead of at the bottom of the page. Blank = bottom. Capitalisation and punctuation don't matter. |
| **Width** | `Full` spans the column and is **never cropped** — use it for tall sketches and wide CAD renders. `Half` and `Third` crop to 4:3 so rows line up. `Match the page layout` follows the old page-wide setting. |
| **Crop position** | Which part survives the 4:3 crop at half/third width. No effect at full width. |

Widths mix freely in one section — a full-width render above a third-width detail
shot and a half-width video is one list, no code.

If you type a heading that doesn't exist, the photo drops to the bottom of the
page rather than disappearing. On a phone everything stacks full width.

Rows are labelled with filename, alt text, width and section
(`itd-latch.jpg · Latch detail · [full] · → Testing`), so a long gallery stays
readable without opening every row.

---

## Shrinking images already in the repo

```bash
cd ~/Documents/Projects/portfolio && npm run photos:shrink
```

Re-encodes anything in `src/assets/images/` over 3 MB, in place, under the same
filename — so no markdown or JSON path changes. File formats are preserved (a
`.png` stays a PNG), because a file whose bytes disagree with its extension
builds unpredictably. Add `--dry-run` to see the numbers first, `--over 1` for a
lower threshold.

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

## Updating the résumé

The site serves `public/RyanStrawbridgeResume.pdf` — and that filename is what a
visitor's browser saves, so keep it presentable.

Overleaf can't push to this repo without Git premium, so the update is one
command instead. In Overleaf: **Menu → Download → Source** (this is free, unlike
the Git integration), then:

```bash
cd ~/Documents/Projects/portfolio && npm run resume
```

With no argument it grabs the newest `.zip` or `.pdf` from `~/Downloads`. Pass a
path to pick a specific one:

```bash
cd ~/Documents/Projects/portfolio && npm run resume -- ~/Downloads/Resume.zip
```

Given the **source zip** it extracts the `.tex` into `resume/`, compiles it, and
installs the PDF — so the source in the repo and the PDF on the site can't drift
apart. Given a **PDF** it installs just that and warns you that `resume/*.tex` is
now stale.

It stops there deliberately so you can look at the PDF before it goes out:

```bash
open public/RyanStrawbridgeResume.pdf
cd ~/Documents/Projects/portfolio && npm run publish -- "Update resume"
```

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
