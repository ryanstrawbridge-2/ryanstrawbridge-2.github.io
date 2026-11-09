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
            // Crop anchor for half/third items, which crop to 4:3.
            // Same vocabulary as heroFocalPoint. Full-width items are never
            // cropped, so this has no effect on them.
            focal: z.string().default('center'),
          }),
        )
        .default([]),
    }),
});

export const collections = { projects };
