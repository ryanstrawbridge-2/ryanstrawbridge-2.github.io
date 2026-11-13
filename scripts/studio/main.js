/**
 * Studio overlay entry point. Loaded as a module from the writer (port 4322)
 * by StudioOverlay.astro, only in astro dev.
 *
 * ?studio=off suppresses the overlay. The phone preview loads this same page
 * in an iframe, and a second editor inside it would both cover the layout
 * being inspected and bind a duplicate set of handlers.
 */
const root = document.getElementById('studio');
if (root && new URLSearchParams(location.search).get('studio') === 'off') {
  root.remove();
} else if (root) {
  // Order matters: modules run top to bottom and register handlers as they go.
  for (const name of ['core.js', 'theme.js', 'text.js', 'phone.js', 'save.js', 'gallery.js', 'hero.js', 'figures.js', 'home.js', 'banner.js', 'layout.js', 'blocks.js', 'library.js', 'drop.js', 'inspector.js', 'preview.js', 'keys.js', 'persist.js']) {
    await import(`./${name}`);
  }
}
