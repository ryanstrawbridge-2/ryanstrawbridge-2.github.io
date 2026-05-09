# Ryan Strawbridge — Portfolio

Personal mechanical engineering portfolio. Built with [Astro](https://astro.build), deployed to GitHub Pages.

Live: https://ryanstrawbridge-2.github.io

## Local development

```bash
npm install
npm run dev      # localhost:4321
npm run build    # build to ./dist
npm run preview  # preview built site
```

## Adding a project

1. Drop hero / gallery images into `src/assets/images/projects/<slug>/`.
2. Create `src/content/projects/<slug>.md` with frontmatter:

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

Embed body images with relative markdown paths — Astro will optimize them.

## Updating the résumé

Drop a `resume.pdf` file in `public/` — it's linked from the homepage as `/resume.pdf`.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml` and publishes to GitHub Pages.
