/**
 * Walkthrough figures: the presentation layer on a project page.
 *
 * A figure is a claim with evidence — a headline, a picture, numbered points,
 * and markers pinned to the picture. Gallery items are photographs; these are
 * arguments, which is why they are a separate list rather than more optional
 * fields on every gallery row.
 *
 * The one rule worth knowing: a figure with no media is a PLACEHOLDER. It
 * renders as a labelled skeleton in dev so the intent is visible while the
 * diagram is still being drawn, and is dropped from a production build so an
 * unfinished page never ships an empty box.
 */

import { clampZoom, focalCss, frameRatio, slugify, type GalleryAspect } from './gallery';
import type { BodyChunk } from './gallery';

export type FigureKind = 'diagram' | 'photo' | 'comparison' | 'data' | 'model';
export type CalloutPlace = 'right' | 'left' | 'up' | 'down';

export interface RawCallout {
  x?: number;
  y?: number;
  label?: string;
  place?: CalloutPlace;
}

export interface RawFigure {
  section?: string;
  kind?: FigureKind;
  title?: string;
  takeaway?: string;
  image?: ImageMetadata;
  compare?: ImageMetadata;
  beforeLabel?: string;
  afterLabel?: string;
  video?: string;
  model?: string;
  poster?: ImageMetadata;
  alt?: string;
  caption?: string;
  plan?: string;
  aspect?: GalleryAspect;
  focal?: string;
  zoom?: number;
  points?: string[];
  callouts?: RawCallout[];
}

export interface Callout {
  n: number;
  x: number;
  y: number;
  label?: string;
  place: CalloutPlace;
}

export interface Figure {
  /** Index in the ORIGINAL frontmatter array, so CMS field paths stay right. */
  index: number;
  /** 1-based number across the whole page — what "Fig. 3" refers to. */
  number: number;
  kind: FigureKind;
  title?: string;
  takeaway?: string;
  image?: ImageMetadata;
  compare?: ImageMetadata;
  beforeLabel: string;
  afterLabel: string;
  video?: string;
  model?: string;
  poster?: ImageMetadata;
  alt: string;
  caption?: string;
  plan?: string;
  sectionId: string;
  aspect: GalleryAspect;
  /** CSS aspect-ratio for the frame, or '' for the image's natural height. */
  ratio: string;
  /** Ready-made `style` value for the frame. */
  frameStyle: string;
  points: string[];
  callouts: Callout[];
  /** No media yet: show the skeleton in dev, drop it in production. */
  placeholder: boolean;
}

/** Human label for an empty frame, so the skeleton says what belongs there. */
export const KIND_LABEL: Record<FigureKind, string> = {
  diagram: 'Diagram',
  photo: 'Photo',
  comparison: 'Before / after',
  data: 'Plot',
  model: '3D model',
};

/**
 * Render the small amount of markdown that actually appears in a point.
 *
 * His body bullets are full of `**44 kips**` and `**11 configurations**`, and
 * frontmatter gets no markdown pass, so those would otherwise render as
 * literal asterisks. HTML is escaped FIRST and only bold and code are let back
 * through — the output goes through set:html, so the escape is what keeps a
 * stray angle bracket in a caption from becoming markup.
 */
export const inlineMarkup = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

const clampPercent = (value: number | undefined, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
};

/**
 * Normalize the frontmatter array.
 *
 * `includePlaceholders` is the dev/production switch. Figure NUMBERING is
 * assigned before that filter runs, so "Fig. 4" means the same thing in both
 * builds — the numbers don't shuffle when the placeholders disappear.
 */
export const normalizeFigures = (
  figures: RawFigure[] | undefined,
  includePlaceholders: boolean,
): Figure[] => {
  if (!figures?.length) return [];

  return figures
    .map((figure, index) => {
      const aspect = figure.aspect ?? 'auto';
      // Figures are always full width within their column, so 'auto' means
      // natural height — a tall schematic must not be guillotined to 4:3.
      const ratio = frameRatio(aspect, 'full');
      const hasMedia = Boolean(figure.image || figure.video || figure.model);

      return {
        index,
        number: index + 1,
        kind: figure.kind ?? 'diagram',
        title: figure.title,
        takeaway: figure.takeaway ? inlineMarkup(figure.takeaway) : undefined,
        image: figure.image,
        compare: figure.compare,
        beforeLabel: figure.beforeLabel ?? 'Before',
        afterLabel: figure.afterLabel ?? 'After',
        video: figure.video,
        model: figure.model,
        poster: figure.poster,
        // Falling back to the title keeps a figure from reaching the page with
        // an empty alt, which a screen reader announces as nothing at all.
        alt: figure.alt ?? figure.title ?? '',
        caption: figure.caption,
        plan: figure.plan,
        sectionId: figure.section ? slugify(figure.section) : '',
        aspect,
        ratio,
        frameStyle: [
          `--figure-focal: ${focalCss(figure.focal)}`,
          `--figure-zoom: ${clampZoom(figure.zoom)}`,
          ratio ? `--figure-ratio: ${ratio}` : '',
        ]
          .filter(Boolean)
          .join('; '),
        points: (figure.points ?? [])
          .filter((point) => point.trim() !== '')
          .map(inlineMarkup),
        callouts: (figure.callouts ?? []).map((callout, i) => ({
          n: i + 1,
          x: clampPercent(callout.x, 50),
          y: clampPercent(callout.y, 50),
          label: callout.label,
          place: callout.place ?? 'right',
        })),
        placeholder: !hasMedia,
      };
    })
    .filter((figure) => {
      if (!figure.placeholder) return true;
      if (!includePlaceholders) return false;
      // An empty row with nothing in it at all is a CMS accident, not a plan.
      // Keep the ones that actually describe something.
      return Boolean(figure.title || figure.takeaway || figure.plan || figure.points.length);
    });
};

/**
 * Bucket figures by the heading they follow, with the leftovers separate.
 *
 * Mirrors `groupBySection` for the gallery: naming a heading that doesn't
 * exist costs you placement, not the figure.
 */
export const groupFigures = (
  figures: Figure[],
  chunks: BodyChunk[],
): { bySection: Map<string, Figure[]>; trailing: Figure[] } => {
  const known = new Set(chunks.map((chunk) => chunk.id).filter(Boolean));
  const bySection = new Map<string, Figure[]>();
  const trailing: Figure[] = [];
  for (const figure of figures) {
    if (figure.sectionId && known.has(figure.sectionId)) {
      const bucket = bySection.get(figure.sectionId) ?? [];
      bucket.push(figure);
      bySection.set(figure.sectionId, bucket);
    } else {
      trailing.push(figure);
    }
  }
  return { bySection, trailing };
};
