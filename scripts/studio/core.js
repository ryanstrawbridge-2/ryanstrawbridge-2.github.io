/**
 * Studio overlay: shared state and helpers. Every feature module imports from
 * here. Served by scripts/studio-server.mjs at /overlay/ and loaded only by
 * astro dev (see src/components/StudioOverlay.astro), so none of it can reach
 * the production build.
 */

export const root = document.getElementById('studio');

/** Which slot the media library will fill next; set by hero/figure/home, read by library. */
export const state = { heroTarget: false, figureTarget: null, homeTarget: null };
/** Cross-module calls, registered by the module that owns them (library: openLibrary). */
export const hooks = {};

const PORT = root.dataset.port || '4322';
const API = `http://127.0.0.1:${PORT}`;
const HEADINGS = JSON.parse(root.dataset.headings || '[]');
const slug = document.querySelector('[data-studio-slug]')?.getAttribute('data-studio-slug');
const MODE = root.dataset.mode || 'project';

const bar = root.querySelector('.studio-bar');
const toastEl = root.querySelector('.studio-toast');
const dropEl = root.querySelector('.studio-drop');

// Dragging an <img> that is already on the page reports a 'Files' type in
// Chrome, so without this a stray drag on a photo tried to upload the page
// back to itself ("_image isn't an image"). Only drags from outside count.
let internalDrag = false;
document.addEventListener('dragstart', () => { internalDrag = true; });
document.addEventListener('dragend', () => { internalDrag = false; });
window.addEventListener('drop', () => { setTimeout(() => { internalDrag = false; }, 0); }, true);
const isFileDrag = (event) =>
  !internalDrag && [...(event.dataTransfer?.types || [])].includes('Files');

const readAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error(`could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

/** What happened to the file a replacement pushed out. */
const displacedNote = (d) =>
  !d ? '' : d.deleted ? ` · removed ${d.file}` : ` · ${d.file} is now unused`;

const size = (n) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;

// Stroke icons, 24-unit grid, drawn in currentColor. Inline so the overlay
// has no asset requests and nothing here can reach the production build.
const ICON = {
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l.8 12.5a1.5 1.5 0 0 0 1.5 1.5h6.4a1.5 1.5 0 0 0 1.5-1.5L17.5 7"/><path d="M10 11v6M14 11v6"/>',
  alt: '<path d="M4 6h16M4 12h11M4 18h7"/>',
  replace: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5"/><path d="M4 20v-4.5h4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;

/** Toolbar button. Icon-only buttons carry their name in aria-label. */
const toolButton = ({ icon, text, title, className = '' }) => {
  const button = document.createElement('button');
  button.type = 'button';
  if (title) button.title = title;
  if (icon && !text) {
    button.className = `studio-tool-icon ${className}`.trim();
    button.setAttribute('aria-label', title || icon);
    button.innerHTML = svg(icon);
  } else {
    if (className) button.className = className;
    button.innerHTML = icon ? svg(icon) : '';
    button.append(text);
  }
  return button;
};
const toolSep = () => Object.assign(document.createElement('span'), { className: 'studio-tool-sep' });

let toastTimer;
const toast = (message, isError = false) => {
  toastEl.textContent = message;
  toastEl.classList.toggle('is-error', isError);
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, isError ? 6000 : 2600);
};

const undoBtn = root.querySelector('.studio-undo');

/**
 * Keep the undo button in step with the server's journal.
 *
 * The label names the edit rather than counting them ("undo crop" beats
 * "undo (3)") — you are undoing one specific thing you just did, and the
 * only way to be sure it is the right one is to see it named.
 */
const redoBtn = root.querySelector('.studio-redo');
const historyList = root.querySelector('.studio-history-list');

/** Keep Undo / Redo / History in step with the server's journal. */
const setUndo = (state) => {
  if (!undoBtn || !state) return;
  undoBtn.disabled = !state.depth;
  undoBtn.title = state.next ? `Undo: ${state.next} (⌘Z)` : 'Nothing to undo yet';
  if (redoBtn) {
    redoBtn.disabled = !state.redo;
    redoBtn.title = state.redo ? `Redo: ${state.redo} (⌘⇧Z)` : 'Nothing to redo';
  }
  if (historyList && state.history) {
    const ago = (t) => {
      const s = Math.round((Date.now() - t) / 1000);
      return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
    };
    historyList.replaceChildren(...(state.history.length ? state.history.map((h, i) => {
      const li = document.createElement('li');
      const b = Object.assign(document.createElement('button'), { type: 'button', title: `Undo the last ${i + 1} edit${i ? 's' : ''}` });
      b.append(Object.assign(document.createElement('span'), { textContent: h.label }), Object.assign(document.createElement('time'), { textContent: ago(h.at) }));
      b.addEventListener('click', () => doUndo(i + 1));
      li.append(b);
      return li;
    }) : [Object.assign(document.createElement('li'), { className: 'is-empty', textContent: 'No edits yet.' })]));
  }
};

/** Patch fields of one gallery row: patchRow(2, { width: 'half' }). */
const patchRow = (index, fields) =>
  post('/project/patch', { patch: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`gallery.${index}.${k}`, v])) });

const post = async (path, payload) => {
  const response = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `save failed (${response.status})`);
  setUndo(data.undo);
  return data;
};

/**
 * Debounced save that can't be lost to a reload.
 *
 * A zoom gesture fires continuously, so the save waits for it to settle.
 * But any save nudges Astro, and the resulting HMR reload can land inside
 * that window and take the pending write with it — the zoom looked
 * applied, then came back at its old value. Pending writes are flushed
 * with sendBeacon on the way out, which survives teardown.
 */
const pending = new Map();

const queueSave = (key, path, payload, delay = 400) => {
  const existing = pending.get(key);
  if (existing) clearTimeout(existing.timer);
  const entry = { path, payload };
  entry.timer = setTimeout(async () => {
    pending.delete(key);
    try {
      await post(path, payload);
    } catch (error) { toast(error.message, true); }
  }, delay);
  pending.set(key, entry);
};

const flushPending = () => {
  for (const [, { timer, path, payload }] of pending) {
    clearTimeout(timer);
    try {
      navigator.sendBeacon(
        API + path,
        new Blob([JSON.stringify({ slug, ...payload })], { type: 'application/json' }),
      );
    } catch { /* leaving the page anyway */ }
  }
  pending.clear();
};
window.addEventListener('pagehide', flushPending);

let undoing = false;
const journalStep = async (kind, steps = 1) => {
  if (undoing) return;
  undoing = true;
  try {
    const response = await fetch(`${API}/${kind}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ steps }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.reason || data.error || `${kind} failed`);
    // The restored file reloads the page; say what came back before it does.
    const bits = [];
    if (data.restoredMedia) bits.push(`${data.restoredMedia} file back`);
    if (data.deleted) bits.push(`${data.deleted} file removed`);
    const what = data.steps > 1 ? `${data.steps} edits` : data.label;
    toast(`${kind === 'redo' ? 'redid' : 'undid'} ${what}${bits.length ? ` · ${bits.join(' · ')}` : ''}`);
    if (data.missing?.length) toast(`${data.missing.length} file could not be restored`, true);
    setUndo(data.undo);
  } catch (error) {
    toast(error.message, true);
  } finally {
    undoing = false;
  }
};
const doUndo = (steps = 1) => (undoBtn?.disabled ? undefined : journalStep('undo', steps));
const doRedo = () => (redoBtn?.disabled ? undefined : journalStep('redo'));
redoBtn?.addEventListener('click', doRedo);

// History panel.
const historyPanel = root.querySelector('.studio-history-panel');
root.querySelector('.studio-history-open')?.addEventListener('click', async () => {
  historyPanel.hidden = !historyPanel.hidden;
  if (!historyPanel.hidden) {
    try { setUndo((await (await fetch(`${API}/health`)).json()).undo); } catch { /* keeps last list */ }
  }
});
root.querySelector('.studio-history-close')?.addEventListener('click', () => { historyPanel.hidden = true; });

undoBtn?.addEventListener('click', () => doUndo());

// -- focal keyword <-> percentage -------------------------------------
const KEYWORD_PCT = {
  'top-left': [0, 0], top: [50, 0], 'top-right': [100, 0],
  left: [0, 50], center: [50, 50], right: [100, 50],
  'bottom-left': [0, 100], bottom: [50, 100], 'bottom-right': [100, 100],
};
const toPct = (value) => {
  if (!value) return [50, 50];
  if (KEYWORD_PCT[value]) return KEYWORD_PCT[value];
  const m = String(value).match(/(-?[\d.]+)%\s+(-?[\d.]+)%/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : [50, 50];
};

/**
 * A replace triggers a save, which reloads the page so you see the real
 * render — and that reload wipes any alt editor opened in the same tick.
 * Park the request across the reload instead. sessionStorage is per-tab and
 * dev-only; if it's unavailable the prompt is simply skipped rather than
 * the whole replace failing.
 */
const PENDING_ALT = 'studio:pending-alt';
const parkAltPrompt = (payload) => {
  try { sessionStorage.setItem(PENDING_ALT, JSON.stringify(payload)); } catch {}
};
const takeAltPrompt = () => {
  try {
    const raw = sessionStorage.getItem(PENDING_ALT);
    sessionStorage.removeItem(PENDING_ALT);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

/**
 * Inline description editor. Replacing a photo leaves the old alt behind,
 * which is invisible on screen — it only shows up to screen readers and
 * image search — so the editor has to put it in front of you.
 *
 * `save` gets the new text; `current` seeds the box.
 */
const editAlt = (host, current, save) => {
  host.querySelector('.studio-alt-edit')?.remove();
  const box = document.createElement('form');
  box.className = 'studio-alt-edit';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = current ?? '';
  input.placeholder = 'Describe this photo…';
  input.setAttribute('aria-label', 'Image description');
  const ok = document.createElement('button');
  ok.type = 'submit';
  ok.textContent = 'save';
  box.append(input, ok);
  host.appendChild(box);
  input.focus();
  input.select();

  const close = () => box.remove();
  box.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = input.value.trim();
    close();
    try {
      await save(value);
      toast(value ? `description → "${value}"` : 'description cleared');
    } catch (error) { toast(error.message, true); }
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  // Pointer events on the photo would otherwise start a crop drag.
  for (const type of ['pointerdown', 'click']) {
    box.addEventListener(type, (event) => event.stopPropagation());
  }
  return input;
};

const figures = () => [...document.querySelectorAll('figure[data-studio-index]')];

// -- home page: fixed slots, not a list -------------------------------
//
// Every editable image on the home page already carries data-tina-field,
// whose value ends in the JSON path ("...---home.aboutSection.photo").
// Reusing that meant index.astro needed no new markup at all.
const HOME_IMAGE_FIELD = /\.(image|photo|logo|headshot|video)$/;
const homeSlots = () =>
  [...document.querySelectorAll('[data-tina-field*="---home."]')]
    .map((el) => {
      const path = (el.getAttribute('data-tina-field') || '').split('---home.')[1] || '';
      return { el, path };
    })
    .filter(({ el, path }) => HOME_IMAGE_FIELD.test(path) && el.querySelector('img, video'));


const label = (id) =>
  (document.getElementById(id)?.textContent || id).trim();


export {
  doRedo,
  patchRow,
  PORT,
  API,
  HEADINGS,
  slug,
  MODE,
  bar,
  toastEl,
  dropEl,
  internalDrag,
  isFileDrag,
  readAsBase64,
  displacedNote,
  size,
  ICON,
  svg,
  toolButton,
  toolSep,
  toastTimer,
  toast,
  undoBtn,
  setUndo,
  post,
  pending,
  queueSave,
  flushPending,
  undoing,
  doUndo,
  KEYWORD_PCT,
  toPct,
  PENDING_ALT,
  parkAltPrompt,
  takeAltPrompt,
  editAlt,
  figures,
  HOME_IMAGE_FIELD,
  homeSlots,
  label,
};
