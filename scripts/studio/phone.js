// Studio overlay: phone preview.
import {
  root,
  size,
} from './core.js';

// -- phone preview ----------------------------------------------------
// An iframe, not a narrowed container: media queries key off the viewport,
// and the viewport inside an iframe is the iframe. Anything that merely
// shrinks a wrapper shows the desktop layout at a smaller size, which is
// exactly the thing that misleads you about a crop.
const phonePanel = root.querySelector('.studio-phone-panel');
const phoneFrame = root.querySelector('.studio-phone-frame');
const phoneSize = root.querySelector('.studio-phone-size');

const phoneUrl = () => {
  const url = new URL(location.href);
  url.searchParams.set('studio', 'off'); // no overlay inside the preview
  return url.toString();
};

const sizePhone = () => {
  const [w, h] = phoneSize.value.split('x').map(Number);
  // Fit the tallest device into the window with room for the header.
  const scale = Math.min(0.75, (window.innerHeight - 140) / h);
  phoneFrame.width = w;
  phoneFrame.height = h;
  phoneFrame.style.setProperty('--phone-scale', String(scale));
  phoneFrame.parentElement.style.width = `${Math.round(w * scale)}px`;
  phoneFrame.parentElement.style.height = `${Math.round(h * scale) + 36}px`;
};

root.querySelector('.studio-phone')?.addEventListener('click', () => {
  phonePanel.hidden = !phonePanel.hidden;
  if (phonePanel.hidden) { phoneFrame.src = 'about:blank'; return; }
  phonePanel.classList.add('studio-phone-shell');
  sizePhone();
  phoneFrame.src = phoneUrl();
});
phoneSize?.addEventListener('change', sizePhone);
window.addEventListener('resize', () => { if (!phonePanel.hidden) sizePhone(); });
root.querySelector('.studio-phone-reload')?.addEventListener('click', () => {
  phoneFrame.src = phoneUrl();
});
root.querySelector('.studio-phone-close')?.addEventListener('click', () => {
  phonePanel.hidden = true;
  phoneFrame.src = 'about:blank';
});

