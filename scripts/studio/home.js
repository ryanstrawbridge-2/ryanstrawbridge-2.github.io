// Studio overlay: home page: per-slot controls.
import {
  state,
  hooks,
  MODE,
  isFileDrag,
  readAsBase64,
  displacedNote,
  size,
  toolButton,
  toast,
  post,
  pending,
  queueSave,
  parkAltPrompt,
  takeAltPrompt,
  editAlt,
  homeSlots,
} from './core.js';

// -- home page: per-slot controls --------------------------------------

for (const slot of MODE === 'home' ? homeSlots() : []) {
  const { el, path } = slot;
  const media = el.querySelector('img, video');
  el.classList.add('studio-slot');

  const tools = document.createElement('div');
  tools.className = 'studio-tools';

  const replace = toolButton({ icon: 'replace', text: 'Replace', title: `Pick a new photo for ${path}` });
  replace.addEventListener('click', () => {
    state.homeTarget = path;
    hooks.openLibrary();
  });
  tools.appendChild(replace);

  // Experience logos have no alt field — index.astro uses the org name as
  // the description — so offering the button there would only ever error.
  // Extra interest photos are described from the card title, so no alt either.
  const extraPhoto = /\.extraImages\.\d+$/.test(path);
  const hasAlt = !path.endsWith('.logo') && !extraPhoto;

  const altBtn = toolButton({ icon: 'alt', text: 'Alt', title: 'Edit the description screen readers announce' });
  const openAlt = async (seed) => {
    let current = seed;
    if (current === undefined) {
      try {
        current = (await post('/home/alt', { imagePath: path })).value;
      } catch (error) { toast(error.message, true); return; }
    }
    editAlt(el, current, (value) => post('/home/alt', { imagePath: path, value }));
  };
  altBtn.addEventListener('click', () => openAlt());
  if (hasAlt) tools.appendChild(altBtn);

  /**
   * List controls, for slots that are a row in a home.json array
   * ("showcase.items.2.image"). Fixed slots like hero.headshot aren't in a
   * list, so reordering and removing them would be meaningless.
   */
  // Not on an extra photo: its row is the whole interest card, and moving
  // or deleting the card from a thumbnail would be a surprise.
  const row = extraPhoto ? null : path.match(/^(.*\.items)\.(\d+)\./);
  if (row) {
    const [, listPath, rawIndex] = row;
    const index = Number(rawIndex);
    el.dataset.studioList = listPath;
    el.dataset.studioRow = String(index);

    /**
     * Drag to rearrange.
     *
     * From a grip rather than the tile body: a pointerdown on the photo
     * already starts a crop, and one gesture can't mean two things. The
     * drop target is whatever tile is under the pointer, so this reorders
     * on the grid rather than positioning freely — which is what keeps it
     * working at phone width, where the grid reflows to one column.
     */
    const move = async (to, note) => {
      try {
        await post('/home/list', { path: listPath, op: 'move', from: index, to });
        toast(note);
      } catch (error) { toast(error.message, true); }
    };

    const grip = toolButton({ icon: 'grip', title: 'Drag to rearrange', className: 'studio-grip' });
    grip.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      try { grip.setPointerCapture(event.pointerId); } catch {}
      document.body.classList.add('studio-rearranging');
      el.classList.add('studio-dragging-tile');

      let target = null;
      const onMove = (moveEvent) => {
        const under = document
          .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
          ?.closest('[data-studio-row]');
        if (target === under) return;
        target?.classList.remove('studio-drop-target');
        target = under && under !== el && under.dataset.studioList === listPath ? under : null;
        target?.classList.add('studio-drop-target');
      };

      const onUp = async () => {
        grip.removeEventListener('pointermove', onMove);
        grip.removeEventListener('pointerup', onUp);
        grip.removeEventListener('pointercancel', onUp);
        document.body.classList.remove('studio-rearranging');
        el.classList.remove('studio-dragging-tile');
        target?.classList.remove('studio-drop-target');
        if (!target) return;
        await move(Number(target.dataset.studioRow), 'rearranged');
      };

      grip.addEventListener('pointermove', onMove);
      grip.addEventListener('pointerup', onUp);
      grip.addEventListener('pointercancel', onUp);
    });
    tools.appendChild(grip);

    for (const [icon, delta, title] of [['left', -1, 'Move earlier'], ['right', 1, 'Move later']]) {
      const button = toolButton({ icon, title });
      button.addEventListener('click', () => move(Math.max(0, index + delta), 'reordered'));
      tools.appendChild(button);
    }

    // Which cell this takes in the collage. Only the showcase has the
    // dominant large/video cells; the other lists are uniform.
    if (listPath === 'showcase.items') {
      const sizes = [['regular', 'Small cell'], ['large', 'Big cell'], ['video', 'Tall cell']];
      const size = document.createElement('select');
      size.title = 'How much of the collage this fills';
      for (const [value, text] of sizes) size.appendChild(new Option(text, value));
      size.value = el.classList.contains('collage-large')
        ? 'large'
        : el.classList.contains('collage-video') ? 'video' : 'regular';
      size.addEventListener('change', async () => {
        try {
          await post('/home/patch', { path: `${listPath}.${index}.size`, value: size.value });
          toast(`cell → ${size.value}`);
        } catch (error) { toast(error.message, true); }
      });
      tools.appendChild(size);
    }

    const add = toolButton({ icon: 'plus', title: 'Add an empty tile after this one' });
    add.addEventListener('click', async () => {
      try {
        await post('/home/list', { path: listPath, op: 'add', after: index });
        toast('tile added — drop a photo on it');
      } catch (error) { toast(error.message, true); }
    });
    tools.appendChild(add);

    const remove = toolButton({ icon: 'trash', title: 'Remove this tile', className: 'studio-danger' });
    remove.addEventListener('click', async () => {
      if (!confirm('Remove this tile?\n\nIf nothing else uses the file and it was never committed, it is moved to .photo-trash and ⌘Z brings it back.')) return;
      try {
        const result = await post('/home/list', { path: listPath, op: 'remove', index });
        toast(result.displaced?.deleted ? `removed · ${result.displaced.file} trashed` : 'removed');
      } catch (error) { toast(error.message, true); }
    });
    tools.appendChild(remove);
  }

  const name = document.createElement('span');
  name.className = 'studio-slot-path';
  name.textContent = path.replace(/Section|\.items/g, '');
  tools.appendChild(name);

  el.appendChild(tools);

  // Drop a file directly on the photo it should replace.
  el.addEventListener('dragover', (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    el.classList.add('studio-slot-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('studio-slot-over'));
  el.addEventListener('drop', async (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation(); // don't also fire the page-wide handler
    el.classList.remove('studio-slot-over');
    const file = event.dataTransfer.files[0];
    if (!file) return;
    toast(`replacing ${path}…`);
    try {
      const data = await readAsBase64(file);
      const result = await post('/media', { target: { kind: 'home', path }, filename: file.name, data });
      toast(
        (result.kind === 'image'
          ? `${path} → ${file.name}  ${size(result.before)} → ${size(result.after)}`
          : `${path} → ${result.file}`) + displacedNote(result.displaced),
      );
      // The description still describes the photo that just left. The
      // reload is about to land, so hand the prompt to the next page load.
      if (result.altPath) parkAltPrompt({ path, staleAlt: result.staleAlt });
    } catch (error) {
      toast(error.message, true);
    }
  });

  // Drag to crop, for the one slot whose schema has a focal point.
  // Every image slot is croppable now. The focal and zoom field names
  // differ per section (aboutSection has photoFocalPoint, list rows take a
  // sibling focal), so the server resolves them from the slot path rather
  // than the client carrying a second copy of that table.
  // Logos are scaled to fit a light plate, never cropped, so a crop
  // gesture there would save a value nothing renders.
  // Experience banners are videos, cropped the same way (object-position and
  // a scale), so they take the same gesture. Other videos aren't cropped.
  const banner = media.tagName === 'VIDEO' && /^experienceSection\.items\.\d+\.video$/.test(path);
  if ((media.tagName !== 'IMG' && !banner) || path.endsWith('.logo')) continue;

  const dot = document.createElement('span');
  dot.className = 'studio-crosshair';
  el.appendChild(dot);

  const current = getComputedStyle(media).objectPosition;
  let [px, py] = (() => {
    const m = current.match(/(-?[\d.]+)%\s+(-?[\d.]+)%/);
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : [50, 50];
  })();

  const readZoom = () => {
    const cs = getComputedStyle(el);
    const v = parseFloat(cs.getPropertyValue('--zoom') || cs.getPropertyValue('--about-zoom'));
    return Number.isFinite(v) && v >= 1 ? v : 1;
  };
  let zoom = readZoom();

  const badge = document.createElement('span');
  badge.className = 'studio-zoom-badge';
  badge.hidden = zoom <= 1.001;
  badge.textContent = `${zoom.toFixed(2)}x`;
  badge.title = 'Click to reset zoom';
  el.appendChild(badge);

  const placeDot = () => {
    const box = media.getBoundingClientRect();
    const frame = el.getBoundingClientRect();
    dot.style.left = `${box.left - frame.left + (box.width * px) / 100}px`;
    dot.style.top = `${box.top - frame.top + (box.height * py) / 100}px`;
  };
  placeDot();
  window.addEventListener('resize', placeDot);

  /**
   * Preview locally.
   *
   * Both the custom property and the inline style are set: the collage
   * reads --focal, the about photo reads its own --about-focal, and the
   * inline objectPosition covers whatever a slot's CSS happens to use.
   * The reload after the save is what makes it real either way.
   */
  const showHome = () => {
    const focal = `${px}% ${py}%`;
    el.style.setProperty('--focal', focal);
    el.style.setProperty('--zoom', String(zoom));
    media.style.objectPosition = focal;
    media.style.transformOrigin = focal;
    media.style.transform = `scale(${zoom})`;
    badge.textContent = `${zoom.toFixed(2)}x`;
    badge.hidden = zoom <= 1.001;
    placeDot();
  };

  let dragging = false;
  let moved = false;
  media.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    moved = false;
    el.classList.add('is-dragging');
    // Best effort: if the pointer is already gone the drag still works,
    // and throwing here would abort before anything is saved.
    try { media.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
  });
  media.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    moved = true;
    const box = media.getBoundingClientRect();
    px = Math.round(Math.min(100, Math.max(0, ((event.clientX - box.left) / box.width) * 100)));
    py = Math.round(Math.min(100, Math.max(0, ((event.clientY - box.top) / box.height) * 100)));
    showHome();
  });
  const finishHome = async (event) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging');
    try { media.releasePointerCapture?.(event.pointerId); } catch {}
    if (!moved) return;
    try {
      await post('/home/crop', { imagePath: path, focal: `${px}% ${py}%` }, { quiet: true });
      toast(`crop → ${px}% ${py}%`);
    } catch (error) {
      toast(error.message, true);
    }
  };
  media.addEventListener('pointerup', finishHome);
  media.addEventListener('pointercancel', finishHome);

  // Same gesture as the project gallery: pinch, or ⌥scroll.
  const saveHomeZoom = () =>
    queueSave(`zoom:${path}`, '/home/crop', { imagePath: path, zoom: Number(zoom.toFixed(2)) });
  media.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.altKey) return;
    event.preventDefault();
    zoom = Math.min(4, Math.max(1, zoom * Math.exp(-event.deltaY / 400)));
    showHome();
    saveHomeZoom();
  }, { passive: false });
  badge.addEventListener('click', () => {
    zoom = 1;
    showHome();
    saveHomeZoom();
    toast('zoom reset');
  });
}

// A replace on the previous page load asked for a new description.
if (MODE === 'home') {
  const pending = takeAltPrompt();
  if (pending) {
    const slot = homeSlots().find((x) => x.path === pending.path);
    if (slot?.el) {
      slot.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      toast('Photo replaced — update the description');
      editAlt(slot.el, pending.staleAlt, (value) =>
        post('/home/alt', { imagePath: pending.path, value }),
      );
    }
  }
}

