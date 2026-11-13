import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      subtitle: z.string().optional(),
      organization: z.string().optional(),
      date: z.coerce.date(),
      summary: z.string(),
      hero: image(),
      heroAlt: z.string(),
      tools: z.array(z.string()).default([]),
      order: z.number().default(0),
      draft: z.boolean().default(false),

      // Visual layout controls (all optional, sensible defaults).
      // Accepts the 9-way keywords (top-left, top, ...) OR a CSS
      // object-position string like "37% 22%" from focal-picker.html.
      heroFocalPoint: z.string().default('center'),
      heroAspect: z.enum(['wide', 'standard', 'tall', 'square']).default('wide'),
      // Scale inside the hero frame, anchored on heroFocalPoint. Written by
      // studio's pinch / alt-scroll on the main photo.
      heroZoom: z.number().min(1).max(4).default(1),
      galleryLayout: z
        .enum(['stacked', 'two-column', 'three-column'])
        .default('two-column'),

      // Gallery media. Lives in frontmatter rather than the body so the CMS
      // can reorder it by dragging.
      //
      // EVERY field here is optional on purpose. A required field meant that
      // adding a row in the CMS without filling it in produced a schema error,
      // and since CMS commits skip the pre-commit hook that surfaced as a
      // failed deploy and a silently stale site. Rows with neither an image
      // nor a video are dropped at render time instead.
      gallery: z
        .array(
          z.object({
            image: image().optional(),
            // Video filename in public/videos/, e.g. "ball-valve-test.mp4".
            // A leading "/videos/" is tolerated and stripped at render.
            video: z.string().optional(),
            // Interactive 3D model: a .glb in public/models/, produced by
            // `npm run model`. Loads only when a visitor asks for it — the
            // viewer runtime alone is bigger than the whole first page load.
            model: z.string().optional(),
            // Still frame shown before a video plays.
            poster: image().optional(),
            alt: z.string().optional(),
            caption: z.string().optional(),
            // Body heading this item sits under, e.g. "Testing". Matched by
            // slug, so case and punctuation don't matter. Blank (or a heading
            // that doesn't exist) falls through to the bottom of the page.
            section: z.string().optional(),
            // Per-item width. 'auto' defers to galleryLayout above.
            width: z
              .enum(['auto', 'full', 'half', 'third'])
              .default('auto'),
            // Crop anchor. Same vocabulary as heroFocalPoint. On an item
            // that isn't cropped (full width at its natural shape) this only
            // matters once zoom is above 1.
            focal: z.string().default('center'),
            // Scale inside the frame, 1 = fit. Studio's scroll-to-zoom writes
            // this; it anchors on `focal`, so the two are a pair.
            zoom: z.number().min(1).max(4).default(1),
            // Frame shape. 'auto' keeps the old behaviour — 4:3 for half and
            // third, natural height for full — so every existing row renders
            // exactly as before. Anything else crops to that ratio at any
            // width. Mixed ratios in one row stop lining up; that's the
            // trade the control exists to let you make.
            aspect: z
              .enum(['auto', '1/1', '4/3', '3/2', '16/9', '3/4', '2/3', '9/16'])
              .default('auto'),
          }),
        )
        .default([]),

      // -----------------------------------------------------------------
      // Walkthrough figures.
      //
      // The presentation layer: a figure, a one-line takeaway, numbered
      // bullets, and callout markers pinned to the image. Separate from
      // `gallery` on purpose — a gallery row is a photo, a figure is an
      // argument, and mixing them meant every photo grew fields it never
      // used.
      //
      // Every field is optional for the same reason as gallery above: a
      // half-filled CMS row must never be a schema error, because a CMS
      // commit skips the pre-commit hook and surfaces as a failed deploy.
      // A figure with no media is a PLACEHOLDER — rendered as a labelled
      // skeleton in dev, skipped entirely in a production build.
      // -----------------------------------------------------------------
      // Section blocks added in studio (cards, stats, quotes, timeline, ...).
      // Free-form on purpose: SectionBlock.astro reads each field defensively,
      // and studio's /blocks route is what validates what gets written.
      // `section` names the body heading a block follows, like figures.
      blocks: z.array(z.record(z.string(), z.any())).optional(),
      figures: z
        .array(
          z.object({
            // Body heading this figure follows. Same slug matching as
            // gallery; an unknown heading falls to the bottom of the page.
            section: z.string().optional(),
            // Changes the placeholder label and the frame treatment only.
            kind: z
              .enum(['diagram', 'photo', 'comparison', 'data', 'model'])
              .default('diagram'),
            title: z.string().optional(),
            // One line stating what this figure proves. Sits above the
            // figure in larger type — the "slide headline".
            takeaway: z.string().optional(),
            image: image().optional(),
            // Second image, for kind: comparison. Rendered side by side.
            compare: image().optional(),
            beforeLabel: z.string().optional(),
            afterLabel: z.string().optional(),
            video: z.string().optional(),
            model: z.string().optional(),
            poster: image().optional(),
            alt: z.string().optional(),
            caption: z.string().optional(),
            // What to draw. Shown inside the placeholder skeleton so the
            // intent survives until the diagram exists. Never rendered in
            // production.
            plan: z.string().optional(),
            aspect: z
              .enum(['auto', '1/1', '4/3', '3/2', '16/9', '3/4', '2/3', '9/16'])
              .default('auto'),
            focal: z.string().default('center'),
            zoom: z.number().min(1).max(4).default(1),
            // Crop of the second (after) image on a comparison. Each side of
            // a before/after is a different photo, so each gets its own.
            compareFocal: z.string().default('center'),
            compareZoom: z.number().min(1).max(4).default(1),
            // Bullets beside the figure. Numbered, and a bullet whose
            // number matches a callout highlights it on hover/focus.
            points: z.array(z.string()).default([]),
            // Markers pinned to the image. x/y are PERCENTAGES of the
            // frame, which is what makes them survive any crop or resize.
            callouts: z
              .array(
                z.object({
                  x: z.number().min(0).max(100).default(50),
                  y: z.number().min(0).max(100).default(50),
                  // Short label shown next to the marker on wide screens.
                  // The full explanation belongs in `points`.
                  label: z.string().optional(),
                  // Which way the leader line points out of the marker.
                  place: z
                    .enum(['right', 'left', 'up', 'down'])
                    .default('right'),
                }),
              )
              .default([]),
          }),
        )
        .default([]),
    }),
});

export const collections = { projects };
