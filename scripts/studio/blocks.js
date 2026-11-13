// Studio overlay: section blocks. "Add section", the block picker, and the
// Section panel (Content / Style) for every block on the home page and on
// project pages.
//
//   + Add section   a thin line between sections; click it, pick a block
//   click a block   selects it and opens the panel on the right
//   panel           every field, every list item, photos, style, placement
//
// Each field saves when you leave it (Enter for one-line fields). A save
// reloads the page so you see the real render; the panel reopens on the same
// block, same tab, same field, same scroll position.
import { root, post, toast, svg, MODE, hooks, state, readAsBase64 } from './core.js';

const scope = MODE === 'home' ? 'home' : 'project';
const KEEP = 'studio:block-ui';

// -- block catalogue -----------------------------------------------------------

const GROUPS = [
  ['Text', [
    ['banner', 'Banner', 'Full-width photo or video with text over it'],
    ['text', 'Text', 'Heading, paragraph and buttons'],
    ['split', 'Photo + text', 'A photo or video beside a paragraph'],
    ['cta', 'Call to action', 'A short prompt with buttons'],
    ['quote', 'Quote', 'A pull quote or testimonials'],
  ]],
  ['Lists', [
    ['cards', 'Cards', 'A grid of cards: projects, services, highlights'],
    ['stats', 'Stats', 'Big numbers with labels'],
    ['steps', 'Numbered steps', 'A process, 01 / 02 / 03'],
    ['timeline', 'Timeline', 'Roles or milestones with dates'],
    ['tags', 'Skills', 'Groups of skill chips'],
    ['links', 'Links list', 'Publications, press, downloads'],
    ['faq', 'Questions', 'Expandable questions and answers'],
  ]],
  ['Media', [
    ['gallery', 'Gallery', 'Photo grid, masonry or strip, opens full screen'],
    ['video', 'Video', 'YouTube or Vimeo, loads on play'],
    ['logos', 'Logo strip', 'Companies, teams, sponsors'],
  ]],
  ['Layout', [
    ['marquee', 'Scrolling text', 'A slow ticker of words'],
    ['spacer', 'Spacer', 'Extra space, with or without a line'],
  ]],
];
// Ready-made versions of patterns from engineering portfolios: a block type
// plus starter content and style. Inserted through the same paste path, so
// the server re-checks every field.
const STARTERS = [
  ['cards', 'Numbered services', 'What I do, 01 to 06, no photos', { eyebrow: 'What I do', heading: 'Areas I work in', items: ['Design', 'Analysis', 'Prototyping', 'Testing'].map((t) => ({ title: t, text: 'One sentence on what this covers.' })), style: { variant: 'numbered', columns: '4' } }],
  ['cards', 'Project cards', 'Photo cards that link to case studies', { eyebrow: 'Selected work', heading: 'Projects', items: [1, 2, 3].map((n) => ({ title: `Project ${n}`, text: 'One line on the problem and the result.', tag: 'Category', url: '/projects/' })), style: { variant: 'cards', columns: '3' } }],
  ['quote', 'Testimonials', 'Three short quotes with names', { eyebrow: 'What people say', heading: '', items: [1, 2, 3].map(() => ({ text: 'A sentence from a manager, teammate or professor.', name: 'Name', role: 'Role, Company' })), style: { bg: 'subtle' } }],
  ['timeline', 'Experience with logos', 'Roles, dates and a logo each', { eyebrow: 'Experience', heading: 'Where I have worked', items: [1, 2, 3].map(() => ({ date: 'Dates', title: 'Role', org: 'Company', text: 'One or two lines on what you did.' })) }],
  ['stats', 'Key numbers', 'Three big figures, counting up', { heading: '', items: [1, 2, 3].map(() => ({ value: 'Value', label: 'What it measures' })), style: { countup: true, columns: '3', align: 'center', bg: 'subtle' } }],
  ['banner', 'Intro over a photo', 'Name and role over a full-width photo', { eyebrow: 'Mechanical engineer', heading: 'Headline about what you build', body: 'One line under it.', style: { height: 'tall', shade: '40', width: 'full' } }],
  ['steps', 'How I work', 'A three-step process', { eyebrow: 'Process', heading: 'How I approach a project', items: ['Define', 'Build', 'Test'].map((t) => ({ title: t, text: 'One sentence on this step.' })), style: { columns: '3' } }],
  ['links', 'Publications', 'Papers, press and downloads', { eyebrow: 'Writing', heading: 'Publications and press', items: [{ title: 'Title', source: 'Where it appeared', year: 'Year', url: '' }] }],
];

const TYPE_NAME = Object.fromEntries(GROUPS.flatMap(([, t]) => t.map(([k, n]) => [k, n])));

// Small wireframe for each tile in the picker.
const WIRE = {
  banner: '<rect x="0" y="4" width="64" height="32" rx="2" opacity=".35"/><rect x="8" y="20" width="30" height="5" rx="1"/><rect x="8" y="28" width="20" height="2.5" rx="1" opacity=".7"/>',
  text: '<rect x="8" y="10" width="28" height="4" rx="1"/><rect x="8" y="18" width="48" height="2.5" rx="1" opacity=".5"/><rect x="8" y="23" width="44" height="2.5" rx="1" opacity=".5"/><rect x="8" y="28" width="36" height="2.5" rx="1" opacity=".5"/>',
  split: '<rect x="6" y="8" width="24" height="24" rx="2" opacity=".35"/><rect x="34" y="12" width="22" height="4" rx="1"/><rect x="34" y="20" width="24" height="2.5" rx="1" opacity=".5"/><rect x="34" y="25" width="20" height="2.5" rx="1" opacity=".5"/>',
  cta: '<rect x="18" y="10" width="28" height="4" rx="1"/><rect x="14" y="18" width="36" height="2.5" rx="1" opacity=".5"/><rect x="22" y="25" width="20" height="7" rx="2"/>',
  quote: '<text x="8" y="22" font-size="18" font-family="serif">“</text><rect x="18" y="13" width="38" height="3" rx="1"/><rect x="18" y="19" width="32" height="3" rx="1"/><rect x="18" y="27" width="16" height="2.5" rx="1" opacity=".5"/>',
  cards: '<rect x="6" y="9" width="15" height="22" rx="2" opacity=".35"/><rect x="24.5" y="9" width="15" height="22" rx="2" opacity=".35"/><rect x="43" y="9" width="15" height="22" rx="2" opacity=".35"/>',
  stats: '<rect x="8" y="12" width="12" height="7" rx="1"/><rect x="26" y="12" width="12" height="7" rx="1"/><rect x="44" y="12" width="12" height="7" rx="1"/><rect x="8" y="23" width="12" height="2.5" rx="1" opacity=".5"/><rect x="26" y="23" width="12" height="2.5" rx="1" opacity=".5"/><rect x="44" y="23" width="12" height="2.5" rx="1" opacity=".5"/>',
  steps: '<text x="7" y="17" font-size="7" font-family="monospace">01</text><text x="26" y="17" font-size="7" font-family="monospace">02</text><text x="45" y="17" font-size="7" font-family="monospace">03</text><rect x="7" y="22" width="13" height="2.5" rx="1" opacity=".5"/><rect x="26" y="22" width="13" height="2.5" rx="1" opacity=".5"/><rect x="45" y="22" width="13" height="2.5" rx="1" opacity=".5"/>',
  timeline: '<rect x="14" y="6" width="1.5" height="28" opacity=".5"/><circle cx="14.75" cy="11" r="2.5"/><circle cx="14.75" cy="25" r="2.5"/><rect x="21" y="9.5" width="26" height="3" rx="1"/><rect x="21" y="23.5" width="22" height="3" rx="1"/>',
  tags: '<rect x="6" y="12" width="14" height="6" rx="3" opacity=".5"/><rect x="22" y="12" width="18" height="6" rx="3" opacity=".5"/><rect x="42" y="12" width="14" height="6" rx="3" opacity=".5"/><rect x="6" y="21" width="20" height="6" rx="3" opacity=".5"/><rect x="28" y="21" width="12" height="6" rx="3" opacity=".5"/>',
  links: '<rect x="6" y="10" width="34" height="3" rx="1"/><rect x="46" y="10" width="12" height="3" rx="1" opacity=".5"/><rect x="6" y="18" width="52" height=".8" opacity=".4"/><rect x="6" y="23" width="30" height="3" rx="1"/><rect x="46" y="23" width="12" height="3" rx="1" opacity=".5"/>',
  faq: '<rect x="6" y="9" width="42" height="3" rx="1"/><text x="53" y="13" font-size="7">+</text><rect x="6" y="17" width="52" height=".8" opacity=".4"/><rect x="6" y="22" width="36" height="3" rx="1"/><text x="53" y="26" font-size="7">+</text>',
  gallery: '<rect x="6" y="8" width="24" height="12" rx="1.5" opacity=".35"/><rect x="33" y="8" width="25" height="12" rx="1.5" opacity=".35"/><rect x="6" y="22" width="16" height="10" rx="1.5" opacity=".35"/><rect x="24" y="22" width="16" height="10" rx="1.5" opacity=".35"/><rect x="42" y="22" width="16" height="10" rx="1.5" opacity=".35"/>',
  video: '<rect x="10" y="7" width="44" height="26" rx="3" opacity=".35"/><path d="M29 15v10l8-5z"/>',
  logos: '<rect x="6" y="16" width="10" height="7" rx="1" opacity=".5"/><rect x="20" y="16" width="10" height="7" rx="1" opacity=".5"/><rect x="34" y="16" width="10" height="7" rx="1" opacity=".5"/><rect x="48" y="16" width="10" height="7" rx="1" opacity=".5"/>',
  marquee: '<rect x="0" y="17" width="14" height="5" rx="1"/><rect x="18" y="17" width="18" height="5" rx="1"/><rect x="40" y="17" width="14" height="5" rx="1"/><rect x="58" y="17" width="10" height="5" rx="1"/>',
  spacer: '<rect x="6" y="19.5" width="52" height="1" opacity=".6"/><path d="M32 9v7M29 13l3 3 3-3M32 31v-7M29 27l3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.2"/>',
};

// Fields per type, in the order the panel shows them.
const FIELDS = {
  banner: [['eyebrow', 'Eyebrow'], ['heading', 'Headline'], ['body', 'Text', 'area'], ['image', 'Background photo or video', 'media'], ['alt', 'Photo description']],
  text: [['eyebrow', 'Eyebrow'], ['heading', 'Heading'], ['intro', 'Intro', 'area'], ['body', 'Text', 'area']],
  split: [['eyebrow', 'Eyebrow'], ['heading', 'Heading'], ['body', 'Text', 'area'], ['image', 'Photo or video', 'media'], ['alt', 'Photo description']],
  cta: [['eyebrow', 'Eyebrow'], ['heading', 'Heading'], ['body', 'Text', 'area']],
  quote: [['eyebrow', 'Eyebrow'], ['heading', 'Heading']],
  cards: [['eyebrow', 'Eyebrow'], ['heading', 'Heading'], ['intro', 'Intro', 'area']],
  stats: [['eyebrow', 'Eyebrow'], ['heading', 'Heading'], ['intro', 'Intro', 'area']],
  steps: [['eyebrow', 'Eyebrow'], ['heading', 'Heading'], ['intro', 'Intro', 'area']],
  timeline: [['eyebrow', 'Eyebrow'], ['heading', 'Heading'], ['intro', 'Intro', 'area']],
  tags: [['eyebrow', 'Eyebrow'], ['heading', 'Heading']],
  links: [['eyebrow', 'Eyebrow'], ['heading', 'Heading'], ['intro', 'Intro', 'area']],
  faq: [['eyebrow', 'Eyebrow'], ['heading', 'Heading']],
  gallery: [['eyebrow', 'Eyebrow'], ['heading', 'Heading'], ['intro', 'Intro', 'area']],
  video: [['eyebrow', 'Eyebrow'], ['heading', 'Heading'], ['url', 'YouTube or Vimeo link'], ['caption', 'Caption']],
  logos: [['eyebrow', 'Eyebrow'], ['heading', 'Heading']],
  marquee: [['words', 'Words, separated by commas', 'area']],
  spacer: [['size', 'Height (px)', 'number']],
};
const ITEM_FIELDS = {
  cards: [['image', 'Photo', 'media'], ['tag', 'Tag'], ['title', 'Title'], ['text', 'Text', 'area'], ['url', 'Link (optional)']],
  stats: [['value', 'Number'], ['label', 'Label']],
  quote: [['text', 'Quote', 'area'], ['name', 'Name'], ['role', 'Role']],
  steps: [['title', 'Title'], ['text', 'Text', 'area']],
  timeline: [['date', 'Dates'], ['title', 'Title'], ['org', 'Organization'], ['text', 'Text', 'area'], ['image', 'Logo (optional)', 'media']],
  tags: [['label', 'Group name'], ['tags', 'Chips, separated by commas', 'area']],
  links: [['title', 'Title'], ['source', 'Source'], ['year', 'Year'], ['url', 'Link']],
  faq: [['q', 'Question'], ['a', 'Answer', 'area']],
  gallery: [['image', 'Photo', 'media'], ['caption', 'Caption']],
  logos: [['name', 'Name'], ['image', 'Logo', 'media'], ['url', 'Link (optional)']],
};
const ITEM_NOUN = { cards: 'card', stats: 'stat', quote: 'quote', steps: 'step', timeline: 'entry', tags: 'group', links: 'link', faq: 'question', gallery: 'photo', logos: 'logo' };
const HAS_BUTTONS = new Set(['banner', 'text', 'split', 'cta', 'cards']);

const STYLE = {
  bg: ['Background', [['none', 'None'], ['subtle', 'Subtle'], ['accent', 'Tint'], ['dark', 'Dark']]],
  width: ['Width', [['narrow', 'Narrow'], ['contained', 'Normal'], ['wide', 'Wide'], ['full', 'Full']]],
  align: ['Alignment', [['left', 'Left'], ['center', 'Center']]],
  columns: ['Columns', [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']]],
};
const VARIANTS = {
  cards: [['cards', 'Cards'], ['plain', 'Plain'], ['numbered', 'Numbered'], ['overlay', 'Text on photo']],
  gallery: [['grid', 'Grid'], ['masonry', 'Masonry'], ['strip', 'Strip']],
};
const COLUMNS_FOR = new Set(['cards', 'stats', 'steps', 'gallery']);

// -- helpers ---------------------------------------------------------------------

const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const kid of kids) if (kid != null && kid !== false) node.append(kid);
  return node;
};
const CLIP = 'studio:block-clipboard';
const readClip = () => { try { return JSON.parse(localStorage.getItem(CLIP) || 'null'); } catch { return null; } };
const blocksOnPage = () => [...document.querySelectorAll('[data-block-id]')];
const send = (op, body) => post('/blocks', { scope, op, ...body });
const keep = (extra = {}) => {
  try { sessionStorage.setItem(KEEP, JSON.stringify({ path: location.pathname, at: Date.now(), ...extra })); } catch { /* ignore */ }
};
// Not removed on read: a project save can reload the page twice (content
// sync, then the page), and the second load must land in the same place.
// It is cleared a few seconds after it has been applied instead.
const readKeep = () => {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEEP) || 'null');
    if (!v || v.path !== location.pathname || Date.now() - v.at > 15000) { sessionStorage.removeItem(KEEP); return null; }
    setTimeout(() => {
      try { if (JSON.parse(sessionStorage.getItem(KEEP) || 'null')?.at === v.at) sessionStorage.removeItem(KEEP); } catch { /* ignore */ }
    }, 4000);
    return v;
  } catch { return null; }
};

/** Read the block's saved data (home.json or frontmatter) by its index. */
const readBlock = async (index) => {
  const r = scope === 'home'
    ? await post('/home/value', { path: `blocks.${index}`, json: true })
    : await post('/project/value', { path: `blocks.${index}`, json: true });
  return r.value ?? {};
};

// -- add section ------------------------------------------------------------------

const picker = el('div', { className: 'studio-picker', hidden: true });
picker.setAttribute('role', 'dialog');
picker.setAttribute('aria-modal', 'true');
picker.setAttribute('aria-label', 'Add a section');
root.appendChild(picker);
let pickTarget = null;

const closePicker = () => { picker.hidden = true; pickTarget = null; };
const openPicker = (after, label) => {
  pickTarget = after;
  picker.replaceChildren();
  const box = el('div', { className: 'studio-picker-box' });
  const search = el('input', { className: 'studio-input studio-picker-search', placeholder: 'Search sections', type: 'search' });
  const head = el('header', {},
    el('div', {}, el('strong', { textContent: 'Add a section' }), el('span', { className: 'studio-picker-where', textContent: label })),
    search,
    (() => { const b = el('button', { type: 'button', className: 'studio-btn studio-tool-icon', title: 'Close (Esc)' }); b.innerHTML = svg('x'); b.addEventListener('click', closePicker); return b; })(),
  );
  const body = el('div', { className: 'studio-picker-body' });
  const tiles = [];
  const clip = readClip();
  if (clip?.type && TYPE_NAME[clip.type]) {
    const paste = el('button', { type: 'button', className: 'studio-picker-tile studio-picker-paste' });
    paste.innerHTML = `<svg viewBox="0 0 64 40" aria-hidden="true" fill="currentColor">${WIRE[clip.type] ?? ''}</svg>`;
    paste.append(el('strong', { textContent: `Paste: ${TYPE_NAME[clip.type]}` }), el('span', { textContent: clip.label ? `“${clip.label}”, copied ${clip.from}` : `Copied ${clip.from}` }));
    paste.dataset.search = `paste ${TYPE_NAME[clip.type]}`.toLowerCase();
    paste.addEventListener('click', () => addBlock(clip.type, clip.data));
    tiles.push(paste);
    body.append(el('section', { className: 'studio-picker-group' }, el('h4', { textContent: 'Clipboard' }), el('div', { className: 'studio-picker-grid' }, paste)));
  }
  {
    const grid = el('div', { className: 'studio-picker-grid' });
    for (const [type, name, desc, data] of STARTERS) {
      const tile = el('button', { type: 'button', className: 'studio-picker-tile is-starter' });
      tile.innerHTML = `<svg viewBox="0 0 64 40" aria-hidden="true" fill="currentColor">${WIRE[type]}</svg>`;
      tile.append(el('strong', { textContent: name }), el('span', { textContent: desc }));
      tile.dataset.search = `${name} ${desc} ${type} starter`.toLowerCase();
      tile.addEventListener('click', () => addBlock(type, data));
      grid.append(tile);
      tiles.push(tile);
    }
    body.append(el('section', { className: 'studio-picker-group' }, el('h4', { textContent: 'Starters' }), grid));
  }
  for (const [group, types] of GROUPS) {
    const grid = el('div', { className: 'studio-picker-grid' });
    for (const [type, name, desc] of types) {
      const tile = el('button', { type: 'button', className: 'studio-picker-tile' });
      tile.innerHTML = `<svg viewBox="0 0 64 40" aria-hidden="true" fill="currentColor">${WIRE[type]}</svg>`;
      tile.append(el('strong', { textContent: name }), el('span', { textContent: desc }));
      tile.dataset.search = `${name} ${desc} ${type}`.toLowerCase();
      tile.addEventListener('click', () => addBlock(type));
      grid.append(tile);
      tiles.push(tile);
    }
    body.append(el('section', { className: 'studio-picker-group' }, el('h4', { textContent: group }), grid));
  }
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    for (const t of tiles) t.hidden = q && !t.dataset.search.includes(q);
    for (const g of body.querySelectorAll('.studio-picker-group')) g.hidden = ![...g.querySelectorAll('.studio-picker-tile')].some((t) => !t.hidden);
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const first = tiles.find((t) => !t.hidden); first?.click(); }
  });
  box.append(head, body, el('footer', {}, el('span', { textContent: 'New sections start as drafts: you see them here, visitors don\'t until you switch "Show on live site" on.' })));
  picker.append(box);
  picker.hidden = false;
  search.focus();
};
picker.addEventListener('click', (e) => { if (e.target === picker) closePicker(); });

const addBlock = async (type, paste) => {
  const after = pickTarget;
  closePicker();
  // The reload can beat the reply, so note what exists now and pick the
  // newcomer after the reload rather than waiting for its id.
  keep({ selectNew: blocksOnPage().map((b) => b.dataset.blockId), tab: 'content' });
  try {
    const r = await send('add', { type, after, ...(paste ? { patch: { paste } } : {}) });
    keep({ select: r.id, tab: 'content' });
    toast(`${TYPE_NAME[type]} section added (draft)`);
  } catch (error) { toast(error.message, true); }
};

const inserter = (after, label, where) => {
  const line = el('div', { className: 'studio-insert' });
  const b = el('button', { type: 'button', className: 'studio-insert-btn' });
  b.innerHTML = `${svg('plus')}<span>Add section</span>`;
  b.title = label;
  b.addEventListener('click', (e) => { e.stopPropagation(); openPicker(after, label); });
  line.append(b);
  where(line);
  return line;
};

const placeInserters = () => {
  document.querySelectorAll('.studio-insert').forEach((n) => n.remove());
  if (scope === 'home') {
    const sections = [...document.querySelectorAll('.home-flow > [data-layout]')]
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    for (const s of sections) {
      const BUILT = { hero: 'the top', showcase: 'the collage', projects: 'Projects', experience: 'Experience', about: 'About', contact: 'Contact' };
      const name = BUILT[s.dataset.layout] ?? `"${(s.dataset.layoutName || 'section').replace(/[*_|`]/g, '')}"`;
      // The inserter goes INSIDE the section, at its bottom edge, so flex
      // `order` on the sections can't separate it from the one it follows.
      inserter(s.dataset.layout, `Add a section after ${name}`, (n) => { n.classList.add('is-after'); s.append(n); });
    }
  } else {
    for (const chunk of document.querySelectorAll('.body-chunk[data-studio-section]')) {
      const heading = chunk.querySelector('h2')?.textContent.trim() || chunk.dataset.studioSection;
      // After the chunk's own figures, gallery and blocks: before the next chunk.
      let end = chunk;
      while (end.nextElementSibling && !end.nextElementSibling.matches('.body-chunk')) end = end.nextElementSibling;
      inserter(heading, `Add a section at the end of "${heading}"`, (n) => end.after(n));
    }
    const main = document.querySelector('.project-main');
    if (main) inserter('', 'Add a section at the end of the page', (n) => main.append(n));
  }
};

// -- selection + panel ---------------------------------------------------------------

const panel = el('aside', { className: 'studio-panel studio-inspector studio-block-panel', hidden: true });
panel.setAttribute('aria-label', 'Section');
root.appendChild(panel);
let current = null; // { el, index, id, type, data, tab }

const deselect = () => {
  document.querySelectorAll('.studio-block-selected').forEach((n) => n.classList.remove('studio-block-selected'));
  panel.hidden = true;
  current = null;
};

const select = async (blockEl, { tab = 'content', focus = null, scrollTop = 0 } = {}) => {
  document.querySelectorAll('.studio-block-selected').forEach((n) => n.classList.remove('studio-block-selected'));
  blockEl.classList.add('studio-block-selected');
  const index = Number(blockEl.dataset.block);
  let data;
  try { data = await readBlock(index); } catch (error) { toast(error.message, true); return; }
  current = { el: blockEl, index, id: blockEl.dataset.blockId, type: blockEl.dataset.blockType, data, tab };
  render();
  const body = panel.querySelector('.studio-ins-body');
  if (body) body.scrollTop = scrollTop;
  if (focus) {
    const f = panel.querySelector(`[data-key="${CSS.escape(focus)}"]`);
    if (f) { f.focus(); if (typeof f.setSelectionRange === 'function' && f.type !== 'number') f.setSelectionRange(f.value.length, f.value.length); }
  }
};

/** Save one field and remember where we were so the reload lands in place. */
const save = async (patch, focusKey) => {
  keep({
    select: current.id, tab: current.tab, focus: focusKey ?? null,
    scrollTop: panel.querySelector('.studio-ins-body')?.scrollTop ?? 0,
  });
  try {
    await send('patch', { id: current.id, patch });
  } catch (error) { toast(error.message, true); }
};
const run = async (op, body, note) => {
  keep({ select: current?.id, tab: current?.tab, scrollTop: panel.querySelector('.studio-ins-body')?.scrollTop ?? 0 });
  try {
    const r = await send(op, { id: current.id, ...body });
    if (note) toast(note);
    return r;
  } catch (error) { toast(error.message, true); return null; }
};

/** Wrap the selection in markers (or insert them around a placeholder). */
const wrap = (input, before, after, placeholder = 'text') => {
  const { selectionStart: a, selectionEnd: b, value } = input;
  const picked = value.slice(a, b) || placeholder;
  input.setRangeText(`${before}${picked}${after}`, a, b, 'select');
  input.setSelectionRange(a + before.length, a + before.length + picked.length);
  input.focus();
};
const link = (input) => {
  const url = prompt('Link to (https://…, /page, or mailto:)', 'https://');
  if (!url || url === 'https://') return;
  wrap(input, '[', `](${url})`, 'link text');
};
const prefixLines = (input, prefix) => {
  const { selectionStart: a, selectionEnd: b, value } = input;
  const start = value.lastIndexOf('\n', a - 1) + 1;
  const end = value.indexOf('\n', b) === -1 ? value.length : value.indexOf('\n', b);
  const lines = value.slice(start, end).split('\n').map((l, i) => (prefix === '1.' ? `${i + 1}. ` : `${prefix} `) + l.replace(/^(\s*[-*]|\s*\d+[.)])\s+/, ''));
  input.setRangeText(lines.join('\n'), start, end, 'select');
  input.focus();
};
const formatBar = (input) => {
  const bar = el('div', { className: 'studio-fmt', role: 'toolbar', 'aria-label': 'Formatting' });
  for (const [label, title, fn] of [
    ['B', 'Bold (⌘B)', () => wrap(input, '**', '**')],
    ['I', 'Italic (⌘I)', () => wrap(input, '*', '*')],
    ['Link', 'Link (⌘K)', () => link(input)],
    ['• List', 'Bullet list', () => prefixLines(input, '-')],
    ['1. List', 'Numbered list', () => prefixLines(input, '1.')],
    ['█ Redact', 'Hide words behind bars, for work you can\'t name', () => wrap(input, '||', '||', 'hidden')],
  ]) {
    const b = el('button', { type: 'button', textContent: label, title });
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection
    b.addEventListener('click', fn);
    bar.append(b);
  }
  return bar;
};

const textInput = (key, label, value, kind = 'text') => {
  const multiline = kind === 'area';
  const input = el(multiline ? 'textarea' : 'input', { className: 'studio-input', value: value ?? '' });
  if (kind === 'number') input.type = 'number';
  if (multiline) input.rows = Math.min(8, Math.max(2, Math.ceil(String(value ?? '').length / 40) + (String(value ?? '').match(/\n/g)?.length ?? 0)));
  input.dataset.key = key;
  const start = input.value;
  input.addEventListener('change', () => { if (input.value !== start) save({ [key]: input.value.trim() === '' ? null : (kind === 'number' ? Number(input.value) : input.value) }, key); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = start; input.blur(); }
  });
  const rich = multiline && key !== 'words' && !key.endsWith('tags');
  const hint = rich ? el('small', { textContent: '⌘B bold · ⌘I italic · ⌘K link · ⌘↵ saves' }) : null;
  const bar = rich ? formatBar(input) : null;
  if (rich) {
    input.addEventListener('keydown', (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); wrap(input, '**', '**'); }
      if (k === 'i') { e.preventDefault(); wrap(input, '*', '*'); }
      if (k === 'k') { e.preventDefault(); link(input); }
    });
  }
  return el('label', { className: 'studio-ins-field' }, el('span', { textContent: label }), bar, input, hint);
};

const segmented = (key, label, options, value, fallback) => {
  const wrap = el('div', { className: 'studio-seg', role: 'radiogroup' });
  for (const [v, t] of options) {
    const b = el('button', { type: 'button', textContent: t, className: (value ?? fallback) === v ? 'is-on' : '' });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String((value ?? fallback) === v));
    b.addEventListener('click', () => { if ((value ?? fallback) !== v) save({ [key]: v }); });
    wrap.append(b);
  }
  return el('div', { className: 'studio-ins-field' }, el('span', { textContent: label }), wrap);
};

const toggle = (key, label, value, hint) => {
  const input = el('input', { type: 'checkbox', checked: !!value });
  input.addEventListener('change', () => save({ [key]: input.checked }));
  return el('label', { className: 'studio-toggle' }, input, el('span', { className: 'studio-toggle-ui' }), el('span', {}, el('b', { textContent: label }), hint ? el('small', { textContent: hint }) : null));
};

/** Photo field: thumbnail, upload, library (home), remove. */
const mediaField = (path, label, value) => {
  const wrap = el('div', { className: 'studio-ins-field' }, el('span', { textContent: label }));
  const src = document.querySelector(`[data-field$="${CSS.escape(`blocks.${current.index}.${path}`)}"] img, [data-field$="${CSS.escape(`blocks.${current.index}.${path}`)}"] video`);
  if (value && src) {
    const thumb = src.tagName === 'VIDEO' ? el('video', { src: src.currentSrc || src.src, muted: true, className: 'studio-ins-thumb' }) : el('img', { src: src.currentSrc || src.src, className: 'studio-ins-thumb', alt: '' });
    wrap.append(thumb);
  } else if (value) {
    wrap.append(el('small', { textContent: String(value).split('/').pop() }));
  }
  const row = el('div', { className: 'studio-ins-btnrow' });
  const file = el('input', { type: 'file', accept: path === 'image' && (current.type === 'split' || current.type === 'banner') ? 'image/*,video/mp4,video/quicktime' : 'image/*', hidden: true });
  const upload = el('button', { type: 'button', className: 'studio-btn', textContent: value ? 'Replace…' : 'Upload…' });
  upload.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    toast(`uploading ${f.name}…`);
    keep({ select: current.id, tab: current.tab, scrollTop: panel.querySelector('.studio-ins-body')?.scrollTop ?? 0 });
    try {
      await post('/media', { target: { kind: 'block', scope, path: `blocks.${current.index}.${path}` }, filename: f.name, data: await readAsBase64(f) });
      toast(`${f.name} added`);
    } catch (error) { toast(error.message, true); }
  });
  row.append(upload, file);
  if (scope === 'home' && hooks.openLibrary) {
    const lib = el('button', { type: 'button', className: 'studio-btn', textContent: 'From library' });
    lib.addEventListener('click', () => {
      keep({ select: current.id, tab: current.tab, scrollTop: panel.querySelector('.studio-ins-body')?.scrollTop ?? 0 });
      state.homeTarget = `blocks.${current.index}.${path}`;
      hooks.openLibrary();
    });
    row.append(lib);
  }
  if (value) {
    const rm = el('button', { type: 'button', className: 'studio-btn studio-danger', textContent: 'Remove' });
    rm.addEventListener('click', () => save({ [path]: null, ...(path === 'image' && current.data.video ? { video: null } : {}) }));
    row.append(rm);
  }
  wrap.append(row);
  if (value) wrap.append(el('small', { textContent: 'Drag the photo on the page to reframe it; ⌥-scroll to zoom.' }));
  return wrap;
};

const itemList = (data) => {
  const type = current.type;
  const fields = ITEM_FIELDS[type];
  if (!fields) return null;
  const items = Array.isArray(data.items) ? data.items : [];
  const noun = ITEM_NOUN[type] ?? 'item';
  const group = el('div', { className: 'studio-ins-group' }, el('h4', { textContent: `${noun[0].toUpperCase()}${noun.slice(1)}s · ${items.length}` }));
  const openKey = `studio:block-open:${current.id}`;
  let open = -1;
  try { open = Number(sessionStorage.getItem(openKey) ?? -1); } catch { /* ignore */ }
  items.forEach((item, k) => {
    const title = String(item.title ?? item.q ?? item.label ?? item.name ?? item.value ?? item.caption ?? item.text ?? '').replace(/[*_|`]/g, '').slice(0, 48) || `${noun} ${k + 1}`;
    const det = el('details', { className: 'studio-item', open: open === k });
    det.draggable = true;
    det.dataset.index = String(k);
    det.addEventListener('dragstart', (e) => {
      if (e.target.closest('input, textarea, select')) { e.preventDefault(); return; }
      e.dataTransfer.setData('text/x-studio-item', String(k));
      e.dataTransfer.effectAllowed = 'move';
      det.classList.add('is-dragging');
    });
    det.addEventListener('dragend', () => det.classList.remove('is-dragging'));
    det.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('text/x-studio-item')) return;
      e.preventDefault();
      const r = det.getBoundingClientRect();
      det.classList.toggle('drop-before', e.clientY < r.top + r.height / 2);
      det.classList.toggle('drop-after', e.clientY >= r.top + r.height / 2);
    });
    det.addEventListener('dragleave', () => det.classList.remove('drop-before', 'drop-after'));
    det.addEventListener('drop', (e) => {
      const from = Number(e.dataTransfer.getData('text/x-studio-item'));
      if (!Number.isInteger(from)) return;
      e.preventDefault();
      const after = det.classList.contains('drop-after');
      det.classList.remove('drop-before', 'drop-after');
      let to = k + (after ? 1 : 0);
      if (from < to) to -= 1;
      if (to !== from) run('item', { patch: { op: 'move' }, from, to }, 'reordered');
    });
    const sum = el('summary', {}, el('span', { className: 'studio-item-n', textContent: String(k + 1) }), el('span', { className: 'studio-item-title', textContent: title }));
    const btns = el('span', { className: 'studio-item-btns' });
    for (const [icon, tip, fn, disabled] of [
      ['up', 'Move up', () => run('item', { patch: { op: 'move' }, from: k, to: k - 1 }), k === 0],
      ['down', 'Move down', () => run('item', { patch: { op: 'move' }, from: k, to: k + 1 }), k === items.length - 1],
      ['trash', `Delete this ${noun}`, () => { if (confirm(`Delete ${noun} ${k + 1}?`)) run('item', { patch: { op: 'remove' }, index: k }, `${noun} deleted`); }, false],
    ]) {
      const b = el('button', { type: 'button', className: 'studio-btn studio-tool-icon', title: tip, disabled });
      b.innerHTML = svg(icon);
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
      btns.append(b);
    }
    sum.append(btns);
    det.append(sum);
    det.addEventListener('toggle', () => { try { sessionStorage.setItem(openKey, det.open ? String(k) : '-1'); } catch { /* ignore */ } });
    const inner = el('div', { className: 'studio-item-body' });
    for (const [f, label, kind] of fields) {
      inner.append(kind === 'media' ? mediaField(`items.${k}.${f}`, label, item[f]) : textInput(`items.${k}.${f}`, label, item[f], kind));
    }
    det.append(inner);
    group.append(det);
  });
  const add = el('button', { type: 'button', className: 'studio-btn studio-ins-add' });
  add.innerHTML = `${svg('plus')} Add ${noun}`;
  add.addEventListener('click', async () => {
    try { sessionStorage.setItem(openKey, String(items.length)); } catch { /* ignore */ }
    await run('item', { patch: { op: 'add' } }, `${noun} added`);
  });
  group.append(add);
  return group;
};

const buttonList = (data) => {
  if (!HAS_BUTTONS.has(current.type)) return null;
  const buttons = Array.isArray(data.buttons) ? data.buttons : [];
  const group = el('div', { className: 'studio-ins-group' }, el('h4', { textContent: `Buttons · ${buttons.length}` }));
  buttons.forEach((b, k) => {
    const row = el('div', { className: 'studio-btn-row' },
      textInput(`buttons.${k}.label`, 'Label', b.label),
      textInput(`buttons.${k}.url`, 'Link', b.url),
    );
    const style = el('select', { className: 'studio-input' });
    for (const [v, t] of [['primary', 'Solid'], ['secondary', 'Outline']]) style.append(new Option(t, v));
    style.value = b.style ?? 'primary';
    style.addEventListener('change', () => save({ [`buttons.${k}.style`]: style.value }));
    const rm = el('button', { type: 'button', className: 'studio-btn studio-tool-icon', title: 'Remove button' });
    rm.innerHTML = svg('trash');
    rm.addEventListener('click', () => run('button', { patch: { op: 'remove' }, index: k }, 'button removed'));
    row.append(el('div', { className: 'studio-btn-row-end' }, style, rm));
    group.append(row);
  });
  const add = el('button', { type: 'button', className: 'studio-btn studio-ins-add' });
  add.innerHTML = `${svg('plus')} Add button`;
  add.addEventListener('click', () => run('button', { patch: { op: 'add' } }, 'button added'));
  group.append(add);
  return group;
};

const sectionPlacement = (data) => {
  if (scope !== 'project') return null;
  const headings = [...document.querySelectorAll('.body-chunk[data-studio-section] h2')].map((h) => h.textContent.trim());
  const s = el('select', { className: 'studio-input' });
  for (const h of headings) s.append(new Option(`Under "${h}"`, h));
  s.append(new Option('End of the page', ''));
  const cur = headings.find((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '-') === String(data.section ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  s.value = cur ?? '';
  s.addEventListener('change', () => run('move', { to: s.value }, 'moved'));
  return el('label', { className: 'studio-ins-field' }, el('span', { textContent: 'Where it sits' }), s);
};

function copyCurrent() {
  if (!current) return;
  const { id, type, draft, section, ...data } = current.data;
  const label = String(data.heading ?? data.eyebrow ?? '').replace(/[*_|`]/g, '').slice(0, 40);
  try {
    localStorage.setItem(CLIP, JSON.stringify({ type: current.type, data, label, from: scope === 'home' ? 'from the home page' : 'from a project page' }));
    toast(`copied: paste it from "+ Add section" on any page`);
  } catch { toast('could not copy (browser storage is blocked)', true); }
}

function render() {
  const { data, type } = current;
  const style = data.style ?? {};
  panel.replaceChildren();

  const close = el('button', { type: 'button', className: 'studio-btn studio-tool-icon', title: 'Close (Esc)' });
  close.innerHTML = svg('x');
  close.addEventListener('click', deselect);
  const header = el('header', {},
    el('span', { className: 'studio-block-icon', innerHTML: `<svg viewBox="0 0 64 40" fill="currentColor" aria-hidden="true">${WIRE[type] ?? ''}</svg>` }),
    el('strong', { textContent: TYPE_NAME[type] ?? type }),
    close,
  );

  // Live / draft, always at the top: the one switch that decides whether
  // anyone else sees this.
  const live = toggle('draft', 'Show on live site', !data.draft, data.draft ? 'Draft: only you can see it, in studio.' : 'Visible to visitors once you Save and Go live.');
  live.querySelector('input').addEventListener('change', (e) => { e.stopImmediatePropagation(); save({ draft: !e.target.checked }); }, true);

  const tabs = el('div', { className: 'studio-tabs', role: 'tablist' });
  for (const [k, t] of [['content', 'Content'], ['style', 'Style']]) {
    const b = el('button', { type: 'button', textContent: t, className: current.tab === k ? 'is-on' : '' });
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(current.tab === k));
    b.addEventListener('click', () => { current.tab = k; render(); });
    tabs.append(b);
  }

  const body = el('div', { className: 'studio-ins-body' });
  if (current.tab === 'content') {
    const g = el('div', { className: 'studio-ins-group' });
    for (const [key, label, kind] of FIELDS[type] ?? []) {
      g.append(kind === 'media' ? mediaField(key, label, data.video || data.image) : textInput(key, label, data[key], kind));
    }
    body.append(g);
    const items = itemList(data);
    if (items) body.append(items);
    const buttons = buttonList(data);
    if (buttons) body.append(buttons);
  } else {
    const g = el('div', { className: 'studio-ins-group' });
    if (type !== 'spacer') {
      g.append(segmented('style.bg', STYLE.bg[0], STYLE.bg[1], style.bg, 'none'));
      if (scope === 'home') g.append(segmented('style.width', STYLE.width[0], STYLE.width[1], style.width, 'contained'));
      g.append(segmented('style.align', STYLE.align[0], STYLE.align[1], style.align, 'left'));
    }
    if (COLUMNS_FOR.has(type)) g.append(segmented('style.columns', STYLE.columns[0], STYLE.columns[1], style.columns, type === 'cards' || type === 'stats' ? '3' : '2'));
    if (VARIANTS[type]) g.append(segmented('style.variant', 'Look', VARIANTS[type], style.variant, VARIANTS[type][0][0]));
    if (type === 'split') {
      g.append(segmented('style.side', 'Photo side', [['left', 'Left'], ['right', 'Right']], style.side, 'left'));
      g.append(segmented('style.ratio', 'Photo width', [['40', 'Narrow'], ['50', 'Half'], ['60', 'Wide']], style.ratio, '50'));
    }
    if (type === 'banner') {
      g.append(segmented('style.height', 'Height', [['short', 'Short'], ['medium', 'Medium'], ['tall', 'Tall'], ['screen', 'Full screen']], style.height, 'medium'));
      g.append(segmented('style.shade', 'Darken photo', [['0', 'None'], ['20', '20%'], ['40', '40%'], ['60', '60%'], ['80', '80%']], style.shade, '40'));
    }
    if (scope === 'project') g.append(segmented('style.space', 'Space around', [['tight', 'Tight'], ['normal', 'Normal'], ['loose', 'Loose']], style.space, 'normal'));
    if (type === 'faq') g.append(toggle('style.open', 'Start expanded', style.open));
    if (type === 'stats') g.append(toggle('style.countup', 'Count up on scroll', style.countup, 'Numbers run up from 0 the first time they come into view.'));
    if (type !== 'spacer' && type !== 'marquee') {
      const rv = toggle('style.reveal', 'Fade in on scroll', style.reveal !== false, 'Same entrance as the rest of the site.');
      rv.querySelector('input').addEventListener('change', (e) => { e.stopImmediatePropagation(); save({ 'style.reveal': e.target.checked ? null : false }); }, true);
      g.append(rv);
    }
    if (type === 'spacer') g.append(toggle('style.line', 'Show a divider line', style.line));
    if (scope === 'home' && type !== 'spacer' && type !== 'marquee') g.append(toggle('style.numbered', 'Numbered eyebrow', style.numbered, 'Shows (001), (002)… by page position.'));
    body.append(g);
    const adv = el('div', { className: 'studio-ins-group' }, el('h4', { textContent: 'Link to this section' }));
    adv.append(textInput('anchor', 'Anchor name (for #links)', data.anchor));
    body.append(adv);
    if (scope === 'home') body.append(el('p', { className: 'studio-ins-tip', textContent: 'Spacing above and below: turn on Layout (L) and drag the pink bands.' }));
  }
  const placement = sectionPlacement(data);
  if (placement && current.tab === 'content') body.prepend(placement);

  const footer = el('footer', {});
  const left = el('div', { className: 'studio-ins-btnrow' });
  for (const [icon, tip, dir] of [['up', 'Move up', -1], ['down', 'Move down', 1]]) {
    const b = el('button', { type: 'button', className: 'studio-btn studio-tool-icon', title: tip });
    b.innerHTML = svg(icon);
    b.addEventListener('click', () => run('move', { dir }, 'moved'));
    left.append(b);
  }
  const dup = el('button', { type: 'button', className: 'studio-btn', textContent: 'Duplicate' });
  dup.addEventListener('click', async () => {
    const tab = current.tab;
    keep({ selectNew: blocksOnPage().map((b) => b.dataset.blockId), tab });
    try {
      const r = await send('duplicate', { id: current.id });
      toast('duplicated');
      if (r?.id) keep({ select: r.id, tab });
    } catch (error) { toast(error.message, true); }
  });
  left.append(dup);
  const copy = el('button', { type: 'button', className: 'studio-btn', textContent: 'Copy', title: 'Copy this section to paste on any page (⌘C with the section selected)' });
  copy.addEventListener('click', copyCurrent);
  left.append(copy);
  const del = el('button', { type: 'button', className: 'studio-btn studio-danger', textContent: 'Delete' });
  del.addEventListener('click', async () => {
    if (!confirm(`Delete this ${TYPE_NAME[type] ?? 'section'} section? Undo (⌘Z) brings it back.`)) return;
    try { await send('remove', { id: current.id }); toast('section deleted'); } catch (error) { toast(error.message, true); }
  });
  footer.append(left, del);

  panel.append(header, el('div', { className: 'studio-block-live' }, live), tabs, body, footer);
  panel.hidden = false;
}

// -- wiring ---------------------------------------------------------------------------

for (const blockEl of blocksOnPage()) {
  const chip = el('button', { type: 'button', className: 'studio-block-chip', title: 'Edit this section' });
  chip.innerHTML = `${svg('sliders')}<span>${TYPE_NAME[blockEl.dataset.blockType] ?? 'Section'}</span>`;
  chip.addEventListener('click', (e) => { e.stopPropagation(); select(blockEl); });
  blockEl.append(chip);
  blockEl.addEventListener('click', (e) => {
    // Text mode and links keep their own clicks; the photo crop too.
    if (document.body.classList.contains('studio-text-mode') || document.body.classList.contains('studio-layout-mode')) return;
    if (e.target.closest('a, button, summary, input, textarea, .studio-tools, .studio-insert')) return;
    if (current?.el === blockEl) return;
    select(blockEl);
  });
}

// Built-in home sections: a show / hide switch. A hidden section still
// renders here, dimmed, so it can be switched back on.
for (const sec of document.querySelectorAll('[data-hidden-section]')) {
  const [state0, path] = sec.dataset.hiddenSection.split(':');
  const off = state0 === 'off';
  const NAMES2 = { 'showcase.show': 'Collage', 'projectsSection.show': 'Projects', 'experienceSection.show': 'Experience', 'aboutSection.show': 'About', 'contactSection.show': 'Contact', 'interestsSection.show': "What I'm into" };
  sec.classList.toggle('studio-section-off', off);
  const chip = el('button', { type: 'button', className: 'studio-block-chip studio-vis-chip', title: off ? 'Show this section on the site' : 'Hide this section from the site' });
  chip.innerHTML = `${svg('eye')}<span>${NAMES2[path] ?? 'Section'} · ${off ? 'Hidden' : 'Visible'}</span>`;
  chip.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await post('/home/patch', { path, value: off });
      toast(`${NAMES2[path] ?? 'Section'} ${off ? 'shown' : 'hidden'}`);
    } catch (error) { toast(error.message, true); }
  });
  if (getComputedStyle(sec).position === 'static') sec.style.position = 'relative';
  sec.append(chip);
}

// Project pages: drag a block photo to reframe it, ⌥-scroll to zoom. (The
// home page already gets this from home.js, which handles every home photo.)
if (scope === 'project') {
  for (const slot of document.querySelectorAll('[data-block-id] [data-field*=":blocks."]')) {
    const m = slot.dataset.field.match(/^project:blocks\.(\d+)\.((?:items\.\d+\.)?)image$/);
    const media = slot.querySelector('img');
    if (!m || !media) continue;
    const [, bi, itemPrefix] = m;
    const blockEl = slot.closest('[data-block-id]');
    const host = slot.style.getPropertyValue('--focal') ? slot : slot.closest('[style*="--focal"]') ?? slot;
    const read = () => {
      const cs = getComputedStyle(host);
      const f = (cs.getPropertyValue('--focal') || '50% 50%').match(/(-?[\d.]+)%\s+(-?[\d.]+)%/);
      return { x: f ? parseFloat(f[1]) : 50, y: f ? parseFloat(f[2]) : 50, z: parseFloat(cs.getPropertyValue('--zoom')) || 1 };
    };
    let { x, y, z } = read();
    const show = () => { host.style.setProperty('--focal', `${x}% ${y}%`); host.style.setProperty('--zoom', String(z)); };
    const saveCrop = async (patch) => {
      try { await post('/blocks', { scope, op: 'patch', id: blockEl.dataset.blockId, patch }, { quiet: true }); }
      catch (error) { toast(error.message, true); }
    };
    slot.classList.add('studio-block-crop');
    let drag = null;
    media.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || document.body.classList.contains('studio-text-mode')) return;
      e.preventDefault();
      drag = { moved: false };
      try { media.setPointerCapture(e.pointerId); } catch { /* fine */ }
    });
    media.addEventListener('pointermove', (e) => {
      if (!drag) return;
      drag.moved = true;
      const r = media.getBoundingClientRect();
      x = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
      y = Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)));
      show();
    });
    const end = () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      if (moved) { saveCrop({ [`${itemPrefix}focal`]: `${x}% ${y}%` }); toast(`framing → ${x}% ${y}%`); }
    };
    media.addEventListener('pointerup', end);
    media.addEventListener('pointercancel', end);
    let zoomTimer = 0;
    media.addEventListener('wheel', (e) => {
      if (!e.altKey && !e.ctrlKey) return;
      e.preventDefault();
      z = Math.min(4, Math.max(1, z * Math.exp(-e.deltaY / 400)));
      show();
      clearTimeout(zoomTimer);
      zoomTimer = setTimeout(() => saveCrop({ [`${itemPrefix}zoom`]: z > 1.001 ? Number(z.toFixed(2)) : null }), 400);
    }, { passive: false });
    // Clicks on a framed photo shouldn't open the lightbox while editing.
    media.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); }, true);
  }
}

// Drop a photo file straight onto a section's photo spot (filled or empty).
// Home photos that home.js already manages keep its handler instead.
for (const spot of document.querySelectorAll('[data-block-id] [data-field]')) {
  const m = spot.dataset.field.match(/^(home|project):(blocks\.\d+\.(?:items\.\d+\.)?image)$/);
  if (!m || spot.classList.contains('studio-slot')) continue;
  const path = m[2];
  const isFile = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  spot.addEventListener('dragover', (e) => { if (!isFile(e)) return; e.preventDefault(); e.stopPropagation(); spot.classList.add('studio-drop-over'); });
  spot.addEventListener('dragleave', () => spot.classList.remove('studio-drop-over'));
  spot.addEventListener('drop', async (e) => {
    if (!isFile(e)) return;
    e.preventDefault();
    e.stopPropagation();
    spot.classList.remove('studio-drop-over');
    const f = e.dataTransfer.files[0];
    if (!f) return;
    toast(`adding ${f.name}…`);
    const blockEl = spot.closest('[data-block-id]');
    if (current?.el === blockEl) keep({ select: current.id, tab: current.tab, scrollTop: panel.querySelector('.studio-ins-body')?.scrollTop ?? 0 });
    try {
      await post('/media', { target: { kind: 'block', scope, path }, filename: f.name, data: await readAsBase64(f) });
      toast(`${f.name} added`);
    } catch (error) { toast(error.message, true); }
  });
}

// Shortcuts while a section is selected (and you're not typing).
window.addEventListener('keydown', (e) => {
  if (!current || e.target.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); e.stopImmediatePropagation(); panel.querySelector('footer .studio-btn:not(.studio-tool-icon)')?.click(); }
  else if (mod && e.key.toLowerCase() === 'c' && !String(window.getSelection())) { e.preventDefault(); copyCurrent(); }
  else if ((e.key === 'Backspace' || e.key === 'Delete') && !mod) { e.preventDefault(); e.stopImmediatePropagation(); panel.querySelector('footer .studio-danger')?.click(); }
  else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); run('move', { dir: e.key === 'ArrowUp' ? -1 : 1 }, 'moved'); }
}, true);

placeInserters();
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!picker.hidden) { closePicker(); e.stopPropagation(); return; }
  if (current && !e.target.closest('input, textarea, select')) deselect();
}, true);

// Reopen after the reload a save causes.
const kept = readKeep();
if (kept && !kept.select && Array.isArray(kept.selectNew)) {
  const fresh = blocksOnPage().find((b) => !kept.selectNew.includes(b.dataset.blockId));
  if (fresh) kept.select = fresh.dataset.blockId;
}
if (kept?.select) {
  const target = document.querySelector(`[data-block-id="${CSS.escape(kept.select)}"]`);
  if (target) {
    window.__studioSelectionHandled = true;
    if (!kept.scrollTop && !kept.focus) target.scrollIntoView({ block: 'center', behavior: 'instant' });
    select(target, { tab: kept.tab ?? 'content', focus: kept.focus, scrollTop: kept.scrollTop ?? 0 });
  }
}

// First visit after this feature landed: point at it once.
try {
  if (!localStorage.getItem('studio:blocks-intro')) {
    localStorage.setItem('studio:blocks-intro', '1');
    setTimeout(() => toast(scope === 'home'
      ? 'New: hover between sections for "+ Add section", click any added section to edit it. Layout (L) for spacing.'
      : 'New: "+ Add section" at the end of each heading adds cards, stats, galleries, video and more.'), 1200);
  }
} catch { /* storage blocked: skip the tip */ }

export const openSectionPicker = openPicker;
