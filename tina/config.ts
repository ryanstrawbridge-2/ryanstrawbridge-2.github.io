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
            label: 'Engineering photos slideshow',
            fields: [{ type: 'boolean', name: 'show', label: 'Show this section' }],
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
                  {
                    type: 'string',
                    name: 'logoKey',
                    label: 'Logo',
                    options: ['cfs', 'raytheon', 'aeronu'],
                    description: 'To add a new logo, ask Claude.',
                  },
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
                  {
                    type: 'string',
                    name: 'imageKey',
                    label: 'Main image',
                    options: ['running', 'music', 'plants'],
                  },
                  {
                    type: 'string',
                    name: 'extraImageKeys',
                    label: 'Extra thumbnails',
                    list: true,
                    options: [
                      'running-2',
                      'running-3',
                      'music-2',
                      'music-3',
                      'plants-2',
                      'plants-3',
                    ],
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
