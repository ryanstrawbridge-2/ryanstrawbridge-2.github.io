import { defineConfig } from 'tinacms';

const branch =
  process.env.GITHUB_BRANCH ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  process.env.HEAD ||
  'main';

const focalPointOptions = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top', label: 'Top center' },
  { value: 'top-right', label: 'Top right' },
  { value: 'left', label: 'Center left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Center right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom', label: 'Bottom center' },
  { value: 'bottom-right', label: 'Bottom right' },
];

export default defineConfig({
  branch,
  clientId: process.env.TINA_PUBLIC_CLIENT_ID!,
  token: process.env.TINA_TOKEN!,

  build: {
    outputFolder: 'admin',
    publicFolder: 'public',
  },

  media: {
    tina: {
      mediaRoot: 'src/assets/images',
      publicFolder: '',
    },
  },

  schema: {
    collections: [
      // ---------------------------------------------------------------------
      // PROJECTS — markdown files with frontmatter + body
      // ---------------------------------------------------------------------
      {
        name: 'project',
        label: 'Projects',
        path: 'src/content/projects',
        format: 'md',
        ui: {
          router: ({ document }) => `/projects/${document._sys.filename}/`,
          filename: {
            readonly: false,
          },
        },
        fields: [
          { type: 'string', name: 'title', label: 'Title', isTitle: true, required: true },
          {
            type: 'string',
            name: 'subtitle',
            label: 'Subtitle',
            description: 'Optional one-line tagline shown under the title.',
          },
          {
            type: 'string',
            name: 'organization',
            label: 'Organization',
            description: 'Company or club where this work happened.',
          },
          {
            type: 'datetime',
            name: 'date',
            label: 'Date',
            required: true,
            ui: { dateFormat: 'YYYY-MM-DD' },
          },
          {
            type: 'string',
            name: 'summary',
            label: 'Summary',
            required: true,
            ui: { component: 'textarea' },
            description: 'One-sentence summary used on cards and previews.',
          },
          {
            type: 'image',
            name: 'hero',
            label: 'Hero image',
            required: true,
            // Path normalization happens at build time via
            // scripts/fix-cms-paths.mjs — so even if Tina writes a path in
            // its mediaRoot form, the build fixes it before Astro reads.
          },
          {
            type: 'string',
            name: 'heroAlt',
            label: 'Hero alt text',
            required: true,
            description: 'Describe the image for screen readers.',
          },
          {
            type: 'string',
            name: 'heroFocalPoint',
            label: 'Hero crop position',
            description: 'Where to anchor the hero photo when it crops.',
            options: focalPointOptions,
          },
          {
            type: 'string',
            name: 'heroAspect',
            label: 'Hero shape',
            options: [
              { value: 'wide', label: 'Wide (21:9)' },
              { value: 'standard', label: 'Standard (3:2)' },
              { value: 'tall', label: 'Tall (4:5)' },
              { value: 'square', label: 'Square (1:1)' },
            ],
          },
          {
            type: 'string',
            name: 'galleryLayout',
            label: 'Gallery layout',
            options: [
              { value: 'stacked', label: 'Stacked (one image per row)' },
              { value: 'two-column', label: 'Two columns' },
              { value: 'three-column', label: 'Three columns' },
            ],
          },
          {
            type: 'object',
            name: 'gallery',
            label: 'Gallery photos',
            list: true,
            description: 'Drag the handle on a row to reorder. Order here is the order on the page.',
            ui: {
              // Label each row by filename so photos are identifiable even
              // when the thumbnail preview fails to load.
              itemProps: (item: { image?: string; alt?: string }) => {
                const file = item?.image?.split('/').pop() ?? 'No photo chosen';
                return { label: item?.alt ? `${file} — ${item.alt}` : file };
              },
            },
            fields: [
              { type: 'image', name: 'image', label: 'Photo' },
              {
                type: 'string',
                name: 'alt',
                label: 'Alt text',
                description: 'Describes the photo for screen readers. Used as the caption unless you set one below.',
              },
              {
                type: 'string',
                name: 'caption',
                label: 'Caption (optional)',
                description: 'Shown under the photo. Leave blank to use the alt text.',
              },
            ],
          },
          {
            type: 'string',
            name: 'tools',
            label: 'Tools / skills',
            list: true,
            description: 'Listed as tags on the project page.',
          },
          {
            type: 'number',
            name: 'order',
            label: 'Display order',
            description: 'Lower numbers appear first.',
          },
          {
            type: 'boolean',
            name: 'draft',
            label: 'Draft (hide from live site)',
          },
          {
            type: 'rich-text',
            name: 'body',
            label: 'Body',
            isBody: true,
            description:
              'Use ## headings for sections (Problem / What I did / Outcome / Gallery).',
          },
        ],
      },

      // ---------------------------------------------------------------------
      // HOME PAGE — single JSON file
      // ---------------------------------------------------------------------
      {
        name: 'home',
        label: 'Home page',
        path: 'src/data',
        format: 'json',
        match: { include: 'home' },
        ui: {
          router: () => '/',
          allowedActions: { create: false, delete: false },
          filename: { readonly: true },
        },
        fields: [
          {
            type: 'object',
            name: 'hero',
            label: 'Hero (top of page)',
            fields: [
              { type: 'string', name: 'eyebrow', label: 'Eyebrow tag' },
              { type: 'string', name: 'tagline', label: 'Tagline' },
              { type: 'string', name: 'lede', label: 'Lede', ui: { component: 'textarea' } },
              {
                type: 'object',
                name: 'primaryCta',
                label: 'Primary button',
                fields: [
                  { type: 'string', name: 'label', label: 'Label' },
                  { type: 'string', name: 'href', label: 'Link' },
                ],
              },
              {
                type: 'object',
                name: 'secondaryCta',
                label: 'Secondary button',
                fields: [
                  { type: 'string', name: 'label', label: 'Label' },
                  { type: 'string', name: 'href', label: 'Link' },
                ],
              },
              { type: 'image', name: 'headshot', label: 'Headshot' },
              { type: 'string', name: 'headshotAlt', label: 'Headshot alt text' },
              {
                type: 'string',
                name: 'headshotShape',
                label: 'Headshot shape',
                options: ['circle', 'square', 'rounded'],
              },
            ],
          },
          {
            type: 'object',
            name: 'showcase',
            label: 'Engineering photo collage',
            fields: [
              { type: 'boolean', name: 'show', label: 'Show this section' },
              {
                type: 'object',
                name: 'items',
                label: 'Collage photos',
                list: true,
                description:
                  'Drag to reorder. The grid reserves one Large cell and one Video cell; everything else fills the smaller cells.',
                ui: {
                  itemProps: (item: { image?: string; video?: string; alt?: string; size?: string }) => {
                    const file = (item?.video ?? item?.image ?? '').split('/').pop() || 'Empty';
                    return { label: `${item?.size ?? 'regular'} — ${file}` };
                  },
                },
                fields: [
                  { type: 'image', name: 'image', label: 'Photo' },
                  {
                    type: 'string',
                    name: 'video',
                    label: 'Video path (optional)',
                    description: 'e.g. /videos/aero-testing.mp4. Set this instead of a photo for a video cell.',
                  },
                  { type: 'string', name: 'alt', label: 'Alt text' },
                  {
                    type: 'string',
                    name: 'size',
                    label: 'Cell size',
                    options: ['large', 'regular', 'video'],
                  },
                ],
              },
            ],
          },
          {
            type: 'object',
            name: 'projectsSection',
            label: 'Projects section',
            fields: [
              { type: 'boolean', name: 'show', label: 'Show this section' },
              { type: 'string', name: 'eyebrow', label: 'Eyebrow' },
              { type: 'string', name: 'title', label: 'Heading' },
            ],
          },
          {
            type: 'object',
            name: 'experienceSection',
            label: 'Experience section',
            fields: [
              { type: 'boolean', name: 'show', label: 'Show this section' },
              { type: 'string', name: 'eyebrow', label: 'Eyebrow' },
              { type: 'string', name: 'title', label: 'Heading' },
              {
                type: 'string',
                name: 'logoSize',
                label: 'Logo size',
                options: ['small', 'medium', 'large'],
              },
              {
                type: 'object',
                name: 'items',
                label: 'Experience cards',
                list: true,
                ui: {
                  itemProps: (item: { role?: string; org?: string }) => ({
                    label: item?.org || item?.role || 'Card',
                  }),
                },
                fields: [
                  { type: 'string', name: 'role', label: 'Role' },
                  { type: 'string', name: 'org', label: 'Organization' },
                  { type: 'string', name: 'blurb', label: 'Blurb', ui: { component: 'textarea' } },
                  { type: 'image', name: 'logo', label: 'Logo' },
                ],
              },
            ],
          },
          {
            type: 'object',
            name: 'aboutSection',
            label: 'About section',
            fields: [
              { type: 'boolean', name: 'show', label: 'Show this section' },
              { type: 'image', name: 'photo', label: 'Portrait photo' },
              { type: 'string', name: 'photoAlt', label: 'Portrait alt text' },
              {
                type: 'string',
                name: 'photoPosition',
                label: 'Photo position',
                options: ['left', 'right'],
              },
              {
                type: 'string',
                name: 'photoFocalPoint',
                label: 'Photo crop position',
                options: focalPointOptions,
              },
              { type: 'string', name: 'eyebrow', label: 'Eyebrow' },
              { type: 'string', name: 'heading', label: 'Heading' },
              { type: 'string', name: 'lede', label: 'Lede', ui: { component: 'textarea' } },
              {
                type: 'string',
                name: 'bio',
                label: 'Bio',
                ui: { component: 'textarea' },
                description: 'Use a blank line between paragraphs.',
              },
            ],
          },
          {
            type: 'object',
            name: 'interestsSection',
            label: 'Interests section',
            fields: [
              { type: 'boolean', name: 'show', label: 'Show this section' },
              { type: 'string', name: 'eyebrow', label: 'Eyebrow' },
              { type: 'string', name: 'title', label: 'Heading' },
              {
                type: 'object',
                name: 'items',
                label: 'Interest cards',
                list: true,
                ui: {
                  itemProps: (item: { title?: string }) => ({ label: item?.title || 'Card' }),
                },
                fields: [
                  { type: 'string', name: 'title', label: 'Title' },
                  { type: 'image', name: 'image', label: 'Main photo' },
                  {
                    type: 'image',
                    name: 'extraImages',
                    label: 'Extra thumbnails',
                    list: true,
                  },
                  { type: 'string', name: 'alt', label: 'Alt text' },
                  { type: 'string', name: 'body', label: 'Body', ui: { component: 'textarea' } },
                ],
              },
            ],
          },
          {
            type: 'object',
            name: 'contactSection',
            label: 'Contact section',
            fields: [
              { type: 'boolean', name: 'show', label: 'Show this section' },
              { type: 'string', name: 'eyebrow', label: 'Eyebrow' },
              { type: 'string', name: 'heading', label: 'Heading' },
              { type: 'string', name: 'body', label: 'Body', ui: { component: 'textarea' } },
              { type: 'string', name: 'email', label: 'Email' },
              { type: 'string', name: 'phone', label: 'Phone' },
            ],
          },
        ],
      },

      // ---------------------------------------------------------------------
      // SITE-WIDE SETTINGS — single JSON file
      // ---------------------------------------------------------------------
      {
        name: 'site',
        label: 'Site settings',
        path: 'src/data',
        format: 'json',
        match: { include: 'site' },
        ui: {
          router: () => '/',
          allowedActions: { create: false, delete: false },
          filename: { readonly: true },
        },
        fields: [
          {
            type: 'string',
            name: 'accentColor',
            label: 'Accent color',
            description: 'Hex code, e.g. #c2410c (orange) or #0ea5e9 (blue).',
          },
          {
            type: 'string',
            name: 'accentColorHover',
            label: 'Accent color (hover)',
            description: 'Slightly darker shade for hovers.',
          },
          {
            type: 'string',
            name: 'containerWidth',
            label: 'Container width',
            options: ['narrow', 'standard', 'wide'],
          },
        ],
      },
    ],
  },
});
