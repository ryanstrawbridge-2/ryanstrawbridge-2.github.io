/**
 * "Which field is this?" markers for the live editor (studio).
 *
 *   <h1 data-field={f('title')}>      ->  data-field="project:title"   (dev)
 *                                     ->  no attribute at all           (build)
 *
 * Studio reads these to know what a click or a drop should edit: the text
 * editor, home-page photo slots, figure text. They used to be TinaCMS's
 * data-tina-field paths; with Tina gone they're dev-only, so the live site's
 * HTML carries none of them.
 */
const DEV = import.meta.env.DEV;

export const homeField = (...path: (string | number)[]): string | undefined =>
  DEV ? `home:${path.join('.')}` : undefined;

export const projectField = (...path: (string | number)[]): string | undefined =>
  DEV ? `project:${path.join('.')}` : undefined;
