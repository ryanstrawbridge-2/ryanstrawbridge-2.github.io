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

## macOS gotchas

- `/usr/bin/timeout` doesn't exist. Use the `timeout_cmd` perl wrapper in `scripts/auto-sync.sh`.
- `bash` needs Full Disk Access for launchd-spawned scripts to read `~/Documents` (already granted).
- Terminal.app needs Documents folder access for `git` (already granted).
- Auto-mode classifier blocks "persistence mechanisms". For new launchd plists, write the file but let Ryan load it manually.

## Editing approaches (Ryan's options)

1. **Pages CMS** at https://app.pagescms.org/ — form-based, his daily driver for content.
2. **TinaCMS** at https://ryanstrawbridge-2.github.io/admin/ — click-to-edit visual editor (needs TinaCloud `main` registration + `TINA_TOKEN` GitHub secret).
3. **Local files via Claude** — for layout, new sections, or anything structural.

## Per-project content structure

<!-- The pattern every project page in src/content/projects/ follows. Preserve this. -->

Frontmatter: `title`, `subtitle`, `organization`, `date`, `summary`, `hero`, `heroAlt`, `tools[]`, `order`.
Body sections: **Problem** → **What I did** → **Outcome**. Don't deviate from this without asking.

## What's deliberately NOT in the repo

- `.env.local` (TinaCMS credentials, gitignored).
- `public/resume.pdf` — referenced from the home page; drop the latest compile here when applying.
- Source 5712×4284 photos — resized to 2400px max before commit.
- The 4th hero video (`home-hero.mp4`) — too large to push.

## When in doubt

Read `HANDBOOK.md` for the user-facing perspective on these same systems.
