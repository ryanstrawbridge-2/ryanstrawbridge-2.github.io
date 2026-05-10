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
      heroFocalPoint: z
        .enum([
          'top-left',
          'top',
          'top-right',
          'left',
          'center',
          'right',
          'bottom-left',
          'bottom',
          'bottom-right',
        ])
        .default('center'),
      heroAspect: z.enum(['wide', 'standard', 'tall', 'square']).default('wide'),
      galleryLayout: z
        .enum(['stacked', 'two-column', 'three-column'])
        .default('stacked'),
    }),
});

export const collections = { projects };
