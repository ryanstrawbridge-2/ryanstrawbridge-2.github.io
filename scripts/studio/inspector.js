// Studio overlay: select a figure, edit it in a side panel.
//
// Click a walkthrough figure and the panel beside the rail shows everything
// about it: headline, title, caption, numbered points, photo, shape, zoom,
// where it sits, and delete. Nothing floats over the page while you work,
// which is what made the hover toolbars flicker.
//
// Every field saves when you leave it. A save reloads the page (that's how
// Astro shows the real render), so persist.js reopens the panel on the same
// figure and puts the caret back in the field you were in.
import { root, post, toast, svg, MODE, HEADINGS, label, hooks } from './core.js';

const KINDS = [['diagram', 'Diagram'], ['photo', 'Photo'], ['data', 'Data / chart'], ['comparison', 'Before / after']];
const SHAPES = ['auto', '16/9', '4/3', '3/2', '1/1', '3/4', '2/3', '9/16'];
const FOCUS_KEY = 'studio:inspector-focus';

const panel = document.createElement('aside');
panel.className = 'studio-panel studio-inspector';
panel.hidden = true;
panel.setAttribute('aria-label', 'Figure');
root.appendChild(panel);

let current = null; // { index, el }

const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const kid of kids) if (kid != null) node.append(kid);
  return node;
};
const field = (name, labelText, control, hint) =>
  el('label', { className: 'studio-ins-field' }, el('span', { textContent: labelText }), control, hint ? el('small', { textContent: hint }) : null);

const patchFigure = (key, value) => post('/project/patch', { patch: { [`figures.${current.index}.${key}`]: value } });
const listOp = (path, body) => post('/project/list', { path, ...body });

/** Text input or textarea that saves on change (blur / Enter). */
const textControl = (key, value, { multiline = false, placeholder = '' } = {}) => {
  const input = el(multiline ? 'textarea' : 'input', { value: value ?? '', placeholder, className: 'studio-input' });
  if (multiline) input.rows = Math.min(6, Math.max(2, Math.ceil(String(value ?? '').length / 42)));
  input.dataset.field = key;
  const start = input.value;
  const commit = async () => {
    if (input.value === start) return;
    try {
      await patchFigure(key, input.value.trim());
      toast('saved');
    } catch (error) { toast(error.message, true); }
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) { event.preventDefault(); input.blur(); }
    if (event.key === 'Escape') { input.value = start; input.blur(); }
  });
  return input;
};

const select = (key, options, value, onChange) => {
  const s = el('select', { className: 'studio-input' });
  for (const [v, t] of options) s.append(new Option(t, v));
  s.value = value;
  s.dataset.field = key;
  s.addEventListener('change', () => onChange(s.value));
  return s;
};

const sectionFigures = (sectionId) =>
  [...document.querySelectorAll('figure[data-studio-figure]')]
    .filter((f) => f.dataset.studioSectionId === sectionId)
    .map((f) => Number(f.dataset.studioFigure))
    .sort((a, b) => a - b);

const render = async () => {
  if (!current) return;
  const { index, el: fig } = current;
  let data;
  try {
    data = (await post('/project/value', { path: `figures.${index}`, json: true })).value;
  } catch (error) { toast(error.message, true); return; }
  if (!data) { deselect(); return; }

  const sectionId = fig.dataset.studioSectionId;
  const siblings = sectionFigures(sectionId);
  const pos = siblings.indexOf(index);
  const hasImage = Boolean(data.image);
  const isCompare = data.kind === 'comparison';

  const head = el('header', {},
    el('strong', { textContent: `Fig. ${index + 1}` }),
    el('span', { className: 'studio-theme-note', textContent: data.title || data.takeaway || '' }),
    el('button', { type: 'button', className: 'studio-btn studio-icon', title: 'Close (Esc)', innerHTML: svg('x') }),
  );
  head.querySelector('button').addEventListener('click', deselect);

  // Where it sits.
  const where = el('div', { className: 'studio-ins-row' },
    field('section', 'Section', select('section', HEADINGS.map((id) => [label(id), label(id)]), data.section ?? '', async (v) => {
      try { await patchFigure('section', v); toast(`moved to ${v}`); } catch (error) { toast(error.message, true); }
    })),
    field('kind', 'Kind', select('kind', KINDS, data.kind ?? 'diagram', async (v) => {
      try { await patchFigure('kind', v); toast('kind changed'); } catch (error) { toast(error.message, true); }
    })),
  );

  // Words.
  const words = el('div', { className: 'studio-ins-group' },
    field('takeaway', 'Headline', textControl('takeaway', data.takeaway, { multiline: true, placeholder: 'One line: what this figure proves' })),
    field('title', 'Title', textControl('title', data.title, { placeholder: 'Short name, used when there is no caption' })),
    field('caption', 'Caption', textControl('caption', data.caption, { placeholder: 'Under the picture, after "Fig. N"' })),
  );
  if (!hasImage) {
    words.append(field('plan', 'Notes to self (never published)', textControl('plan', data.plan, { multiline: true, placeholder: 'What to draw or photograph' })));
  }

  // Points.
  const points = data.points ?? [];
  const pointList = el('ol', { className: 'studio-ins-points' });
  points.forEach((text, i) => {
    const area = el('textarea', { className: 'studio-input', value: text, rows: Math.min(4, Math.max(1, Math.ceil(text.length / 40))) });
    area.dataset.field = `points.${i}`;
    area.addEventListener('change', async () => {
      try { await patchFigure(`points.${i}`, area.value.trim()); toast('point saved'); } catch (error) { toast(error.message, true); }
    });
    area.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); area.blur(); } });
    const up = el('button', { type: 'button', className: 'studio-btn studio-icon', title: 'Move up', innerHTML: svg('up'), disabled: i === 0 });
    const down = el('button', { type: 'button', className: 'studio-btn studio-icon', title: 'Move down', innerHTML: svg('down'), disabled: i === points.length - 1 });
    const del = el('button', { type: 'button', className: 'studio-btn studio-icon studio-danger', title: 'Delete point', innerHTML: svg('trash') });
    const path = `figures.${index}.points`;
    up.addEventListener('click', () => listOp(path, { op: 'move', from: i, to: i - 1 }).catch((e) => toast(e.message, true)));
    down.addEventListener('click', () => listOp(path, { op: 'move', from: i, to: i + 1 }).catch((e) => toast(e.message, true)));
    del.addEventListener('click', () => listOp(path, { op: 'remove', index: i }).then(() => toast('point deleted')).catch((e) => toast(e.message, true)));
    pointList.append(el('li', {}, el('span', { className: 'studio-ins-n', textContent: String(i + 1) }), area, el('span', { className: 'studio-ins-btns' }, up, down, del)));
  });
  const addPoint = el('button', { type: 'button', className: 'studio-btn studio-ins-add', innerHTML: `${svg('plus')}<span>Add point</span>` });
  addPoint.addEventListener('click', () => {
    sessionStorage.setItem(FOCUS_KEY, `points.${points.length}`);
    listOp(`figures.${index}.points`, { op: 'add', value: 'New point' }).catch((e) => toast(e.message, true));
  });
  const pointGroup = el('div', { className: 'studio-ins-group' }, el('h4', { textContent: 'Numbered points' }), pointList, addPoint);

  // Picture.
  const thumbSrc = fig.querySelector('.pfig-media img')?.currentSrc;
  const pic = el('div', { className: 'studio-ins-group' }, el('h4', { textContent: isCompare ? 'Pictures' : 'Picture' }));
  if (thumbSrc) pic.append(el('img', { className: 'studio-ins-thumb', src: thumbSrc, alt: '' }));
  const picBtns = el('div', { className: 'studio-ins-btnrow' });
  const pick = (slot, text) => {
    const b = el('button', { type: 'button', className: 'studio-btn', innerHTML: `${svg('replace')}<span>${text}</span>` });
    b.addEventListener('click', () => hooks.openLibrary({ figure: index, figureSlot: slot }));
    return b;
  };
  if (isCompare) picBtns.append(pick('image', data.image ? 'Before…' : 'Add before…'), pick('compare', data.compare ? 'After…' : 'Add after…'));
  else picBtns.append(pick('image', hasImage ? 'Replace…' : 'Add photo…'));
  pic.append(picBtns);
  if (hasImage) {
    const zoom = el('input', { type: 'range', min: '1', max: '4', step: '0.05', value: String(data.zoom ?? 1) });
    zoom.dataset.field = 'zoom';
    const zoomOut = el('output', { textContent: `${Number(data.zoom ?? 1).toFixed(2)}x` });
    zoom.addEventListener('input', () => {
      zoomOut.textContent = `${Number(zoom.value).toFixed(2)}x`;
      fig.querySelector('[data-studio-slot="image"]')?.style.setProperty('--figure-zoom', zoom.value);
    });
    zoom.addEventListener('change', () => patchFigure('zoom', Number(zoom.value) > 1.001 ? Number(Number(zoom.value).toFixed(2)) : '').catch((e) => toast(e.message, true)));
    const resetCrop = el('button', { type: 'button', className: 'studio-btn', textContent: 'Reset crop' });
    resetCrop.addEventListener('click', () => post('/project/patch', { patch: {
      [`figures.${index}.focal`]: '', [`figures.${index}.zoom`]: '', [`figures.${index}.compareFocal`]: '', [`figures.${index}.compareZoom`]: '',
    } }).then(() => toast('crop reset')).catch((e) => toast(e.message, true)));
    pic.append(
      el('div', { className: 'studio-ins-row' },
        field('aspect', 'Shape', select('aspect', SHAPES.map((v) => [v, v === 'auto' ? 'Natural' : v.replace('/', ':')]), data.aspect ?? 'auto', (v) =>
          patchFigure('aspect', v === 'auto' ? '' : v).then(() => toast('shape changed')).catch((e) => toast(e.message, true)))),
        field('zoom', 'Zoom', el('span', { className: 'studio-ins-zoom' }, zoom, zoomOut)),
      ),
      el('p', { className: 'studio-ins-tip', textContent: 'Drag the photo on the page to move the crop.' }),
      resetCrop,
    );
  }

  // Order and delete.
  const earlier = el('button', { type: 'button', className: 'studio-btn', innerHTML: `${svg('up')}<span>Earlier</span>`, disabled: pos <= 0 });
  const later = el('button', { type: 'button', className: 'studio-btn', innerHTML: `${svg('down')}<span>Later</span>`, disabled: pos === -1 || pos >= siblings.length - 1 });
  const moveTo = (to) => {
    sessionStorage.setItem('studio:select-next', String(to));
    listOp('figures', { op: 'move', from: index, to }).catch((e) => toast(e.message, true));
  };
  earlier.addEventListener('click', () => moveTo(siblings[pos - 1]));
  later.addEventListener('click', () => moveTo(siblings[pos + 1]));
  const del = el('button', { type: 'button', className: 'studio-btn studio-danger', innerHTML: `${svg('trash')}<span>Delete figure</span>` });
  del.addEventListener('click', deleteSelected);
  const foot = el('footer', {}, el('span', { className: 'studio-ins-btnrow' }, earlier, later), del);

  panel.replaceChildren(head, el('div', { className: 'studio-ins-body' }, where, words, pointGroup, pic), foot);

  // Back into the field you were typing in before the save reloaded the page.
  const focusKey = sessionStorage.getItem(FOCUS_KEY);
  if (focusKey) {
    sessionStorage.removeItem(FOCUS_KEY);
    const target = panel.querySelector(`[data-field="${CSS.escape(focusKey)}"]`);
    if (target) {
      target.focus();
      if (target.setSelectionRange && typeof target.value === 'string') target.setSelectionRange(target.value.length, target.value.length);
      if (target.value === 'New point') target.select();
    }
  }
};

const select_ = (fig) => {
  if (current?.el === fig) return;
  deselect();
  current = { index: Number(fig.dataset.studioFigure), el: fig };
  fig.classList.add('studio-selected');
  for (const other of root.querySelectorAll('.studio-panel:not(.studio-inspector)')) other.hidden = true;
  panel.hidden = false;
  render();
};

function deselect() {
  current?.el.classList.remove('studio-selected');
  current = null;
  panel.hidden = true;
}

export function deleteSelected() {
  if (!current) return;
  const { index, el: fig } = current;
  const name = fig.querySelector('.pfig-skeleton-title, figcaption span:last-child, .pfig-takeaway')?.textContent?.trim();
  if (!confirm(`Delete Fig. ${index + 1}${name ? ` (“${name.slice(0, 60)}”)` : ''}?\n\nUndo (⌘Z) brings it back.`)) return;
  sessionStorage.setItem('studio:select-next', ''); // nothing selected after the reload
  post('/project/list', { path: 'figures', op: 'remove', index })
    .then(() => toast(`Fig. ${index + 1} deleted. ⌘Z to undo`))
    .catch((e) => toast(e.message, true));
}

export const selected = () => current;
export { deselect };

// Remember which field had focus when the page goes away (a save reloads it).
window.addEventListener('pagehide', () => {
  const f = document.activeElement?.closest?.('.studio-inspector') ? document.activeElement.dataset.field : null;
  try { if (f && !sessionStorage.getItem(FOCUS_KEY)) sessionStorage.setItem(FOCUS_KEY, f); } catch {}
});

if (MODE === 'project') {
  for (const fig of document.querySelectorAll('figure[data-studio-figure]')) {
    fig.addEventListener('studio:select', () => select_(fig));
    fig.addEventListener('click', (event) => {
      if (document.body.classList.contains('studio-preview')) return;
      // Buttons, markers, links and text being edited keep their own clicks.
      if (event.target.closest('button, a, input, textarea, select, .studio-tools, .studio-editing, .studio-text-edit')) return;
      if (document.body.classList.contains('studio-text-mode') && event.target.closest('.studio-text-slot')) return;
      select_(fig);
    });
  }

  // "+ Add a figure" at the end of every section.
  const chunks = [...document.querySelectorAll('[data-studio-section]')].filter((c) => c.dataset.studioSection);
  chunks.forEach((chunk, i) => {
    const id = chunk.dataset.studioSection;
    const add = el('button', { type: 'button', className: 'studio-add-figure', innerHTML: `${svg('plus')}<span>Add a figure to ${label(id)}</span>` });
    add.addEventListener('click', async () => {
      try {
        const result = await post('/project/list', {
          path: 'figures',
          op: 'add',
          value: { section: label(id), kind: 'diagram', title: 'New figure', takeaway: 'New figure: one line on what it shows' },
        });
        sessionStorage.setItem('studio:select-next', String(result.index));
        sessionStorage.setItem(FOCUS_KEY, 'takeaway');
        toast('figure added');
      } catch (error) { toast(error.message, true); }
    });
    const next = chunks[i + 1];
    if (next) next.before(add);
    else chunk.parentElement.append(add);
  });

  // A save that created or moved a figure asks for it to be selected next.
  const nextSel = sessionStorage.getItem('studio:select-next');
  if (nextSel !== null) {
    sessionStorage.removeItem('studio:select-next');
    // Indices shifted; persist.js must not reselect the old number.
    window.__studioSelectionHandled = true;
    const fig = document.querySelector(`figure[data-studio-figure="${nextSel}"]`);
    if (fig) { select_(fig); fig.scrollIntoView({ block: 'center' }); }
  }
}
