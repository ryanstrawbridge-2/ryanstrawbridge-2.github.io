# Portfolio site — Claude project context

<!--
  Loaded in every session that touches this repo. Stacks on top of ~/CLAUDE.md.
  Keep under 150 lines. Only things Claude can't figure out by reading the code.
  Prune when something becomes obvious from the codebase itself.

  Personal/secret overrides go in CLAUDE.local.md (gitignored). This file is committed.
-->

## What this repo is

- Ryan's personal portfolio site, replacing his old Wix site.
- **Live:** https://ryanstrawbridge-2.github.io
- **GitHub repo:** `ryanstrawbridge-2/ryanstrawbridge-2.github.io` (default branch `main`)
- **Stack:** Astro 6 (static), GitHub Pages, GitHub Actions deploy, Pages CMS (forms, in the browser) and studio (`npm run studio`, live on the page) for content editing. TinaCMS was removed on 2026-11-12.
- **Editing model:** Ryan should be able to edit content visually (Pages CMS / studio), not via terminal. Code/layout/structural changes happen here in Claude.

## Build & verify commands

<!-- Claude can't infer these. List the exact commands. -->

```bash
npm install              # first time
npm run dev              # localhost:4321, hot reload
npm run build            # plain Astro build (always works)
npm run preview          # serve the built site
npm run photos           # intake: resize/strip/file new photos + video
npm run model <f.glb>    # compress a CAD model into public/models/ (4 MB budget)
npm run photos:shrink    # re-encode oversized images already in src/assets
npm run check:media      # src/assets/images layout (no loose/camera-named uploads)
npm run check:copy       # no PLACEHOLDER / TODO text in fields that publish
# studio: theme / text / phone preview / publish / undo (⌘Z) — see HANDBOOK.md
npm run studio           # dev server + live editor (drag-to-crop, drop-to-upload)
npm run studio:test      # with studio running: every editor route, undone, files proven identical (--build adds the dist check)
```

- Pre-commit hook runs `npm run build`. Skip with `--no-verify` only when truly necessary.
- GitHub Actions deploys on every push to `main` (~2 min).

## Key paths

<!-- Add new locations here as the project grows. -->

| What | Where |
|------|-------|
| Project pages | `src/content/projects/*.md` (frontmatter + body) |
| Home page text | `src/data/home.json` (form-editable in CMS) |
| Site settings | `src/data/site.json` (accent color, container width) |
| Navigation | `src/data/navigation.json` |
| Astro pages | `src/pages/index.astro`, `src/pages/projects/[slug].astro` |
| Optimized images | `src/assets/images/` (Astro processes these) |
| Static videos | `public/videos/` (not processed) |
| Pages CMS schema | `.pages.yml` |
| Auto-sync script | `scripts/auto-sync.sh` |
| Photo/video intake | `scripts/media-intake.mjs` (`npm run photos`) |
| 3D model intake | `scripts/model-intake.mjs` (`npm run model`), `src/components/Model3D.astro`, models in `public/models/` |
| Live editor (dev only) | `scripts/studio.sh` (`npm run studio`, supervises astro dev), `scripts/studio-server.mjs` (writer, port 4322), `scripts/studio/*.js` + `overlay.css` (the UI, one module per feature, served by the writer), `src/components/StudioOverlay.astro` (markup + the two tags that load them) |
| Undo journal + trash | `scripts/lib/journal.mjs`, `.photo-trash/` (gitignored) |
| Career roadmap (parked) | `src/pages/_roadmap.astro` + `src/data/roadmap.json` — the `_` prefix keeps Astro from routing it, so the page is NOT built and nothing links to it. To bring it back: rename to `roadmap.astro`, re-add the nav item to `src/data/navigation.json`, and restore the `roadmap` collection in `.pages.yml` (its image field needs `output: /src/assets/images/roadmap/{name}{extension}` — the version removed here wrote to the assets root, which `check:media` rejects, gotcha 27). |
| Shared media/frontmatter helpers | `scripts/lib/media.mjs`, `scripts/lib/frontmatter.mjs`, `scripts/lib/homejson.mjs`, `scripts/lib/orphans.mjs` |
| Gallery placement helpers | `src/lib/gallery.ts` + `src/components/GalleryGrid.astro` |
| Studio field markers | `src/lib/edit-fields.ts` (`data-field="project:…"` / `"home:…"`, dev only) |
| Walkthrough figures | `src/lib/figures.ts` + `src/components/ProjectFigure.astro`; authored in each project's `figures:` frontmatter |
| Placeholder-copy guard | `scripts/check-placeholder-copy.mjs` (`npm run check:copy`) |
| Media layout guard | `scripts/check-media-layout.mjs` (`npm run check:media`) |
| Ryan's photo library (gitignored) | `portfolio-photos/<project-slug>/` — 138 originals, folders named for the site's project slugs; studio browses and copies from it; the ONLY write is Save filing `photo-inbox/PREFIX_*` originals into `<slug>/` (or `general/`) via `scripts/lib/inbox-file.mjs`: a rename, add-only, never overwrites (`name 2.ext`). Also `npm run photos:sort [--dry-run]`. `wix-archive/` is the unsorted legacy Wix export. |
| Intake queue (gitignored) | `photo-inbox/PREFIX_title.ext` routed by `photo-prefixes.json` (parser: `scripts/lib/prefixes.mjs`, shared by studio library + `npm run photos`); legacy `photo-inbox/<slug>/` still works; processed originals in `photo-inbox/_done/` |
| SSH key for git | `~/.ssh/id_ed25519_portfolio` |
| Auto-sync log | `~/Library/Logs/portfolio-sync/sync.log` |

## Push behavior — important

GitHub SSH push from background processes stalls on large payloads.

- **Hard rules:** never push >5 MB of new binary content in one commit; never re-init `.git` to clean history (creates 50 MB+ pushes).
- If a push stalls: `pkill -9 -f "git push"`, retry with timeout, or ask Ryan to push from his Terminal.
- Hourly `launchd` job runs `scripts/auto-sync.sh`, now READ-ONLY (2026-11-12): fetch, notify about commits on GitHub's main not on this Mac or an unfinished Go live, check the site is up. It never pulls, rebases or pushes; Go live owns syncing.

## Content and build gotchas (learned the hard way)

1–9. **Retired with TinaCMS (2026-11-12).** These covered Tina's image-path
    translation, `tina-lock.json`, the hand-rolled visual-editing bridge and
    its CMS thumbnails. Tina silently dropped fields it didn't know (figures,
    zoom, heroZoom) and studio now covers visual editing, so it was removed:
    `tina/`, `TinaEditBridge`, `check:tina`, `build:tina`, the thumbnails
    script and the `/admin/` route. Pages CMS remains. If TinaCloud or the
    `TINA_TOKEN` / `TINA_PUBLIC_CLIENT_ID` GitHub secrets still exist, they
    are unused and can be deleted. Numbers kept so references below hold.
10. **`image()` fields emit their full-size original; the build prunes them.**
    Astro copies every `image()` source into `dist` even when only resized
    variants are used. `scripts/prune-unreferenced-assets.mjs` (last step of
    `npm run build`) deletes the ones no page references: about 45 MB on
    2026-11-12, leaving `dist` at ~46 MB, of which ~20 MB is video and ~21 MB
    resized images. If deploys get slow, the next wins are re-encoding the
    three ~5 MB videos and capping image widths, not this.

11. **Gallery placement is a body split, not a layout trick.** `[slug].astro`
    cuts `project.rendered.html` at each `<h2 id=...>` and drops the matching
    gallery group after each chunk. That only works while the body has no
    markdown images of its own — those come through as placeholders that
    `<Content />` resolves and `set:html` would emit raw. The guard is
    `rendered.metadata.imagePaths.length === 0`; when it trips, every item
    silently falls back to the bottom of the page. If someone adds a body image
    and inline photos stop working, that's why.
12. **Retired** (the `check:tina` placement note; Tina is gone).
13. **`--shrink` must never change a file's container format.** It rewrites in
    place under the existing name so no path changes, which means a `.png`
    holding JPEG bytes would sail past sharp and then trip Astro's own
    extension-based probe. `encodeKeepingFormat()` exists for that; `--jpeg` is
    intake-only.

14. **Studio must never reach production.** The overlay's code is not in
    `src/` at all: `scripts/studio/*.js` and `overlay.css` are served by the
    writer at `http://127.0.0.1:4322/overlay/`, and `StudioOverlay.astro`
    emits the `<link>`/`<script type=module>` tags only when
    `import.meta.env.DEV`. The markup is inside the same guard. Re-check with:
    `npm run build && grep -rl "studio-\|4322" dist/ | head`
    Editing a file in `scripts/studio/` does not hot-reload; reload the page.
15. **A Vite restart kills content watching for the rest of the session.**
    Touching `package.json`, the lockfile or `astro.config.mjs` restarts Vite
    in-process and the content watcher never comes back: writes succeed, the
    page keeps showing old frontmatter. `studio.sh` now supervises astro dev
    and restarts the whole process when any of those change. The old
    workaround (touching `content.config.ts` after every write) is gone: it
    made every edit reload the page twice. One reload per save is Astro's own.
16. **Studio writes frontmatter with `yaml`'s Document API, not gray-matter.**
    It round-trips byte-identically, so a one-field edit is a one-line diff.
    A full reserialize would rewrite quoting and key order on a file Pages CMS
    also writes, and collide with the next CMS commit.
17. **`/usr/bin/avconvert` handles .mov → .mp4.** Ships with macOS; no ffmpeg or
    Homebrew needed. `Preset960x540` lands a typical phone clip under the 5 MB
    that SSH pushes stall on.

18. **The library browser is read-only by contract.** `/library`, `/library/thumb`
    and `/library/pick` in `studio-server.mjs` only ever read `portfolio-photos/`;
    picking copies through the same `encode()` as every other path. Keep it that
    way — that folder is Ryan's organised archive of originals and is not backed
    up by git. `libraryPath()` resolves and rejects anything escaping the
    library root, so a crafted `folder=../../.ssh` can't read the filesystem.
    One deliberate exception, at Ryan's request (2026-11-11): Save files
    inbox originals INTO it by prefix (`scripts/lib/inbox-file.mjs`). Rename
    only, add-only, never overwrites. Don't widen that into edits or deletes.
19. **A deployed static site cannot read files off Ryan's Mac.** This comes up:
    anything a visitor sees must be committed. The library panel exists so the
    originals can STAY local while only the picked, optimised copies enter the
    repo — that's the closest thing to "pull from my machine" that works.

20. **Studio finds editable things by `data-field`.** `src/lib/edit-fields.ts`
    emits `data-field="home:aboutSection.photo"` / `"project:figures.0.takeaway"`
    in dev only. Home photo slots, Text mode and figure text all key off it. If
    one is removed from a template, that thing silently stops being editable
    in studio.
21. **Two different conventions for a video path.** `home.json` showcase items
    feed `<source src>` directly and store `/videos/x.mp4`; project gallery rows
    store a bare `x.mp4` and the template prefixes it. `homeVideoRef()` exists
    for that. Don't unify one without changing the other template.
22. **Overlay CSS is a plain stylesheet** (`scripts/studio/overlay.css`), not
    Astro-scoped: no `:global()`, and it targets page markup by class.
23. **`scripts/lib/orphans.mjs` deletes files, so its scanner has to be exact.**
    It parses `src/data/*.json` and project frontmatter with real JSON/YAML
    parsers, never a regex: a field a regex misses is a photo that's still on
    the page getting deleted. If it can't parse something it returns null and
    deletes nothing. The rule is unreferenced AND untracked -> delete;
    unreferenced AND tracked -> report only, because git still has it and
    removing it saves nothing in history. Verified against an independent parse:
    48 referenced files, zero missed.

24. **Alt field names differ per home section.** `hero.headshot` pairs with
    `hero.headshotAlt`, `aboutSection.photo` with `aboutSection.photoAlt`, while
    showcase and interest items use a sibling `alt`; experience logos have none
    (index.astro uses `item.org`). `homeAltPath()` tries both shapes and keeps
    whichever exists rather than hardcoding the table.
25. **A studio save reloads the page, so UI opened in the same tick dies.**
    The alt prompt after a replace has to be parked in sessionStorage and
    reopened on the next load — opening it inline looked like it worked and then
    vanished. Anything else that needs to outlive a save needs the same trick.

26. **iCloud Drive syncs ~/Documents, and it forks conflict copies.** A build
    rewrites hundreds of files at once, iCloud sees the churn and writes
    `thing 2.webp` next to `thing.webp` — 783 of them accumulated in `dist/`,
    and one reached `src/assets/images/home/`. `dist`, `.astro` and
    `node_modules` are now excluded with
    `xattr -w 'com.apple.fileprovider.ignore#P' 1 <dir>`; re-apply that after
    deleting and recreating any of them. `publish.sh` refuses to publish while
    a `* [0-9].*` file sits in `src/`, `public/` or `resume/`.

27. **Pages CMS wrote every home-page image to the ROOT of `src/assets/images`.**
    Six fields in `.pages.yml` (hero headshot, showcase image, experience logo,
    about photo, interest image, interest extraImages) had
    `output: /src/assets/images/{name}{extension}`. That is where
    `IMG_5594.jpeg`, `IMG_5595.jpeg` and `lifttestblurred.png` came from. They
    now write to `home/`, which is also where studio writes. If a new image
    field is added, give it a subfolder or `check:media` will reject the upload.
28. **macOS screenshot filenames contain U+202F, not a space.** "Screenshot
    2026-09-02 at 5.01.37 PM.png" has a NARROW NO-BREAK SPACE before "PM". A
    literal `'… 5.01.37 PM.png'` in a script does not match it, and
    `existsSync` returns false with no error — a move loop skips the file and
    reports nothing. Glob it (`Screenshot*PM.png`) or match on the prefix.
29. **A case-only rename needs two steps on APFS.** `Layerdowner` ->
    `layerdowner` is a no-op for `existsSync` and silently does nothing through
    a plain rename-into-target loop. Go via a temp name.
30. **`home/weld-in-action.jpeg` and `home/weldinaction.jpg` are different
    photographs.** They look like a duplicate pair and are not — mean per-pixel
    difference 47/255 against 1.17 for the files that genuinely were duplicates.
    Don't "clean up" one of them. Compare pixels before calling anything a
    duplicate; filenames and file sizes both lie.

31. **The undo journal snapshots every text file, deliberately.** It does not
    try to work out which file a route touches — it photographs all eight
    project markdown files plus the three `src/data/*.json` (about 30 KB) and
    diffs the media tree around the write. Guessing wrong would silently fail
    to restore something, and an undo that is only usually right is worse than
    none. A new write endpoint is undoable without registering anything.
32. **Deletes are moves now.** `cleanupDisplaced` relocates a displaced file to
    `.photo-trash/<its original path>` instead of unlinking it, because undo
    can only restore bytes that still exist. If you add a path that removes
    media, go through `trashFile` or undo will report `missing`.
33. **A debounced save can be eaten by the HMR reload.** Any write nudges
    Astro; the reload lands ~250ms later and takes pending timers with it. The
    zoom gesture hit this — it looked applied, then came back at its old value.
    `queueSave` flushes with `sendBeacon` on `pagehide`. Anything else
    debounced must go through it.
34. **`releasePointerCapture` throws if the pointer is already gone.** It sat
    outside the try in both drag handlers, so losing capture mid-drag silently
    discarded the save the drag was for. Both calls are wrapped now.
35. **A `display` declaration beats the `hidden` attribute.** `.flight-controls
    { display: flex }` kept the roadmap's flight toggle on screen at phone
    width even with `hidden` set, because the UA's `[hidden] { display: none }`
    loses on specificity. Any element that is both `display:`-styled and
    toggled with `hidden` needs its own `[hidden] { display: none }`.
36. **Inline text editing reads the SOURCE, never the screen.** `hero.tagline`
    renders `*bridge*` as italics; writing back `el.textContent` would eat the
    asterisks. `/home/value` and `/project/value` return the raw string, and
    the editor only goes contenteditable when source and rendered text match.
    `body` and `gallery` are excluded — the body field is a whole rendered
    document, not a value, and needs real source mapping.
37. **`setPath` takes `{ create: true }` for optional leaves.** Crop fields
    don't exist until something is cropped. The parent must still exist, so a
    typo'd section name is still refused.

38. **The 3D viewer runtime is 283 KB gzipped — bigger than the whole first
    page load — so nothing about it may be eager.** `Model3D.astro` ships a
    4 KB stub; `await import('@google/model-viewer')` inside the click handler
    is what makes Vite split the 1 MB chunk out. Verified: the ITD page's HTML
    references only the stub. If that import is ever hoisted to the top of the
    module, every visitor pays for it. Re-check with:
    `grep -o 'src="/_astro/[^"]*\.js"' dist/projects/<slug>/index.html`
39. **`npm run model` takes glTF or SolidWorks STL.** STL can be one file, a
    folder, or a zip of the per-component export ("Save all components of an
    assembly in a single file" unticked: each part arrives in assembly
    coordinates). `scripts/lib/stl.mjs` colours parts by filename (boards,
    fasteners, housing see-through), centres and converts mm -> m; then
    meshopt simplifies toward `MODEL_TRIANGLES` (300k) and halves until under
    the 4 MB budget, and Draco compresses. No normals are written (three.js
    flat-shades, reads as CAD). `scripts/lib/poster.mjs` software-renders a
    poster to `public/models/<name>.webp`, which `Model3D` uses automatically:
    a browser can't read WebGL back from a background tab. STEP still needs
    converting first. The ITD: 99 parts, 2.35M tris -> 0.73 MB.
40. **gltf-transform brings its own sharp.** Importing sharp at the top of
    model-intake as well made macOS warn about two libvips in one process.
    It's imported lazily now, and only when the model actually has textures —
    most CAD exports have none.

41. **A CMS schema that doesn't list a field DROPS it on save.** Pages CMS
    writes back only the fields `.pages.yml` declares, so a crop, zoom or 3D
    model set in studio would vanish the next time that row was saved in the
    CMS. Whenever a field is added to `src/content.config.ts`, add it to
    `.pages.yml` in the same change. (TinaCMS had the same problem and was
    never brought in step; that is part of why it was removed.)
42. **Walkthrough figures are a second list, not more gallery fields.** A
    gallery row is a photograph; a figure is a claim with evidence — headline,
    picture, numbered points, and callout markers pinned to the picture at
    PERCENTAGE positions so they survive any crop or resize. `figures:` in
    frontmatter, rendered by `ProjectFigure.astro`, placed by the same
    heading-slug matching as the gallery. Point N pairs with callout N; that
    pairing is the whole interaction, both on hover and on focus.
43. **A figure with no media is a placeholder, and placeholders are dev-only.**
    `normalizeFigures(figures, import.meta.env.DEV)` drops them from a
    production build, so a page mid-authoring never ships a row of empty
    frames. Figure NUMBERING is assigned before that filter, so "Fig. 4" means
    the same thing in both builds.
44. **The skeleton is dev-only; the COPY is not.** A figure that has a real
    photo and still says "PLACEHOLDER COPY" renders that headline to the world
    — the guard in gotcha 43 only hides frames with no media. That is what
    `npm run check:copy` is for: it greps PLACEHOLDER/TODO/FIXME/ADD FS out of
    every publishable frontmatter field, exempting `plan`, which exists to hold
    notes-to-self and never renders outside dev. Warn-only by default,
    `--strict` in publish.sh — same reasoning as check:media.
45. **`aspect-ratio` resolves against `min-height` when width is auto.** The
    placeholder skeleton had `min-height: 220px` and `aspect-ratio: 16/9` with
    no width, so the browser computed the WIDTH from the height — 391px inside
    a 335px column — and put every project page into horizontal scroll on a
    phone. `width: 100%` on that element is load-bearing: it makes the ratio
    derive height from width, which is the direction intended. Any element
    with both a min-height and an aspect-ratio needs a definite width.
46. **Retired.** `TinaEditBridge` used to serialise frontmatter into the live
    HTML; it's gone, and the dev-only `data-field` markers don't reach the build.
47. **Callout markers anchor on the dot.** `.pfig-callout` holds dot + label;
    translating the whole button by -50% centred the PAIR on (x, y), so every
    marker sat half a label-width off its target. Each `place-*` now offsets by
    half the dot (0.8rem) on its own axis. Change the dot size, change that.
48. **The main photo sits in a clipping `.hero-frame`** so `heroZoom` crops at
    the rounded edge. `heroZoom` is in `.pages.yml`.
49. **Restarting the studio writer by hand loses undo.** The journal is in
    memory. `studio.sh` now kills whatever holds 4322 before starting, so a
    hand-started writer can't block the next `npm run studio`.

50. **Home crop fields: suffixed for fixed slots, sibling for list rows.**
    `hero.headshotFocalPoint` / `headshotZoom`, `aboutSection.photoFocalPoint`
    / `photoZoom`; list rows (`showcase.items.N`, `interestsSection.items.N`)
    use `focal` / `zoom` beside the image. `homeCropPaths` used to strip
    `.photo` first, so about-photo crops landed in `aboutSection.focal` and the
    headshot in `hero.focal`, fields `index.astro` never read: the crop showed
    while dragging and vanished on reload. Any new home image slot needs its
    crop wired in the template too, or it repeats this. Logos are not croppable.

51. **Save and Go live are separate steps.** Studio's Save button is
    `git add -A && git commit --no-verify` on the current branch: a local
    checkpoint, never a push. It refuses on `main` (the branch that deploys). Go live runs
    `scripts/publish.sh` behind a confirm popup. The script works from any
    branch: saves unsaved edits, merges in anything new on GitHub's main,
    builds, pushes `HEAD` to `origin/main` (one save at a time if over 5 MB of
    media), then `git branch -f main HEAD`. Over 5 MB of new media it uploads in
    ~4 MB steps to a scratch branch `golive-upload` first, so `main` moves
    once and the site deploys once. `PUBLISH_DRY_RUN=1` does every step but
    the save and the push. check:copy ignores figures with no picture and draft
    projects, since neither can render in production.
52. **Figure text edits are dotted paths; `patchTopLevel` must not write
    them as keys.** Studio's Text mode sends `figures.0.takeaway` to
    `/project/patch`. `doc.set()` wrote that as a literal top-level key, so the
    edit landed at the bottom of the frontmatter where nothing reads it (Ryan's
    "Redesigned the joint…" was lost that way). Dotted keys now go through
    `setIn` with numeric list indexes, and refuse if the item doesn't exist.
    Every figure has a studio toolbar (Add photo / Before / After / Delete);
    placeholders are click-or-drop zones. `/figure/upload`, `/figure/delete`
    and `/library/pick` with `figure` + `figureSlot` (`image` | `compare`)
    back them, all journalled. Since the route consolidation those are
    `/project/patch` (any field by dotted path), `/project/list` (add /
    remove / move on gallery, figures, a figure's points or callouts) and
    `/media` (every photo or video: target gallery | hero | figure | home,
    from an upload or a library pick).
    Figure photos crop like gallery photos (drag / pinch). A comparison's
    after side has its own `compareFocal` / `compareZoom`. `.project-body img`
    carries a 1.5rem prose margin; `.pfig-frame img` must zero it or the photo
    drops 24px out of its frame and over the caption.
    Zoom is clipped by `.pfig-crop` (overflow hidden) around the img, not by
    a clip-path on the img: that scaled with the transform and let a zoomed
    photo spill out. A figure at `aspect: auto` has no crop room until zoomed;
    give it a ratio to drag-crop.

## macOS gotchas

- `/usr/bin/timeout` doesn't exist. Use the `timeout_cmd` perl wrapper in `scripts/auto-sync.sh`.
- `bash` needs Full Disk Access for launchd-spawned scripts to read `~/Documents` (already granted).
- Terminal.app needs Documents folder access for `git` (already granted).
- Auto-mode classifier blocks "persistence mechanisms". For new launchd plists, write the file but let Ryan load it manually.

## Editing approaches (Ryan's options)

1. **Pages CMS** at https://app.pagescms.org/ — form-based, his daily driver for content.
2. **Studio** (`npm run studio`) — edit on the page itself: text, photos, crops, figures, Save, Go live.
3. **Local files via Claude** — for layout, new sections, or anything structural.

## Media handling — the rule

Never add an image to `src/assets/images/` by hand or by CMS upload. Run
`npm run photos`. CMS uploads land full-size in the directory ROOT with camera
filenames; that produced a 14 MB PNG commit and 19 loose files before the intake
existed. Everything new belongs in `src/assets/images/projects/<slug>/`.

**The layout is now enforced.** `src/assets/images/` has exactly four top-level
folders — `about/`, `experience/`, `home/`, `projects/<slug>/` — and nothing
loose at the root. `npm run check:media` fails on a root-level file, an
unexpected top folder, a space in a filename, an iCloud conflict copy, or a name
that says nothing about the photo (`IMG_1234`, `Picture1`, `Screenshot…`, a bare
UUID). `publish.sh` runs it with `--strict`; the script itself is warn-only so a
CMS commit can never fail the GitHub Actions deploy and leave the site silently
stale.

Name files for what they show. The names in the repo came from each gallery
item's own `alt`/`caption`, which is where to look when you need one.

## Per-project content structure

<!-- The pattern every project page in src/content/projects/ follows. Preserve this. -->

Frontmatter: `title`, `subtitle`, `organization`, `date`, `summary`, `hero`, `heroAlt`, `tools[]`, `order`.
Body sections: **Problem** → **What I did** → **Outcome**. Don't deviate from this without asking.

The page renders as a walkthrough: body text sets up each section, then the
`figures` for that section follow as presentation-style blocks (headline,
picture, numbered points, callouts), then any plain gallery photos. The sticky
rail carries organization, date, tools and jump links — tools are NOT repeated
in the page header.

## What's deliberately NOT in the repo

- `.env.local` (old TinaCMS credentials, unused now; gitignored).
- `public/RyanStrawbridgeResume.pdf` — the download linked from the home page. The filename is what visitors get, so keep it presentable; drop the latest compile here when applying.
- Source 5712×4284 photos — resized to 2400px max before commit.
- The 4th hero video (`home-hero.mp4`) — too large to push.

## When in doubt

Read `HANDBOOK.md` for the user-facing perspective on these same systems.
