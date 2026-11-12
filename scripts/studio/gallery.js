// Studio overlay: build the per-figure toolbar.
import {
  patchRow,
  HEADINGS,
  MODE,
  displacedNote,
  toolButton,
  toolSep,
  toast,
  post,
  queueSave,
  toPct,
  editAlt,
  figures,
  label,
} from './core.js';

// -- build the per-figure toolbar -------------------------------------
for (const figure of MODE === 'project' ? figures() : []) {
  const index = Number(figure.dataset.studioIndex);
  const kind = figure.dataset.studioKind;
  const media = figure.querySelector('img, video');
  if (!media) continue;

  const tools = document.createElement('div');
  tools.className = 'studio-tools';

  const widths = ['full', 'half', 'third'];
  const seg = document.createElement('div');
  seg.className = 'studio-seg';
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Width');
  for (const width of widths) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.value = width;
    button.textContent = width[0].toUpperCase() + width.slice(1);
    button.title = `${width} width`;
    button.setAttribute('aria-pressed', String(figure.dataset.studioWidth === width));
    button.addEventListener('click', async () => {
      // Change the page first so the new layout is on screen immediately;
      // the save and HMR reload only confirm it.
      for (const w of widths) figure.classList.toggle(`g-${w}`, w === width);
      figure.dataset.studioWidth = width;
      for (const sibling of seg.querySelectorAll('button')) {
        sibling.setAttribute('aria-pressed', String(sibling.dataset.value === width));
      }
      try {
        await patchRow(index, { width });
        toast(`width → ${width}`);
      } catch (error) { toast(error.message, true); }
    });
    seg.appendChild(button);
  }
  tools.appendChild(seg);

  // Frame shape. 'auto' is 4:3 for half/third and natural height for full,
  // which is how every existing row already renders — so leaving this
  // alone changes nothing.
  if (kind === 'image') {
    const shapes = [
      ['auto', 'Auto shape'], ['1/1', 'Square'], ['4/3', '4:3'], ['3/2', '3:2'],
      ['16/9', '16:9'], ['3/4', '3:4 tall'], ['2/3', '2:3 tall'], ['9/16', '9:16 tall'],
    ];
    const shape = document.createElement('select');
    shape.title = 'Crop this photo to a fixed shape';
    for (const [value, text] of shapes) shape.appendChild(new Option(text, value));
    shape.value = figure.dataset.studioAspect || 'auto';
    shape.addEventListener('change', async () => {
      const value = shape.value;
      // Reflect it immediately; the reload only confirms.
      figure.classList.toggle('is-framed', value !== 'auto' || !figure.classList.contains('g-full'));
      if (value === 'auto') {
        figure.style.removeProperty('--ratio');
        figure.classList.toggle('is-framed', !figure.classList.contains('g-full'));
      } else {
        figure.style.setProperty('--ratio', value.replace('/', ' / '));
      }
      figure.dataset.studioAspect = value;
      try {
        await patchRow(index, { aspect: value });
        toast(`shape → ${value === 'auto' ? 'auto' : value}`);
      } catch (error) { toast(error.message, true); }
    });
    tools.appendChild(shape);
  }

  if (HEADINGS.length > 0) {
    const select = document.createElement('select');
    select.title = 'Which section this sits in';
    const bottom = new Option('Bottom of page', '');
    select.appendChild(bottom);
    for (const id of HEADINGS) select.appendChild(new Option(`In ${label(id)}`, id));
    select.value = figure.dataset.studioSection || '';
    select.addEventListener('change', async () => {
      try {
        await patchRow(index, { section: select.value ? label(select.value) : null });
        toast(select.value ? `moved into ${label(select.value)}` : 'moved to the bottom');
      } catch (error) { toast(error.message, true); }
    });
    tools.appendChild(select);
  }

  tools.appendChild(toolSep());
  const altBtn = toolButton({ icon: 'alt', text: 'Alt', title: 'Edit the description screen readers announce' });
  altBtn.addEventListener('click', () => {
    editAlt(figure, figure.dataset.studioAlt ?? '', async (value) => {
      await patchRow(index, { alt: value });
      figure.dataset.studioAlt = value;
    });
  });
  tools.appendChild(altBtn);

  const mover = (icon, delta, title) => {
    const button = toolButton({ icon, title });
    button.addEventListener('click', async () => {
      try {
        await post('/project/list', { path: 'gallery', op: 'move', from: index, to: Math.max(0, index + delta) });
        toast('reordered');
      } catch (error) { toast(error.message, true); }
    });
    return button;
  };
  tools.appendChild(mover('left', -1, 'Move earlier'));
  tools.appendChild(mover('right', 1, 'Move later'));

  const remove = toolButton({ icon: 'trash', title: 'Remove from the gallery', className: 'studio-danger' });
  remove.addEventListener('click', async () => {
    if (!confirm('Remove this from the gallery?\n\nIf nothing else uses the file and it was never committed, it is deleted too.')) return;
    try {
      const result = await post('/project/list', { path: 'gallery', op: 'remove', index });
      toast(`removed from the gallery${displacedNote(result.displaced)}`);
    } catch (error) { toast(error.message, true); }
  });
  tools.appendChild(remove);

  figure.appendChild(tools);

  // -- drag to crop ---------------------------------------------------
  if (kind !== 'image') continue;

  const dot = document.createElement('span');
  dot.className = 'studio-crosshair';
  figure.appendChild(dot);

  let [px, py] = toPct(figure.dataset.studioFocal);
  const placeDot = () => {
    const box = media.getBoundingClientRect();
    const frame = figure.getBoundingClientRect();
    dot.style.left = `${box.left - frame.left + (box.width * px) / 100}px`;
    dot.style.top = `${box.top - frame.top + (box.height * py) / 100}px`;
  };
  placeDot();
  window.addEventListener('resize', placeDot);

  let dragging = false;
  let moved = false;

  const apply = (event) => {
    const box = media.getBoundingClientRect();
    px = Math.round(Math.min(100, Math.max(0, ((event.clientX - box.left) / box.width) * 100)));
    py = Math.round(Math.min(100, Math.max(0, ((event.clientY - box.top) / box.height) * 100)));
    figure.style.setProperty('--focal', `${px}% ${py}%`);
    placeDot();
  };

  media.addEventListener('pointerdown', (event) => {
    // An unframed full-width photo fills its own box, so panning it does
    // nothing — until zoom pushes it past the edges.
    if (figure.classList.contains('g-full') && !figure.classList.contains('is-framed')
        && Number(figure.dataset.studioZoom || 1) <= 1) return;
    if (event.button !== 0) return;
    dragging = true;
    moved = false;
    figure.classList.add('is-dragging');
    // Best effort: if the pointer is already gone the drag still works,
    // and throwing here would abort before anything is saved.
    try { media.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
  });

  media.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    moved = true;
    apply(event);
  });

  const finish = async (event) => {
    if (!dragging) return;
    dragging = false;
    figure.classList.remove('is-dragging');
    try { media.releasePointerCapture?.(event.pointerId); } catch {}
    if (!moved) return;
    const focal = `${px}% ${py}%`;
    figure.dataset.studioFocal = focal;
    try {
      await patchRow(index, { focal });
      toast(`crop → ${focal}`);
    } catch (error) { toast(error.message, true); }
  };
  media.addEventListener('pointerup', finish);
  media.addEventListener('pointercancel', finish);

  // -- zoom -----------------------------------------------------------
  // Pinch on a trackpad arrives as a wheel event with ctrlKey set; that
  // and alt+scroll are the two gestures claimed. Plain scrolling is left
  // alone, because hijacking it over every photo would make the page
  // itself hard to read.
  let zoom = Number(figure.dataset.studioZoom || 1) || 1;

  const badge = document.createElement('span');
  badge.className = 'studio-zoom-badge';
  badge.hidden = zoom <= 1;
  badge.textContent = `${zoom.toFixed(2)}x`;
  figure.appendChild(badge);

  const showZoom = () => {
    figure.style.setProperty('--zoom', String(zoom));
    badge.textContent = `${zoom.toFixed(2)}x`;
    badge.hidden = zoom <= 1.001;
    placeDot();
  };

  const saveZoom = () => {
    const value = Number(zoom.toFixed(2));
    figure.dataset.studioZoom = String(value);
    queueSave(`zoom:${index}`, '/project/patch', { patch: { [`gallery.${index}.zoom`]: value } });
  };

  media.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.altKey) return; // let the page scroll
    event.preventDefault();
    // deltaY is pixels on a trackpad and notches on a mouse; the
    // exponential keeps both feeling proportional rather than one of them
    // jumping the whole range in a flick.
    zoom = Math.min(4, Math.max(1, zoom * Math.exp(-event.deltaY / 400)));
    showZoom();
    saveZoom();
  }, { passive: false });

  // Zooming out to 1 is fiddly with a trackpad, so give it a target.
  badge.addEventListener('click', () => {
    zoom = 1;
    showZoom();
    saveZoom();
    toast('zoom reset');
  });
  badge.title = 'Click to reset zoom';

  // A drag ends in a click, which the lightbox listens for. Swallow it.
  media.addEventListener('click', (event) => {
    if (!moved) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    moved = false;
  }, true);
}

