// Studio overlay: walkthrough figures: drag callout markers.
import {
  hooks,
  MODE,
  dropEl,
  isFileDrag,
  readAsBase64,
  displacedNote,
  size,
  svg,
  toolButton,
  toolSep,
  toast,
  post,
  queueSave,
  toPct,
  figures,
  label,
} from './core.js';

// -- walkthrough figures: drag callout markers -------------------------
//
// Marker positions are percentages of the frame, so dragging writes
// exactly what the page renders. Drag to move, ⌥-click to delete, and
// "+ Marker" drops a new one in the middle. Labels and points are text;
// edit those in Pages CMS.
//
// Every figure, placeholder or not, gets a toolbar above it: put a photo
// in (library or drop a file), or delete the whole figure. Undo covers
// both. Empty placeholders are drop zones you can also click.
for (const fig of MODE === 'project' ? document.querySelectorAll('figure[data-studio-figure]') : []) {
  const figIndex = Number(fig.dataset.studioFigure);
  const media = fig.querySelector('.pfig-media');
  if (!media) continue;
  const compareFrames = [...fig.querySelectorAll('.pfig-compare > .pfig-frame')];
  const skeleton = fig.querySelector('.pfig-skeleton');
  const figTitle = fig.querySelector('.pfig-skeleton-title')?.textContent?.trim()
    || fig.querySelector('figcaption')?.textContent?.replace(/^Fig\. \d+\s*/, '').trim()
    || fig.querySelector('.pfig-takeaway')?.textContent?.trim() || '';

  media.classList.add('studio-slot', 'studio-figure-media');
  const tools = document.createElement('div');
  tools.className = 'studio-tools';
  tools.appendChild(Object.assign(document.createElement('span'), {
    className: 'studio-tool-label', textContent: `Fig. ${figIndex + 1}`,
  }));
  if (compareFrames.length === 2) {
    const before = toolButton({ icon: 'replace', text: 'Before', title: 'Pick the left (before) photo' });
    before.addEventListener('click', () => hooks.openLibrary({ figure: figIndex, figureSlot: 'image' }));
    const after = toolButton({ icon: 'replace', text: 'After', title: 'Pick the right (after) photo' });
    after.addEventListener('click', () => hooks.openLibrary({ figure: figIndex, figureSlot: 'compare' }));
    tools.append(before, after);
  } else {
    const photo = toolButton({ icon: skeleton ? 'plus' : 'replace', text: skeleton ? 'Add photo' : 'Replace', title: 'Pick a photo from the library, or drop a file on the figure' });
    photo.addEventListener('click', () => hooks.openLibrary({ figure: figIndex, figureSlot: 'image' }));
    tools.appendChild(photo);
  }
  const pointBtn = toolButton({ icon: 'plus', text: 'Point', title: 'Add a numbered point beside the figure. Edit it in Text mode; clear its text to remove it.' });
  pointBtn.addEventListener('click', async () => {
    try {
      await post('/project/list', { path: `figures.${figIndex}.points`, op: 'add', value: 'New point' });
      toast('point added. Turn on Text to edit it');
    } catch (error) { toast(error.message, true); }
  });
  tools.appendChild(pointBtn);
  tools.appendChild(toolSep());
  const del = toolButton({ icon: 'trash', text: 'Delete', title: 'Delete this whole figure (undo brings it back)', className: 'studio-danger' });
  del.addEventListener('click', async () => {
    if (!confirm(`Delete Fig. ${figIndex + 1}${figTitle ? ` (“${figTitle.slice(0, 60)}”)` : ''}?\n\nUndo (⌘Z) brings it back.`)) return;
    try {
      await post('/project/list', { path: 'figures', op: 'remove', index: figIndex });
      toast(`Fig. ${figIndex + 1} deleted. ⌘Z to undo`);
    } catch (error) { toast(error.message, true); }
  });
  tools.appendChild(del);
  media.appendChild(tools);

  if (skeleton) {
    skeleton.classList.add('studio-fig-dropzone');
    const cta = document.createElement('p');
    cta.className = 'studio-fig-cta';
    cta.innerHTML = `${svg('plus')}<span>Drop a photo here, or click to choose</span>`;
    skeleton.appendChild(cta);
    skeleton.addEventListener('click', () => hooks.openLibrary({ figure: figIndex, figureSlot: 'image' }));
  }

  // Drop a file on the figure to fill it. On a before/after, the side
  // it lands on decides which picture it replaces.
  const slotFor = (event) =>
    compareFrames[1]?.contains(document.elementFromPoint(event.clientX, event.clientY)) ? 'compare' : 'image';
  media.addEventListener('dragover', (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    media.classList.add('studio-slot-over');
  });
  media.addEventListener('dragleave', (event) => {
    if (!media.contains(event.relatedTarget)) media.classList.remove('studio-slot-over');
  });
  media.addEventListener('drop', async (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    media.classList.remove('studio-slot-over');
    dropEl.hidden = true;
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const slot = slotFor(event);
    toast(`putting ${file.name} into Fig. ${figIndex + 1}…`);
    try {
      const data = await readAsBase64(file);
      const result = await post('/media', { target: { kind: 'figure', figure: figIndex, slot }, filename: file.name, data });
      toast(`Fig. ${figIndex + 1}${slot === 'compare' ? ' (after)' : ''} → ${file.name}  ${size(result.before)} → ${size(result.after)}${displacedNote(result.displaced)}`);
    } catch (error) { toast(error.message, true); }
  });

  // Crop and zoom, per photo. Same gestures as the gallery: drag to set
  // the crop point, pinch or ⌥scroll to zoom. A comparison's two sides
  // are different photos, so each saves to its own fields.
  for (const cropFrame of fig.querySelectorAll('[data-studio-slot]')) {
    const img = cropFrame.querySelector('img');
    if (!img) continue;
    const side = cropFrame.dataset.studioSlot; // 'image' | 'compare'
    const focalKey = `figures.${figIndex}.${side === 'compare' ? 'compareFocal' : 'focal'}`;
    const zoomKey = `figures.${figIndex}.${side === 'compare' ? 'compareZoom' : 'zoom'}`;
    const sideName = compareFrames.length === 2 ? (side === 'compare' ? ' after' : ' before') : '';
    img.style.cursor = 'grab';
    img.draggable = false;

    let [px, py] = toPct(cropFrame.style.getPropertyValue('--figure-focal').trim());
    let zoom = Number(cropFrame.style.getPropertyValue('--figure-zoom')) || 1;
    let dragging = false;
    let moved = false;

    const badge = document.createElement('span');
    badge.className = 'studio-zoom-badge';
    badge.title = 'Click to reset zoom';
    cropFrame.appendChild(badge);
    const showZoom = () => {
      cropFrame.style.setProperty('--figure-zoom', String(zoom));
      badge.textContent = `${zoom.toFixed(2)}x`;
      badge.hidden = zoom <= 1.001;
    };
    showZoom();

    img.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      dragging = true;
      moved = false;
      img.style.cursor = 'grabbing';
      try { img.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
    });
    img.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      moved = true;
      const box = img.getBoundingClientRect();
      px = Math.round(Math.min(100, Math.max(0, ((event.clientX - box.left) / box.width) * 100)));
      py = Math.round(Math.min(100, Math.max(0, ((event.clientY - box.top) / box.height) * 100)));
      cropFrame.style.setProperty('--figure-focal', `${px}% ${py}%`);
    });
    const finish = async (event) => {
      if (!dragging) return;
      dragging = false;
      img.style.cursor = 'grab';
      try { img.releasePointerCapture?.(event.pointerId); } catch {}
      if (!moved) return;
      const focal = `${px}% ${py}%`;
      try {
        await post('/project/patch', { patch: { [focalKey]: focal } });
        toast(`Fig. ${figIndex + 1}${sideName} crop → ${focal}`);
      } catch (error) { toast(error.message, true); }
    };
    img.addEventListener('pointerup', finish);
    img.addEventListener('pointercancel', finish);
    img.addEventListener('click', (event) => {
      if (!moved) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      moved = false;
    }, true);

    const saveZoom = () => {
      const value = Number(zoom.toFixed(2));
      queueSave(`figzoom:${figIndex}:${side}`, '/project/patch', { patch: { [zoomKey]: value } });
    };
    img.addEventListener('wheel', (event) => {
      if (!event.ctrlKey && !event.altKey) return; // plain scroll stays page scroll
      event.preventDefault();
      zoom = Math.min(4, Math.max(1, zoom * Math.exp(-event.deltaY / 400)));
      showZoom();
      saveZoom();
    }, { passive: false });
    badge.addEventListener('click', () => {
      zoom = 1;
      showZoom();
      saveZoom();
      toast('zoom reset');
    });
  }
  if (!tools.querySelector('.studio-tool-hint')) {
    tools.appendChild(Object.assign(document.createElement('span'), {
      className: 'studio-tool-hint', textContent: fig.querySelector('[data-studio-slot] img') ? 'drag to crop · pinch to zoom' : 'drop a file to fill',
    }));
  }

  // Markers only on a single photo (not placeholders, comparisons, video).
  const frame = fig.querySelector('.pfig-media > .pfig-frame');
  if (!frame || !frame.querySelector('img')) continue;
  frame.classList.add('studio-figure-frame');
  tools.appendChild(toolSep());
  const add = toolButton({ icon: 'plus', text: 'Marker', title: 'Add a callout marker in the middle of the photo' });
  add.addEventListener('click', async () => {
    try {
      await post('/project/list', { path: `figures.${figIndex}.callouts`, op: 'add', value: { x: 50, y: 50, label: 'New marker', place: 'right' } });
      toast('marker added — drag it into place');
    } catch (error) { toast(error.message, true); }
  });
  tools.appendChild(add);
  tools.appendChild(Object.assign(document.createElement('span'), {
    className: 'studio-tool-hint', textContent: 'drag markers · ⌥-click deletes one',
  }));

  for (const marker of frame.querySelectorAll('[data-studio-callout]')) {
    const n = Number(marker.dataset.studioCallout);
    let dragging = false;
    let moved = false;
    let x = parseFloat(marker.style.getPropertyValue('--cx')) || 50;
    let y = parseFloat(marker.style.getPropertyValue('--cy')) || 50;

    marker.addEventListener('pointerdown', async (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.altKey) {
        if (!confirm(`Delete marker ${n}? The point with the same number stays; remove it in Pages CMS.`)) return;
        try {
          await post('/project/list', { path: `figures.${figIndex}.callouts`, op: 'remove', index: n - 1 });
          toast(`marker ${n} deleted`);
        } catch (error) { toast(error.message, true); }
        return;
      }
      dragging = true;
      moved = false;
      marker.classList.add('is-dragging');
      try { marker.setPointerCapture(event.pointerId); } catch {}
    });
    marker.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      moved = true;
      const box = frame.getBoundingClientRect();
      x = Math.round(Math.min(100, Math.max(0, ((event.clientX - box.left) / box.width) * 100)) * 10) / 10;
      y = Math.round(Math.min(100, Math.max(0, ((event.clientY - box.top) / box.height) * 100)) * 10) / 10;
      marker.style.setProperty('--cx', `${x}%`);
      marker.style.setProperty('--cy', `${y}%`);
    });
    const finish = async (event) => {
      if (!dragging) return;
      dragging = false;
      marker.classList.remove('is-dragging');
      try { marker.releasePointerCapture?.(event.pointerId); } catch {}
      if (!moved) return;
      try {
        await post('/project/patch', { patch: { [`figures.${figIndex}.callouts.${n - 1}.x`]: x, [`figures.${figIndex}.callouts.${n - 1}.y`]: y } });
        toast(`marker ${n} → ${x}%, ${y}%`);
      } catch (error) { toast(error.message, true); }
    };
    marker.addEventListener('pointerup', finish);
    marker.addEventListener('pointercancel', finish);
    // The page's own click handler scrolls to the matching point; a drag
    // ends in a click, so swallow that one.
    marker.addEventListener('click', (event) => {
      if (!moved) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      moved = false;
    }, true);
  }
}

