// Studio overlay: "What visitors will see".
//
// Hides everything that exists only on this Mac: empty "to make" figures
// (production drops them), studio outlines, toolbars and panels. Counts any
// placeholder text still showing, because that is what stops Go live.
import { root, svg, toast } from './core.js';

const MARKERS = /PLACEHOLDER|CHECK AND REWRITE|ADD FS|TODO|FIXME/;

const btn = Object.assign(document.createElement('button'), {
  type: 'button',
  className: 'studio-btn studio-preview-btn',
  title: 'See the page the way visitors will (P)',
  innerHTML: `${svg('eye')}<span>Preview</span>`,
});
btn.setAttribute('aria-pressed', 'false');
root.querySelector('.studio-save')?.before(btn);

const pill = document.createElement('div');
pill.className = 'studio-preview-pill';
pill.hidden = true;
root.appendChild(pill);

const blockers = () => {
  const found = [];
  const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!MARKERS.test(node.textContent)) continue;
    const host = node.parentElement;
    if (!host || host.closest('#studio, .is-placeholder, [hidden]')) continue;
    if (host.offsetParent === null) continue; // not rendered
    found.push(host);
  }
  return found;
};

export const setPreview = (on) => {
  document.body.classList.toggle('studio-preview', on);
  root.classList.toggle('is-preview', on);
  btn.setAttribute('aria-pressed', String(on));
  for (const panel of root.querySelectorAll('.studio-panel')) if (on) panel.hidden = true;
  if (document.body.classList.contains('studio-text-mode') && on) root.querySelector('.studio-text')?.click();
  pill.hidden = !on;
  if (!on) {
    for (const el of document.querySelectorAll('.studio-blocker')) el.classList.remove('studio-blocker');
    return;
  }
  const found = blockers();
  for (const el of found) el.classList.add('studio-blocker');
  pill.innerHTML = '';
  pill.append(
    Object.assign(document.createElement('span'), {
      textContent: found.length
        ? `Visitor view. ${found.length} placeholder${found.length === 1 ? '' : 's'} still showing (outlined red); Go live will refuse until they're fixed.`
        : 'Visitor view. Nothing here would stop Go live.',
    }),
  );
  const exit = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Exit preview (P)' });
  exit.addEventListener('click', () => setPreview(false));
  pill.append(exit);
  if (found[0]) found[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
  else toast('visitor view');
};

btn.addEventListener('click', () => setPreview(!document.body.classList.contains('studio-preview')));
