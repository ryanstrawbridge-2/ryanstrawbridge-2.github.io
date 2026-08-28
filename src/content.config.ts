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

      // Gallery photos. Lives in frontmatter rather than the body so the CMS
      // can reorder it by dragging. Caption falls back to alt when omitted,
      // matching what rehype-image-captions does for body images.
      gallery: z
        .array(
          z.object({
            image: image(),
            // Optional on purpose. A required alt meant that adding a photo in
            // the CMS without typing one produced a schema error, and since CMS
            // commits skip the pre-commit hook that surfaced as a failed deploy
            // and a silently stale site. The template falls back to the caption
            // and then the project title.
            alt: z.string().optional(),
            caption: z.string().optional(),
          }),
        )
        .default([]),
    }),
});

export const collections = { projects };
