# Claude session context

Read this first. It loads every session and saves you (and Ryan) from re-learning context.

## Project at a glance

- **Owner:** Ryan Strawbridge — mechanical engineer, Northeastern University BSME → MSME (Mechanics & Design), graduating Dec 2028. Currently a Manufacturing Engineering Co-op at Commonwealth Fusion Systems (Devens MA).
- **Site:** https://ryanstrawbridge-2.github.io
- **Repo:** ryanstrawbridge-2/ryanstrawbridge-2.github.io
- **Stack:** Astro 6 (static), GitHub Pages, GitHub Actions deploy, Pages CMS + TinaCMS for editing.
- **Goal:** Self-owned portfolio replacing his Wix site. Editing should be Wix-like (form/visual, no terminal).

## Push behavior — IMPORTANT

GitHub SSH push from background bash processes intermittently stalls indefinitely (sometimes for hours). **Mitigations in place:**
- Hourly `auto-sync.sh` (launchd) with 90-second push timeout — see `scripts/auto-sync.sh`.
- For large initial pushes: split into multiple smaller commits (~5MB each), push individually.
- If push stalls: kill it (`pkill -9 -f "git push"`), retry with timeout, or have Ryan run from his Terminal (which he's granted Documents access to).
- HTTPS push hits 408 timeouts, SSH push hits silent disconnects — neither is reliable for big payloads.

**Don't** push 50MB+ in a single commit. **Don't** re-init `.git` to "clean up history" without a really good reason — that creates 50MB+ pushes.

## Key paths

- Project root: `/Users/ryanstrawbridge/Documents/Projects/portfolio/`
- Content: `src/content/projects/*.md` (project pages, frontmatter + body)
- Home page text: `src/data/home.json` (form-editable in CMS)
- Site-wide settings: `src/data/site.json` (accent color, container width)
- Images: `src/assets/images/` (Astro processes these), `public/videos/` (videos)
- TinaCMS schema: `tina/config.ts`
- Pages CMS schema: `.pages.yml`
- Astro project pages: `src/pages/index.astro`, `src/pages/projects/[slug].astro`
- SSH key for git: `~/.ssh/id_ed25519_portfolio`
- Auto-sync log: `~/Library/Logs/portfolio-sync/sync.log`

## Editing approaches (Ryan's options)

1. **Pages CMS** at https://app.pagescms.org/ — form-based, his go-to for content edits.
2. **TinaCMS** at https://ryanstrawbridge-2.github.io/admin/ — click-to-edit visual editor (only works after Ryan registers `main` in TinaCloud and adds `TINA_TOKEN` GitHub secret; see HANDBOOK.md).
3. **Local files via Claude** — for layout/structural changes Ryan describes in chat.

## Style preferences

- **No emoji in user-facing copy** unless Ryan explicitly asks. Documentation/internal can use them sparingly.
- **Engineer-toned** copy: concrete metrics, specific tools, plain English. No marketing fluff.
- **Concise** updates — Ryan prefers terse status reports during long jobs.
- **Per-project structure**: Problem / What I did / Outcome — preserve this pattern, it's how Ryan's projects are scaffolded.

## Tooling notes (macOS gotchas)

- `/usr/bin/timeout` doesn't exist on macOS. Use the `timeout_cmd` perl wrapper in `scripts/auto-sync.sh`.
- `bash` needs Full Disk Access for launchd-spawned scripts to read `~/Documents`. Already granted.
- Terminal.app needed Documents folder access for Ryan to run git from there. Already granted.
- The auto-mode classifier blocks "persistence mechanisms" (auto-running services). For new launchd plists, write the file but let Ryan load it manually.

## TinaCMS gotchas (learned the hard way)

1. **Image paths**: Astro's content-collection `image()` resolver expects
   paths relative to the markdown file (`../../assets/images/...`). TinaCMS
   stores paths relative to its `mediaRoot` (`/src/assets/images/...`).
   These don't match. The `imageParse`/`imageFormat` helpers in
   `tina/config.ts` translate between them. **When adding a new image field
   to the schema, copy the `ui: { parse, format }` block from the existing
   `hero` field** — without it, paths get mangled (e.g.
   `/src/assets/images../../assets/images/...`) and the build fails.

2. **`tina/tina-lock.json` must be in sync with `tina/config.ts`**: any
   schema change requires regenerating the lock and committing it. To
   regenerate: `set -a && source .env.local && set +a && npx tinacms dev`
   for ~10 seconds, then kill it. Commit the updated `tina/tina-lock.json`.
   If the lock is stale, `tinacms build` fails with "local schema doesn't
   match remote" or returns 403.

3. **GitHub Actions secrets pasted from chat get newlines**: when pasting
   the TINA_TOKEN value, use `printf 'value' | pbcopy` to strip the trailing
   newline. Without it, env vars come through with embedded newlines and
   `tinacms build` produces a broken JS bundle (URL split across lines).

4. **Step-level `if:` can't see step-level `env:`**: don't write
   `if: ${{ env.X != '' }}` on a step that defines `env: X: ...`. The if
   evaluates before env. Use `secrets` directly OR check inside the run
   script.

5. **`continue-on-error: true` masks failures**: workflow shows green even
   when tinacms build failed. The verification step in deploy.yml warns
   loudly when `dist/admin/index.html` is missing — keep that.

## Build behavior

- `npm run build` — plain Astro build (always works).
- `npm run build:tina` — Astro + TinaCMS admin (requires `TINA_TOKEN` env var).
- GitHub Actions deploy auto-detects whether `TINA_TOKEN` secret is set and picks the right script.
- Pre-commit hook runs `npm run build` before any commit. Skip with `--no-verify` (rarely needed).

## What's NOT in the repo (deliberate)

- `.env.local` — TinaCMS credentials, gitignored.
- `public/resume.pdf` — Ryan to drop in eventually.
- The 4th video (`home-hero.mp4`) — too large to push reliably; only the 3 smaller MP4s are tracked.
- Original 5712×4284 source photos — resized to 2400px max before commit.

## Recurring task

`scripts/auto-sync.sh` runs hourly via `~/Library/LaunchAgents/com.ryanstrawbridge.portfolio-sync.plist`. It:
1. Fetches origin/main
2. Rebases local if behind
3. Pushes if local has unpushed commits (90s timeout)
4. Verifies the live site is 200
5. Posts a macOS notification on persistent failures (3+ in a row)

## When in doubt

Read `HANDBOOK.md` (Ryan-facing) for the user perspective on the same systems.
