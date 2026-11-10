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
- **Stack:** Astro 6 (static), GitHub Pages, GitHub Actions deploy, Pages CMS + TinaCMS for content editing.
- **Editing model:** Ryan should be able to edit content visually (Pages CMS / TinaCMS), not via terminal. Code/layout/structural changes happen here in Claude.

## Build & verify commands

<!-- Claude can't infer these. List the exact commands. -->

```bash
npm install              # first time
npm run dev              # localhost:4321, hot reload
npm run build            # plain Astro build (always works)
npm run build:tina       # Astro + TinaCMS admin (needs TINA_TOKEN in env)
npm run preview          # serve the built site
npm run photos           # intake: resize/strip/file new photos + video
npm run photos:shrink    # re-encode oversized images already in src/assets
npm run check:tina       # fragment vs tina-lock.json (catches "Unexpected Error")
npm run check:media      # src/assets/images layout (no loose/camera-named uploads)
# studio: theme / text / phone preview / publish / undo (⌘Z) — see HANDBOOK.md
npm run studio           # dev server + live editor (drag-to-crop, drop-to-upload)
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
| TinaCMS schema | `tina/config.ts` (+ `tina/tina-lock.json`) |
| Visual-editing helpers | `src/lib/tina-visual-editing.ts` |
| Visual-editing bridge | `src/components/TinaEditBridge.astro` |
| Pages CMS schema | `.pages.yml` |
| Auto-sync script | `scripts/auto-sync.sh` |
| CMS thumbnail previews | `scripts/generate-cms-thumbnails.mjs` |
| Photo/video intake | `scripts/media-intake.mjs` (`npm run photos`) |
| Live editor (dev only) | `scripts/studio.sh` (`npm run studio`), `scripts/studio-server.mjs`, `src/components/StudioOverlay.astro` |
| Undo journal + trash | `scripts/lib/journal.mjs`, `.photo-trash/` (gitignored) |
| Career roadmap | `src/pages/roadmap.astro` + `src/data/roadmap.json` |
| Shared media/frontmatter helpers | `scripts/lib/media.mjs`, `scripts/lib/frontmatter.mjs`, `scripts/lib/homejson.mjs`, `scripts/lib/orphans.mjs` |
| Gallery placement helpers | `src/lib/gallery.ts` + `src/components/GalleryGrid.astro` |
| Fragment/schema guard | `scripts/check-tina-fragment.mjs` (`npm run check:tina`) |
| Media layout guard | `scripts/check-media-layout.mjs` (`npm run check:media`) |
| Ryan's photo library (gitignored) | `portfolio-photos/<project-slug>/` — 138 originals, folders named for the site's project slugs; READ-ONLY, studio browses and copies from it, never writes. `wix-archive/` is the unsorted legacy Wix export. |
| Intake queue (gitignored) | `photo-inbox/<slug>/`, processed originals in `photo-inbox/_done/` |
| SSH key for git | `~/.ssh/id_ed25519_portfolio` |
| Auto-sync log | `~/Library/Logs/portfolio-sync/sync.log` |

## Push behavior — important

GitHub SSH push from background processes stalls on large payloads.

- **Hard rules:** never push >5 MB of new binary content in one commit; never re-init `.git` to clean history (creates 50 MB+ pushes).
- If a push stalls: `pkill -9 -f "git push"`, retry with timeout, or ask Ryan to push from his Terminal.
- Hourly `launchd` auto-sync runs `scripts/auto-sync.sh` with a 90-second push timeout.

## TinaCMS gotchas (learned the hard way)

<!-- These are non-obvious. Don't delete unless the underlying issue is gone. -->

1. **Image path translation.** Astro `image()` wants paths relative to the markdown file (`../../assets/images/...`). TinaCMS stores paths relative to its `mediaRoot` (`/src/assets/images/...`). The `parse`/`format` helpers in `tina/config.ts` translate. **When adding a new image field, copy the `ui: { parse, format }` block from the existing `hero` field** or paths get mangled.
2. **`tina/tina-lock.json` must match `tina/config.ts`.** Any schema change → regenerate: `set -a && source .env.local && set +a && npx tinacms dev` for ~10s, kill, commit. Stale lock → "local schema doesn't match remote" or 403.
3. **GitHub Actions secrets from chat keep newlines.** Use `printf 'value' | pbcopy` when pasting `TINA_TOKEN`. Trailing newline → broken JS bundle.
4. **Step-level `if:` can't see step-level `env:`** in GitHub Actions. The `if` evaluates before env binds. Use `secrets` directly OR check inside the run script.
5. **`continue-on-error: true` masks failures.** Keep the verification step in `deploy.yml` that warns loudly when `dist/admin/index.html` is missing.
6. **Visual editing is a hand-rolled port, not Tina's React hooks.** This site is static Astro with no React, so `useTina`/`tinaField` can't be used. `TinaEditBridge.astro` reimplements the same postMessage protocol in vanilla JS. If a Tina upgrade breaks click-to-edit, diff `node_modules/tinacms/dist/react.js` against that component — the message types (`open`, `updateData`, `quickEditEnabled`, `field:selected`) are the contract.
7. **Adding a new editable field = two edits.** Add it to `tina/config.ts`, then add `data-tina-field={f(...)}` in the template. The path must mirror the GraphQL result shape (`home.aboutSection.bio`, `experienceSection.items.2.role`). If the fragment in `src/lib/tina-visual-editing.ts` doesn't select the field, the sidebar won't focus it.
8. **List roots can't be focused.** Tina focuses one field, so `tools` / `extraImageKeys` get no `data-tina-field` — an outline with a dead click is worse than no outline. List *items* are fine.
9. **CMS thumbnails need `dist/src/assets/images/`.** `mediaRoot` is `src/assets/images`, so every image field requests `/src/assets/images/<path>` — a path Astro never serves (it compiles originals into hashed `/_astro/` files). `scripts/generate-cms-thumbnails.mjs` writes 400px previews there at build time (~0.9 MB). Drop that step and every thumbnail in the editor goes back to a broken-image icon.
10. **`image()` fields emit their full-size original.** Astro ships the untouched source for every content-collection `image()` field even when only resized variants are used — that's ~18 MB across the gallery, and why `dist` is ~63 MB rather than ~36 MB. Not a leak, and not worth chasing unless deploy time becomes a problem; the escape hatch is storing paths as `z.string()` and resolving them with `import.meta.glob`.

11. **Gallery placement is a body split, not a layout trick.** `[slug].astro`
    cuts `project.rendered.html` at each `<h2 id=...>` and drops the matching
    gallery group after each chunk. That only works while the body has no
    markdown images of its own — those come through as placeholders that
    `<Content />` resolves and `set:html` would emit raw. The guard is
    `rendered.metadata.imagePaths.length === 0`; when it trips, every item
    silently falls back to the bottom of the page. If someone adds a body image
    and inline photos stop working, that's why.
12. **`npm run check:tina` is in `publish.sh`, deliberately not in `build`.**
    A stale `tina-lock.json` would otherwise fail the GitHub Actions deploy and
    leave the live site silently out of date — the exact failure mode in the
    memory note. In `publish.sh` it only stops a push Ryan is watching.
13. **`--shrink` must never change a file's container format.** It rewrites in
    place under the existing name so no path changes, which means a `.png`
    holding JPEG bytes would sail past sharp and then trip Astro's own
    extension-based probe. `encodeKeepingFormat()` exists for that; `--jpeg` is
    intake-only.

14. **Studio must never reach production.** `StudioOverlay.astro` guards on
    `import.meta.env.DEV`, but a runtime conditional does NOT keep Astro from
    hoisting and bundling `<script>`/`<style>` — that's static analysis. Both
    are `is:inline` so they're emitted only where the template puts them.
    If you touch that component, re-check with:
    `npm run build && grep -r studio dist/ ; grep -r "gallery/patch" dist/`
15. **A Vite restart kills content watching for the rest of the session.**
    Astro normally hot-reloads markdown changed by another process just fine.
    But touching `package.json` or `astro.config.mjs` restarts Vite, and the
    content watcher does not come back: writes still succeed, the page keeps
    rendering the previous frontmatter, and only restarting `npm run studio`
    fixes it. Measured, not guessed — a write before the restart reloads, the
    same write after it does not. `nudgeAstro()` in `studio-server.mjs` touches
    `src/content.config.ts` after each write, which forces the re-sync even in
    that state. If you edit npm scripts or the Astro config while studio is up,
    restart it.
16. **Studio writes frontmatter with `yaml`'s Document API, not gray-matter.**
    It round-trips byte-identically, so a one-field edit is a one-line diff.
    A full reserialize would rewrite quoting and key order on a file TinaCMS
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
19. **A deployed static site cannot read files off Ryan's Mac.** This comes up:
    anything a visitor sees must be committed. The library panel exists so the
    originals can STAY local while only the picked, optimised copies enter the
    repo — that's the closest thing to "pull from my machine" that works.

20. **Studio's home mode reuses `data-tina-field` as its path source.** Every
    editable home image already carries `...---home.aboutSection.photo`, so
    `index.astro` needed no new markup — the overlay splits on `---home.` and
    patches that JSON path. If a `data-tina-field` is ever removed from an
    image wrapper, that slot silently stops being editable in studio too.
21. **Two different conventions for a video path.** `home.json` showcase items
    feed `<source src>` directly and store `/videos/x.mp4`; project gallery rows
    store a bare `x.mp4` and the template prefixes it. `homeVideoRef()` exists
    for that. Don't unify one without changing the other template.
22. **`:global()` does not work in `is:inline` styles.** StudioOverlay's CSS
    ships as raw CSS, so a rule containing `:global(...)` is invalid and the
    browser drops it silently — the overlay just appears not to respond to
    hover. Write plain selectors there.

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

## macOS gotchas

- `/usr/bin/timeout` doesn't exist. Use the `timeout_cmd` perl wrapper in `scripts/auto-sync.sh`.
- `bash` needs Full Disk Access for launchd-spawned scripts to read `~/Documents` (already granted).
- Terminal.app needs Documents folder access for `git` (already granted).
- Auto-mode classifier blocks "persistence mechanisms". For new launchd plists, write the file but let Ryan load it manually.

## Editing approaches (Ryan's options)

1. **Pages CMS** at https://app.pagescms.org/ — form-based, his daily driver for content.
2. **TinaCMS** at https://ryanstrawbridge-2.github.io/admin/ — click-to-edit visual editor (needs TinaCloud `main` registration + `TINA_TOKEN` GitHub secret).
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
stale — same reasoning as `check:tina`.

Name files for what they show. The names in the repo came from each gallery
item's own `alt`/`caption`, which is where to look when you need one.

## Per-project content structure

<!-- The pattern every project page in src/content/projects/ follows. Preserve this. -->

Frontmatter: `title`, `subtitle`, `organization`, `date`, `summary`, `hero`, `heroAlt`, `tools[]`, `order`.
Body sections: **Problem** → **What I did** → **Outcome**. Don't deviate from this without asking.

## What's deliberately NOT in the repo

- `.env.local` (TinaCMS credentials, gitignored).
- `public/RyanStrawbridgeResume.pdf` — the download linked from the home page. The filename is what visitors get, so keep it presentable; drop the latest compile here when applying.
- Source 5712×4284 photos — resized to 2400px max before commit.
- The 4th hero video (`home-hero.mp4`) — too large to push.

## When in doubt

Read `HANDBOOK.md` for the user-facing perspective on these same systems.
