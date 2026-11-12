// Studio overlay: theme.
import {
  root,
  toast,
  post,
  queueSave,
} from './core.js';

// -- theme ------------------------------------------------------------
/**
 * Every control previews by setting the custom property on <html> and
 * saves in the background. The reload that follows re-renders from
 * site.json, so what you see mid-drag and what ships are the same values.
 */
const themePanel = root.querySelector('.studio-theme-panel');
const accentInput = root.querySelector('.studio-accent');
const cornersSel = root.querySelector('.studio-corners');
const headFontSel = root.querySelector('.studio-headfont');
const widthSel = root.querySelector('.studio-width-setting');
const swatches = root.querySelector('.studio-swatches');

const CORNERS = { sharp: ['2px', '4px'], soft: ['6px', '12px'], round: ['12px', '22px'] };
const WIDTHS = { narrow: '960px', standard: '1100px', wide: '1280px' };
const HEAD_FONTS = { sans: 'var(--font-sans)', serif: 'var(--font-serif)', mono: 'var(--font-mono)' };
const PRESETS = ['#c2410c', '#b45309', '#15803d', '#0f766e', '#1d4ed8', '#6d28d9', '#be123c', '#334155'];

/** Mix a colour toward black or white, for the hover and soft variants. */
const shade = (hex, amount, toward) => {
  const n = parseInt(hex.slice(1), 16);
  const parts = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(c + (toward - c) * amount));
  return `#${parts.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

const previewAccent = (hex) => {
  const el = document.documentElement;
  el.style.setProperty('--accent', hex);
  el.style.setProperty('--accent-hover', shade(hex, 0.25, 0));
  el.style.setProperty('--accent-soft', shade(hex, 0.88, 255));
  for (const button of swatches.querySelectorAll('button'))
    button.setAttribute('aria-pressed', String(button.dataset.color === hex));
};

const saveTheme = (patch, key) =>
  queueSave(`theme:${key}`, '/site/theme', { patch }, 250);

const setAccent = (hex) => {
  previewAccent(hex);
  accentInput.value = hex;
  saveTheme({
    accentColor: hex,
    accentColorHover: shade(hex, 0.25, 0),
    accentSoft: shade(hex, 0.88, 255),
  }, 'accent');
};

for (const color of PRESETS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.color = color;
  button.style.background = color;
  button.title = color;
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => setAccent(color));
  swatches.appendChild(button);
}

accentInput?.addEventListener('input', (event) => setAccent(event.target.value));

cornersSel?.addEventListener('change', () => {
  const [r, rl] = CORNERS[cornersSel.value];
  document.documentElement.style.setProperty('--radius', r);
  document.documentElement.style.setProperty('--radius-lg', rl);
  saveTheme({ cornerStyle: cornersSel.value }, 'corners');
});

headFontSel?.addEventListener('change', () => {
  document.documentElement.style.setProperty('--font-heading', HEAD_FONTS[headFontSel.value]);
  saveTheme({ headingFont: headFontSel.value }, 'headfont');
});

widthSel?.addEventListener('change', () => {
  document.documentElement.style.setProperty('--container', WIDTHS[widthSel.value]);
  saveTheme({ containerWidth: widthSel.value }, 'width');
});

root.querySelector('.studio-theme')?.addEventListener('click', async () => {
  themePanel.hidden = !themePanel.hidden;
  if (themePanel.hidden) return;
  try {
    const { site } = await post('/site/read', {});
    const accent = site.accentColor || '#c2410c';
    accentInput.value = accent;
    for (const button of swatches.querySelectorAll('button'))
      button.setAttribute('aria-pressed', String(button.dataset.color === accent));
    cornersSel.value = site.cornerStyle || 'soft';
    headFontSel.value = site.headingFont || 'sans';
    widthSel.value = site.containerWidth || 'standard';
  } catch (error) { toast(error.message, true); }
});
root.querySelector('.studio-theme-close')?.addEventListener('click', () => { themePanel.hidden = true; });

