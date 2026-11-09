/**
 * Helpers for the project gallery: where each item sits on the page, how wide
 * it is, and how the rendered body gets cut apart so items can be placed
 * inside a section instead of all landing at the bottom.
 */

export type GalleryWidth = 'full' | 'half' | 'third';

/** Raw frontmatter shape (see src/content.config.ts). */
export interface RawGalleryItem {
  image?: ImageMetadata;
  video?: string;
  poster?: ImageMetadata;
  alt?: string;
  caption?: string;
  section?: string;
  width?: 'auto' | GalleryWidth;
  focal?: string;
}

/** Normalized shape the template renders. */
export interface GalleryItem {
  index: number;
  image?: ImageMetadata;
  video?: string;
  poster?: ImageMetadata;
  alt?: string;
  caption?: string;
  /** Slug of the heading this belongs under; '' means "bottom of the page". */
  sectionId: string;
  width: GalleryWidth;
  focal: string;
}

export interface BodyChunk {
  /** id of the <h2> this chunk starts with; '' for anything before the first. */
  id: string;
  html: string;
}

/** Match Astro's own heading-id generation closely enough to pair the two up. */
export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const FOCAL_KEYWORDS: Record<string, string> = {
  'top-left': 'top left',
  top: 'top center',
  'top-right': 'top right',
  left: 'center left',
  center: 'center center',
  right: 'center right',
  'bottom-left': 'bottom left',
  bottom: 'bottom center',
  'bottom-right': 'bottom right',
};

/**
 * Turn a focal value into a CSS object-position. Falls through to the raw
 * string so "37% 22%" from focal-picker.html works as-is.
 */
export const focalCss = (value: string | undefined): string =>
  (value && (FOCAL_KEYWORDS[value] ?? value)) || 'center center';

const LAYOUT_WIDTH: Record<string, GalleryWidth> = {
  stacked: 'full',
  'two-column': 'half',
  'three-column': 'third',
};

/** Strip "/videos/" or "videos/" so either form works in the CMS field. */
export const videoSrc = (value: string): string =>
  `/videos/${value.replace(/^\/?videos\//, '').replace(/^\//, '')}`;

/**
 * Drop blank rows, resolve 'auto' widths against the page layout, and slugify
 * the section each item asked for.
 *
 * `index` is preserved from the ORIGINAL array so `data-tina-field` paths still
 * point at the right row after blanks are filtered out.
 */
export const normalizeGallery = (
  gallery: RawGalleryItem[],
  galleryLayout: string,
): GalleryItem[] => {
  const fallback = LAYOUT_WIDTH[galleryLayout] ?? 'half';
  return gallery
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => Boolean(item.image || item.video))
    .map(({ item, index }) => ({
      index,
      image: item.image,
      video: item.video,
      poster: item.poster,
      alt: item.alt,
      caption: item.caption,
      sectionId: item.section ? slugify(item.section) : '',
      width:
        !item.width || item.width === 'auto'
          ? fallback
          : (item.width as GalleryWidth),
      focal: item.focal ?? 'center',
    }));
};

/**
 * Cut rendered markdown into one chunk per <h2>. The heading itself opens the
 * chunk it names, so inserting a gallery group after a chunk puts the photos
 * at the END of that section — right before the next heading.
 *
 * Anything before the first <h2> comes back as a chunk with an empty id.
 */
export const splitBodySections = (html: string): BodyChunk[] => {
  if (!html) return [];
  const chunks: BodyChunk[] = [];
  const headings = /<h2[^>]*\sid="([^"]+)"[^>]*>/g;
  let match: RegExpExecArray | null;
  let cursor = 0;
  let currentId = '';
  while ((match = headings.exec(html)) !== null) {
    chunks.push({ id: currentId, html: html.slice(cursor, match.index) });
    currentId = match[1];
    cursor = match.index;
  }
  chunks.push({ id: currentId, html: html.slice(cursor) });
  return chunks.filter((chunk) => chunk.html.trim() !== '');
};

/**
 * Split the gallery into per-section groups plus the leftovers.
 *
 * An item naming a heading that doesn't exist falls into `trailing` rather than
 * disappearing — a typo in the CMS should cost you placement, not the photo.
 */
export const groupBySection = (
  items: GalleryItem[],
  chunks: BodyChunk[],
): { bySection: Map<string, GalleryItem[]>; trailing: GalleryItem[] } => {
  const known = new Set(chunks.map((chunk) => chunk.id).filter(Boolean));
  const bySection = new Map<string, GalleryItem[]>();
  const trailing: GalleryItem[] = [];
  for (const item of items) {
    if (item.sectionId && known.has(item.sectionId)) {
      const bucket = bySection.get(item.sectionId) ?? [];
      bucket.push(item);
      bySection.set(item.sectionId, bucket);
    } else {
      trailing.push(item);
    }
  }
  return { bySection, trailing };
};
