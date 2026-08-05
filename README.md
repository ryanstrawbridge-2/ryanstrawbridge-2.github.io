# Ryan Strawbridge — Portfolio

[![Deploy to GitHub Pages](https://github.com/ryanstrawbridge-2/ryanstrawbridge-2.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/ryanstrawbridge-2/ryanstrawbridge-2.github.io/actions/workflows/deploy.yml)

Personal mechanical engineering portfolio. Built with [Astro](https://astro.build), deployed to GitHub Pages.

**Live:** https://ryanstrawbridge-2.github.io

<!-- This README is what shows on the repo's GitHub page. Keep it short and public-facing. -->
<!-- For day-to-day editing reference, see HANDBOOK.md. For Claude session context, see CLAUDE.md. -->

## Local development

```bash
npm install
npm run dev      # localhost:4321
npm run build    # build to ./dist
npm run preview  # preview built site
```

## Adding a project

1. Drop hero / gallery images into `src/assets/images/projects/<slug>/`.
2. Create `src/content/projects/<slug>.md`:

```yaml
---
title: Project Title
subtitle: Optional subtitle
organization: Optional org name
date: YYYY-MM-DD
summary: One-sentence summary used on cards and previews.
hero: ../../assets/images/projects/<slug>/hero.jpg
heroAlt: Description of hero image
tools:
  - Tool 1
  - Tool 2
order: 1   # lower = earlier in list (ties broken by date desc)
---

## Problem
…

## What I did
…

## Outcome
…
```

Embed body images with relative markdown paths — Astro optimizes them at build time.

## Updating the résumé

Drop a fresh `resume.pdf` into `public/` — it's linked from the home page as `/resume.pdf`. Source lives at `~/Documents/Resumes/resume.typ` (Typst).

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml` and publishes to GitHub Pages.

## Editing without code

- **Pages CMS** — https://app.pagescms.org/ (form-based content editor)
- **TinaCMS** — https://ryanstrawbridge-2.github.io/admin/ (click-to-edit, once TinaCloud is configured)

See `HANDBOOK.md` for the full daily-editing workflow.
