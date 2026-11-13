// Studio overlay: inline text editing.
import {
  root,
  MODE,
  toast,
  post,
  label,
} from './core.js';

// -- inline text editing ----------------------------------------------
/**
 * Any element carrying a data-field ("home:…" / "project:…", dev only, see
 * src/lib/edit-fields.ts) that isn't an image slot becomes editable.
 *
 * Text is edited from the SOURCE, not from what's on screen: the tagline
 * renders "*bridge*" as italics, and editing the rendered text would eat
 * the asterisks. When source and rendered text agree the field is edited
 * in place; when they differ a small box opens seeded with the source, so
 * the markup is visible and survives.
 */
// `body` is the whole rendered markdown document, not a field — editing
// what's on screen would replace the source with its own HTML. It stays a
// CMS-and-editor job until there's real source mapping.
const TEXT_SKIP = /(^|\.)(image|photo|logo|headshot|video|alt|href|poster|body|gallery)($|\.)/i;

const textSlots = () =>
  [...document.querySelectorAll('[data-field]')]
    .map((el) => {
      const [doc, ...rest] = (el.getAttribute('data-field') || '').split(':');
      return { el, path: rest.join(':'), isHome: doc === 'home' };
    })
    .filter(({ el, path }) =>
      path && !TEXT_SKIP.test(path) &&
      !el.querySelector('img, video') &&
      // Marker labels sit inside a <button>; figures.js gives them a text box.
      !el.closest('.pfig-callout') &&
      // A wrapper around other editable text (a placeholder figure's
      // root, say) isn't a value itself; its children are.
      !el.querySelector('[data-field]') &&
      // Empty fields are skipped, except ones that show a placeholder
      // (data-empty, e.g. experience dates): those are there to be filled in.
      (el.textContent.trim() !== '' || el.hasAttribute('data-empty')));

const saveText = (slot, value, opts) =>
  slot.isHome
    ? post('/home/patch', { path: slot.path, value }, opts)
    : post('/project/patch', { patch: { [slot.path]: value } }, opts);

const readText = (slot) =>
  slot.isHome
    ? post('/home/value', { path: slot.path })
    : post('/project/value', { path: slot.path });

const editText = async (slot) => {
  const { el } = slot;
  if (el.dataset.studioEditing) return;

  let source;
  try {
    source = (await readText(slot)).value ?? '';
  } catch (error) { toast(error.message, true); return; }

  const rendered = el.textContent.trim();
  const plain = source.trim() === rendered;

  if (plain) {
    // Edit in place. The element keeps its own typography, so what you
    // type is what the page will look like.
    el.dataset.studioEditing = '1';
    el.setAttribute('contenteditable', 'plaintext-only');
    el.classList.add('studio-editing');
    el.focus();

    const done = async (commit) => {
      el.removeAttribute('contenteditable');
      el.classList.remove('studio-editing');
      delete el.dataset.studioEditing;
      const next = el.textContent.trim();
      if (!commit || next === rendered) { el.textContent = rendered; return; }
      try {
        // What's on screen is already the new text: no reload needed.
        await saveText(slot, next, { quiet: true });
        toast('text saved');
      } catch (error) { toast(error.message, true); el.textContent = rendered; }
    };

    el.addEventListener('blur', () => done(true), { once: true });
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); done(false); el.blur(); }
      // Enter commits on a single-line field; multi-line needs ⌘Enter.
      const multiline = source.includes('\n') || rendered.length > 120;
      if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        el.blur();
      }
    });
    return;
  }

  // Source and screen disagree — show the source in a box instead.
  el.querySelector('.studio-text-edit')?.remove();
  const box = document.createElement('form');
  box.className = 'studio-text-edit';
  const area = document.createElement('textarea');
  area.value = source;
  area.rows = Math.min(10, Math.max(2, source.split('\n').length + 1));
  area.setAttribute('aria-label', `Edit ${slot.path}`);
  const hint = document.createElement('span');
  hint.textContent = 'markup — ⌘↵ to save, esc to cancel';
  const ok = document.createElement('button');
  ok.type = 'submit';
  ok.textContent = 'save';
  box.append(area, hint, ok);
  el.appendChild(box);
  area.focus();
  area.select();

  const close = () => box.remove();
  box.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = area.value;
    close();
    try {
      await saveText(slot, value);
      toast('text saved');
    } catch (error) { toast(error.message, true); }
  });
  area.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      box.requestSubmit();
    }
  });
  for (const type of ['pointerdown', 'click']) {
    box.addEventListener(type, (event) => event.stopPropagation());
  }
};

let textOn = false;
const textBtn = root.querySelector('.studio-text');

// Body sections (Problem / What I did / Outcome): click any paragraph or
// bullet to edit that section's markdown in a box. The heading stays put.
const sectionChunks = () =>
  [...document.querySelectorAll('[data-studio-section]')].filter((c) => c.dataset.studioSection);

const editSection = async (chunk) => {
  if (chunk.querySelector('.studio-section-edit')) return;
  const section = chunk.dataset.studioSection;
  let source;
  try {
    source = (await post('/project/section/read', { section })).value ?? '';
  } catch (error) { toast(error.message, true); return; }

  const kids = [...chunk.children].filter((el) => el.tagName !== 'H2');
  for (const el of kids) el.hidden = true;
  const box = document.createElement('form');
  box.className = 'studio-section-edit';
  const area = document.createElement('textarea');
  area.value = source;
  area.rows = Math.min(18, Math.max(4, source.split('\n').length + 2));
  area.setAttribute('aria-label', `Edit the ${section.replace(/-/g, ' ')} section`);
  const foot = document.createElement('div');
  const hint = document.createElement('span');
  hint.textContent = 'Markdown: * starts a bullet, **bold**. ⌘↵ saves, Esc cancels.';
  const cancel = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Cancel', className: 'is-quiet' });
  const ok = Object.assign(document.createElement('button'), { type: 'submit', textContent: 'Save section' });
  foot.append(hint, cancel, ok);
  box.append(area, foot);
  chunk.appendChild(box);
  area.focus();

  const close = () => { box.remove(); for (const el of kids) el.hidden = false; };
  cancel.addEventListener('click', close);
  box.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (area.value.trim() === source.trim()) { close(); return; }
    ok.disabled = true;
    try {
      await post('/project/section', { section, value: area.value });
      toast('section saved');
    } catch (error) { toast(error.message, true); ok.disabled = false; return; }
    close();
  });
  area.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); box.requestSubmit(); }
  });
  for (const type of ['pointerdown', 'click']) box.addEventListener(type, (event) => event.stopPropagation());
};

const bindSections = (on) => {
  for (const chunk of MODE === 'project' ? sectionChunks() : []) {
    for (const el of chunk.children) {
      if (el.tagName === 'H2' || el.classList.contains('studio-section-edit')) continue;
      el.classList.toggle('studio-text-slot', on);
      if (on && !el.dataset.studioSectionBound) {
        el.dataset.studioSectionBound = '1';
        el.addEventListener('click', (event) => {
          if (!textOn) return;
          event.preventDefault();
          event.stopPropagation();
          editSection(chunk);
        });
      }
    }
  }
};

const setTextMode = (on) => {
  textOn = on;
  textBtn?.setAttribute('aria-pressed', String(on));
  document.body.classList.toggle('studio-text-mode', on);
  for (const slot of textSlots()) {
    slot.el.classList.toggle('studio-text-slot', on);
    if (on && !slot.el.dataset.studioTextBound) {
      slot.el.dataset.studioTextBound = '1';
      slot.el.addEventListener('click', (event) => {
        if (!textOn) return;
        // A heading that is also a link would navigate instead.
        event.preventDefault();
        event.stopPropagation();
        editText(slot);
      });
    }
  }
  bindSections(on);
  toast(on ? 'text mode — click any text to edit' : 'text mode off');
};

textBtn?.addEventListener('click', () => setTextMode(!textOn));

