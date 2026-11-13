// Studio overlay: Layout mode. Canva-style handles on the home page.
//
//   - padding bands at the top and bottom of every section: drag the inner
//     edge to change the spacing
//   - gap bands between cards in a list or grid: drag to change the gap
//   - a split bar between experience text and video: drag to change the ratio
//   - a grip on each section: drag to reorder the page
//
// Everything snaps to an 8 px grid (hold Shift for 1 px), shows its value as
// you drag, and draws the 12-column grid while layout mode is on. Values are
// desktop px in home.json "layout"; phones get two thirds (--space-scale), so
// the page still reflows. Double-click any band to reset it.
import { root, MODE, post, toast } from './core.js';

const btn = root.querySelector('.studio-layout');
const SNAP = 8;
const SPLITS = [100 / 3, 40, 50, 60, 200 / 3];
const NAMES = { hero: 'Top', showcase: 'Collage', projects: 'Projects', experience: 'Experience', about: 'About', contact: 'Contact' };

const nameOf = (key) => NAMES[key] ?? document.querySelector(`[data-layout="${key}"]`)?.dataset.layoutName ?? 'Section';

let on = false;
let layer = null;
let grid = null;
let tip = null;
let dragging = false;

if (MODE !== 'home') btn?.remove();

const scale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-scale')) || 1;
const snap = (v, free) => Math.max(0, free ? Math.round(v) : Math.round(v / SNAP) * SNAP);
const docRect = (el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height, right: r.right + scrollX, bottom: r.bottom + scrollY };
};
const desktopPx = (cssPx) => Math.round(cssPx / scale());
const save = async (patch, quiet = true) => {
  try {
    await post('/home/layout', { patch }, { quiet });
  } catch (error) { toast(error.message, true); }
};

const showTip = (text, x, y) => {
  tip.textContent = text;
  tip.style.left = `${x + 14}px`;
  tip.style.top = `${y + 14}px`;
  tip.hidden = false;
};

const box = (cls, r, title) => {
  const el = document.createElement('div');
  el.className = `studio-lay ${cls}`;
  Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  if (title) el.title = title;
  layer.appendChild(el);
  return el;
};

/**
 * A drag that reports movement along one axis. `onMove(delta, event)` while
 * dragging; `onEnd(moved)` once. Grid goes bold while it runs.
 */
const drag = (el, axis, { onStart, onMove, onEnd }) => {
  el.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start = axis === 'x' ? event.clientX : event.clientY;
    let moved = false;
    dragging = true;
    document.body.classList.add('studio-lay-dragging');
    onStart?.();
    try { el.setPointerCapture(event.pointerId); } catch {}
    const move = (e) => {
      moved = true;
      onMove((axis === 'x' ? e.clientX : e.clientY) - start, e);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      dragging = false;
      document.body.classList.remove('studio-lay-dragging');
      tip.hidden = true;
      onEnd?.(moved);
      build();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
};

// -- section padding ---------------------------------------------------------

const paddingBands = (section) => {
  const key = section.dataset.layout;
  const r = docRect(section);
  const cs = getComputedStyle(section);
  for (const side of ['Top', 'Bottom']) {
    const pad = parseFloat(cs[`padding${side}`]) || 0;
    const band = box(`studio-lay-pad is-${side.toLowerCase()}`, {
      left: r.left, width: r.width,
      top: side === 'Top' ? r.top : r.bottom - Math.max(pad, 6),
      height: Math.max(pad, 6),
    }, `${nameOf(key)} ${side.toLowerCase()} spacing: drag the edge, double-click to reset`);
    const label = document.createElement('span');
    label.className = 'studio-lay-label';
    label.textContent = `${desktopPx(pad)}`;
    band.appendChild(label);
    const edge = document.createElement('div');
    edge.className = 'studio-lay-edge is-y';
    band.appendChild(edge);

    let startPx = 0;
    let value = desktopPx(pad);
    drag(edge, 'y', {
      onStart: () => { startPx = desktopPx(parseFloat(getComputedStyle(section)[`padding${side}`]) || 0); },
      onMove: (d, e) => {
        // Top band: dragging its lower edge down grows it. Bottom band: its
        // upper edge, so dragging up grows it.
        value = snap(startPx + (side === 'Top' ? d : -d) / scale(), e.shiftKey);
        section.style[`padding${side}`] = `calc(${value}px * var(--space-scale, 1))`;
        showTip(`${nameOf(key)} ${side.toLowerCase()} · ${value} px`, e.clientX, e.clientY);
      },
      onEnd: (moved) => { if (moved) save({ [`sections.${key}.pad${side}`]: value }); },
    });
    band.addEventListener('dblclick', () => {
      section.style[`padding${side}`] = '';
      save({ [`sections.${key}.pad${side}`]: null });
      build();
      toast(`${nameOf(key)} ${side.toLowerCase()} spacing reset`);
    });
  }
};

// -- gaps between cards ------------------------------------------------------

const gapBands = (list) => {
  const key = list.dataset.gap;
  const kids = [...list.children].filter((c) => c.offsetParent !== null);
  const rects = kids.map(docRect);
  const gap = desktopPx(parseFloat(getComputedStyle(list).rowGap) || 0);
  const bands = [];
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      const sameRow = Math.abs(a.top - b.top) < 4 && b.left >= a.right - 1;
      const sameCol = Math.abs(a.left - b.left) < 4 && b.top >= a.bottom - 1;
      if (sameRow && j === i + 1) bands.push({ axis: 'x', r: { left: a.right, width: Math.max(b.left - a.right, 6), top: Math.min(a.top, b.top), height: Math.max(a.height, b.height) } });
      else if (sameCol && !bands.some((x) => x.axis === 'y' && Math.abs(x.r.top - a.bottom) < 2 && Math.abs(x.r.left - a.left) < 2)) {
        bands.push({ axis: 'y', r: { left: a.left, width: a.width, top: a.bottom, height: Math.max(b.top - a.bottom, 6) } });
        break;
      }
    }
  }
  for (const { axis, r } of bands) {
    const band = box(`studio-lay-gap is-${axis}`, r, 'Gap: drag, double-click to reset');
    const label = document.createElement('span');
    label.className = 'studio-lay-label';
    label.textContent = `${gap}`;
    band.appendChild(label);
    let value = gap;
    drag(band, axis, {
      onMove: (d, e) => {
        value = snap(gap + (axis === 'x' ? d : d) / scale(), e.shiftKey);
        list.style.gap = `calc(${value}px * var(--space-scale, 1))`;
        showTip(`gap · ${value} px`, e.clientX, e.clientY);
      },
      onEnd: (moved) => { if (moved) save({ [`${key}.gap`]: value }); },
    });
    band.addEventListener('dblclick', () => {
      list.style.gap = '';
      save({ [`${key}.gap`]: null });
      build();
      toast('gap reset');
    });
  }
};

// Space above the interests block (it sits inside the about section).
const topBand = (el) => {
  const key = el.dataset.layoutTop;
  const mt = parseFloat(getComputedStyle(el).marginTop) || 0;
  const r = docRect(el);
  const band = box('studio-lay-pad is-top', { left: r.left, width: r.width, top: r.top - mt, height: Math.max(mt, 6) }, 'Space above: drag the edge, double-click to reset');
  const label = document.createElement('span');
  label.className = 'studio-lay-label';
  label.textContent = `${desktopPx(mt)}`;
  band.appendChild(label);
  const edge = document.createElement('div');
  edge.className = 'studio-lay-edge is-y';
  band.appendChild(edge);
  const start = desktopPx(mt);
  let value = start;
  drag(edge, 'y', {
    onMove: (d, e) => {
      value = snap(start + d / scale(), e.shiftKey);
      el.style.marginTop = `calc(${value}px * var(--space-scale, 1))`;
      showTip(`space above · ${value} px`, e.clientX, e.clientY);
    },
    onEnd: (moved) => { if (moved) save({ [`${key}.top`]: value }); },
  });
  band.addEventListener('dblclick', () => { el.style.marginTop = ''; save({ [`${key}.top`]: null }); build(); });
};

// -- experience split ----------------------------------------------------------

const splitBars = () => {
  const section = document.querySelector('[data-layout="experience"]');
  if (!section) return;
  for (const card of section.querySelectorAll('.experience-card.has-banner')) {
    const text = card.querySelector('.experience-text');
    const banner = card.querySelector('.experience-banner');
    const t = docRect(text);
    const b = docRect(banner);
    if (Math.abs(t.top - b.top) > t.height) continue; // stacked (phone width)
    const c = docRect(card);
    const bar = box('studio-lay-split', { left: t.right, width: Math.max(b.left - t.right, 10), top: c.top, height: c.height }, 'Text / video split: drag, double-click for half and half');
    const gapPx = b.left - t.right;
    let value = 50;
    const guides = [];
    drag(bar, 'x', {
      onStart: () => {
        for (const s of SPLITS) {
          const g = box('studio-lay-guide', { left: c.left + ((c.width - gapPx) * s) / 100 + gapPx / 2, width: 1, top: c.top, height: c.height });
          guides.push(g);
        }
      },
      onMove: (d, e) => {
        const x = t.right + gapPx / 2 + d - c.left;
        let pct = ((x - gapPx / 2) / (c.width - gapPx)) * 100;
        const near = SPLITS.find((s) => Math.abs(s - pct) < 2.5);
        if (near && !e.shiftKey) pct = near;
        value = Math.round(Math.min(75, Math.max(25, pct)));
        section.style.setProperty('--exp-a', `${value}fr`);
        section.style.setProperty('--exp-b', `${100 - value}fr`);
        guides.forEach((g, i) => g.classList.toggle('is-hit', Math.abs(SPLITS[i] - pct) < 0.5));
        showTip(`text ${value} / video ${100 - value}`, e.clientX, e.clientY);
      },
      onEnd: (moved) => { if (moved) save({ 'experience.split': value === 50 ? null : value }); },
    });
    bar.addEventListener('dblclick', () => {
      section.style.setProperty('--exp-a', '50fr');
      section.style.setProperty('--exp-b', '50fr');
      save({ 'experience.split': null });
      build();
      toast('split reset to half and half');
    });
  }
};

// -- section order -------------------------------------------------------------

const orderGrips = () => {
  const sections = [...document.querySelectorAll('[data-layout]')].sort((a, b) => docRect(a).top - docRect(b).top);
  const keys = sections.map((s) => s.dataset.layout);
  sections.forEach((section) => {
    const r = docRect(section);
    const grip = box('studio-lay-grip', { left: r.left + 8, top: r.top + 8, width: 'auto', height: 'auto' }, 'Drag to move this section');
    grip.style.width = '';
    grip.style.height = '';
    grip.textContent = `⠿ ${nameOf(section.dataset.layout)}`;
    let line = null;
    let target = 0;
    drag(grip, 'y', {
      onStart: () => { line = box('studio-lay-insert', { left: r.left, width: r.width, top: r.top, height: 3 }); },
      onMove: (d, e) => {
        const y = e.clientY + scrollY;
        const tops = sections.map((s) => docRect(s));
        target = tops.filter((t) => t.top + t.height / 2 < y).length;
        const at = target < tops.length ? tops[target].top : tops.at(-1).bottom;
        line.style.top = `${at - 1}px`;
        showTip(`move ${nameOf(section.dataset.layout)} here`, e.clientX, e.clientY);
      },
      onEnd: (moved) => {
        if (!moved) return;
        const from = keys.indexOf(section.dataset.layout);
        const next = keys.filter((k) => k !== section.dataset.layout);
        next.splice(target > from ? target - 1 : target, 0, section.dataset.layout);
        if (next.join() === keys.join()) return;
        // Sections the page hides (show: false) still need a place in the order.
        const all = ['hero', 'showcase', 'projects', 'experience', 'about', 'contact'];
        const full = [...next, ...all.filter((k) => !next.includes(k))];
        // Block keys come from the page; a draft that isn't rendered can't be lost
        // because every block renders in dev.
        save({ order: full }, false);
        toast('sections reordered');
      },
    });
  });
};

// -- grid overlay --------------------------------------------------------------

const placeGrid = () => {
  const c = document.querySelector('.home-flow .container');
  if (!c) return;
  const r = c.getBoundingClientRect();
  const cs = getComputedStyle(c);
  const left = r.left + parseFloat(cs.paddingLeft);
  const width = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  Object.assign(grid.style, { left: `${left}px`, width: `${width}px` });
};

// -- build / toggle --------------------------------------------------------------

function build() {
  if (!on || dragging) return;
  layer.replaceChildren();
  for (const s of document.querySelectorAll('[data-layout]')) paddingBands(s);
  for (const l of document.querySelectorAll('[data-gap]')) gapBands(l);
  for (const t of document.querySelectorAll('[data-layout-top]')) topBand(t);
  splitBars();
  orderGrips();
  layer.style.height = `${document.documentElement.scrollHeight}px`;
  placeGrid();
}

let pending = 0;
const rebuildSoon = () => { clearTimeout(pending); pending = setTimeout(build, 120); };

const setOn = (value) => {
  on = value;
  btn?.setAttribute('aria-pressed', String(on));
  document.body.classList.toggle('studio-layout-mode', on);
  if (on) {
    layer = document.createElement('div');
    layer.className = 'studio-lay-layer';
    grid = document.createElement('div');
    grid.className = 'studio-lay-grid';
    grid.innerHTML = '<span></span>'.repeat(12);
    tip = document.createElement('div');
    tip.className = 'studio-lay-tip';
    tip.hidden = true;
    document.body.append(layer, grid, tip);
    build();
    toast('layout mode: drag spacing, gaps, the split, or a section grip. Shift = 1 px, double-click resets.');
  } else {
    layer?.remove(); grid?.remove(); tip?.remove();
    layer = grid = tip = null;
    toast('layout mode off');
  }
};

if (MODE === 'home') {
  btn?.addEventListener('click', () => setOn(!on));
  window.addEventListener('resize', () => { if (on) { rebuildSoon(); placeGrid(); } });
  new ResizeObserver(() => { if (on) rebuildSoon(); }).observe(document.body);
  window.addEventListener('keydown', (event) => {
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')) return;
    if (event.key.toLowerCase() === 'l' && !event.metaKey && !event.ctrlKey && !event.altKey) setOn(!on);
    if (event.key === 'Escape' && on) setOn(false);
  });
  // Survive the reload a reorder or undo causes.
  try {
    if (sessionStorage.getItem('studio-layout-on') === '1') setOn(true);
    window.addEventListener('beforeunload', () => sessionStorage.setItem('studio-layout-on', on ? '1' : '0'));
  } catch { /* storage blocked: start off */ }
}
