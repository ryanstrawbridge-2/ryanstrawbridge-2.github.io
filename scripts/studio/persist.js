// Studio overlay: keep your place across the reload every save causes.
//
// Astro reloads the whole page when a content file changes; that's how a
// save shows its real render. Without this the page jumped to wherever the
// browser guessed, Text mode switched off and open panels closed, which read
// as glitching. State is per tab (sessionStorage) and only trusted for a few
// seconds, so opening the page fresh later starts clean.
import { root } from './core.js';

const KEY = 'studio:ui';
const PANELS = ['.studio-save-panel', '.studio-theme-panel', '.studio-publish-panel'];

window.addEventListener('pagehide', () => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({
      path: location.pathname,
      at: Date.now(),
      y: window.scrollY,
      text: document.body.classList.contains('studio-text-mode'),
      panels: PANELS.filter((sel) => root.querySelector(sel)?.hidden === false),
      selected: document.querySelector('.studio-selected')?.dataset.studioFigure ?? null,
    }));
  } catch { /* storage blocked: nothing to restore, nothing breaks */ }
});

let saved = null;
try {
  saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
  sessionStorage.removeItem(KEY);
} catch { /* ignore */ }

if (saved && saved.path === location.pathname && Date.now() - saved.at < 8000) {
  // Twice: once now, once after late images settle the layout.
  const scroll = () => window.scrollTo({ top: saved.y, behavior: 'instant' });
  scroll();
  window.addEventListener('load', scroll, { once: true });
  setTimeout(scroll, 350);
  if (saved.text) root.querySelector('.studio-text')?.click();
  const openers = { '.studio-save-panel': '.studio-save', '.studio-theme-panel': '.studio-theme', '.studio-publish-panel': '.studio-publish' };
  for (const sel of saved.panels ?? []) root.querySelector(openers[sel])?.click();
  if (saved.selected !== null) {
    document.querySelector(`figure[data-studio-figure="${saved.selected}"]`)?.dispatchEvent(new CustomEvent('studio:select'));
  }
}
