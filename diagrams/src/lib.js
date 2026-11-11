/**
 * Drawing kit for the project diagram decks.
 *
 * Every primitive emits NATIVE PowerPoint shapes — rectangles, lines with
 * arrowheads, freeforms, text boxes — never images. That is what keeps the
 * decks editable after import into Google Slides or Canva: each label is a
 * text box, each arrow a line you can drag.
 *
 * Canvas is 10 x 6.25 in (16:10). Export at 1600 px wide and it lands at the
 * 1600 x 1000 the site's figures were planned around.
 *
 * Style: white card, slate ink, one warm accent for "the part I designed".
 * The site is dark; these sit on it as light cards, so they never glare.
 */
const pptxgen = require('pptxgenjs');

const W = 10;
const H = 6.25;

const C = {
  ink: '1E293B',
  slate: '334155',
  muted: '64748B',
  faint: '94A3B8',
  line: 'CBD5E1',
  fill: 'F1F5F9',
  fill2: 'E2E8F0',
  white: 'FFFFFF',
  accent: 'C2410C', // "what I designed" — used sparingly
  accentTint: 'FFEDD5',
  lox: '1D4ED8',
  loxTint: 'DBEAFE',
  kero: 'B45309',
  keroTint: 'FEF3C7',
  gas: '475569',
  ok: '15803D',
  okTint: 'DCFCE7',
  bad: 'B91C1C',
  badTint: 'FEE2E2',
  steel: '94A3B8',
  water: '0EA5E9',
  waterTint: 'E0F2FE',
};

const FONT = 'Arial';

const newDeck = (title) => {
  const pres = new pptxgen();
  pres.defineLayout({ name: 'CARD_16x10', width: W, height: H });
  pres.layout = 'CARD_16x10';
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
  pres.author = 'Ryan Strawbridge';
  pres.title = title;
  return pres;
};

const slideOf = (pres, notes) => {
  const s = pres.addSlide();
  s.background = { color: C.white };
  if (notes) s.addNotes(notes);
  return s;
};

/** Text box. Margins zeroed so text aligns with the shapes around it. */
const text = (s, str, x, y, w, h, o = {}) =>
  s.addText(str, {
    x, y, w, h,
    isTextBox: true,
    margin: 0,
    fontFace: FONT,
    fontSize: o.size ?? 14,
    color: o.color ?? C.ink,
    bold: o.bold ?? false,
    italic: o.italic ?? false,
    align: o.align ?? 'left',
    valign: o.valign ?? 'top',
    lineSpacingMultiple: o.lineSpacing ?? 1.1,
    charSpacing: o.charSpacing,
    rotate: o.rotate,
    objectName: o.name,
    fit: 'none',
  });

/** Small uppercase label, the "eyebrow" used for zone names. */
const label = (s, str, x, y, w, o = {}) =>
  text(s, str.toUpperCase(), x, y, w, 0.25, {
    size: o.size ?? 10, bold: true, color: o.color ?? C.muted, charSpacing: 1.5, align: o.align,
  });

/**
 * Rectangle, optionally rounded, optionally labelled.
 *
 * A label is written INTO the shape, not as a text box on top of it. One
 * object per box is what makes the decks easy to edit in Google Slides: drag
 * the box and its words come with it, double-click to retype.
 */
const box = (s, x, y, w, h, o = {}) => {
  const shape = o.radius ? 'roundRect' : 'rect';
  const geom = {
    x, y, w, h,
    shape,
    fill: { color: o.fill ?? C.fill },
    line: o.noLine ? { type: 'none' } : { color: o.line ?? C.line, width: o.lineWidth ?? 1, dashType: o.dash },
    rectRadius: o.radius,
    objectName: o.name,
  };
  if (o.label === undefined) {
    const { shape: kind, ...rest } = geom;
    s.addShape(kind, rest);
    return;
  }
  const pad = (o.pad ?? 0.08) * 72; // points
  s.addText(o.label, {
    ...geom,
    margin: [0, pad, 0, pad],
    fontFace: FONT,
    fontSize: o.size ?? 13, bold: o.bold ?? false, color: o.color ?? C.ink,
    align: o.align ?? 'center', valign: o.valign ?? 'middle',
    lineSpacingMultiple: 1.05, fit: 'none',
  });
};

/**
 * Straight line from (x1,y1) to (x2,y2). pptxgenjs draws lines inside a
 * bounding box, so direction is expressed with flips.
 */
const line = (s, x1, y1, x2, y2, o = {}) => {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.max(Math.abs(x2 - x1), 0.0001);
  const h = Math.max(Math.abs(y2 - y1), 0.0001);
  s.addShape('line', {
    x, y, w, h,
    flipH: x2 < x1,
    flipV: y2 < y1,
    line: {
      color: o.color ?? C.slate,
      width: o.width ?? 1.5,
      dashType: o.dash,
      beginArrowType: o.start ?? 'none',
      endArrowType: o.end ?? 'none',
    },
    objectName: o.name,
  });
};

const arrow = (s, x1, y1, x2, y2, o = {}) => line(s, x1, y1, x2, y2, { end: 'triangle', ...o });

/** Polyline through points, each segment its own line so it stays editable. */
const path = (s, pts, o = {}) => {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const last = i === pts.length - 2;
    line(s, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], {
      ...o,
      end: last ? o.end ?? 'none' : 'none',
      start: i === 0 ? o.start ?? 'none' : 'none',
    });
  }
};

/**
 * Freeform shape from absolute points. Used where a native preset can't make
 * the shape (bowtie valve, cable bends, cross-sections).
 */
const freeform = (s, pts, o = {}) => {
  const xs = pts.filter((p) => p.x !== undefined).map((p) => p.x);
  const ys = pts.filter((p) => p.y !== undefined).map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(Math.max(...xs) - x0, 0.01);
  const h = Math.max(Math.max(...ys) - y0, 0.01);
  const rel = pts.map((p) => {
    if (p.close) return { close: true };
    const q = { x: p.x - x0, y: p.y - y0 };
    if (p.moveTo) q.moveTo = true;
    if (p.curve) {
      q.curve = { ...p.curve };
      for (const k of ['x1', 'x2', 'y1', 'y2']) {
        if (q.curve[k] !== undefined) q.curve[k] -= k.startsWith('x') ? x0 : y0;
      }
    }
    return q;
  });
  s.addShape('custGeom', {
    x: x0, y: y0, w, h,
    points: rel,
    fill: o.fill ? { color: o.fill, transparency: o.transparency } : { type: 'none' },
    line: o.noLine ? { type: 'none' } : { color: o.line ?? C.slate, width: o.width ?? 1.5, dashType: o.dash },
    objectName: o.name,
  });
};

const circle = (s, cx, cy, r, o = {}) => {
  const geom = {
    x: cx - r, y: cy - r, w: 2 * r, h: 2 * r,
    fill: { color: o.fill ?? C.white },
    line: o.noLine ? { type: 'none' } : { color: o.line ?? C.slate, width: o.width ?? 1.25 },
    objectName: o.name,
  };
  if (o.label === undefined) {
    s.addShape('ellipse', geom);
    return;
  }
  // Same rule as box(): the number lives inside the circle, one object.
  s.addText(o.label, {
    ...geom, shape: 'ellipse', margin: 0, fontFace: FONT, fontSize: o.size ?? 10,
    bold: o.bold ?? true, color: o.color ?? C.ink, align: 'center', valign: 'middle', fit: 'none',
  });
};

/** Numbered marker, matching the callout dots on the site. */
const marker = (s, cx, cy, n, o = {}) =>
  circle(s, cx, cy, o.r ?? 0.16, {
    fill: o.fill ?? C.accent, noLine: true, label: String(n), color: C.white, size: o.size ?? 11,
  });

// --- P&ID symbols ---------------------------------------------------------

/** Two-way valve: a bowtie centred on (cx, cy), flow left-right. */
const valve = (s, cx, cy, o = {}) => {
  const w = o.w ?? 0.44;
  const h = o.h ?? 0.3;
  const x = cx - w / 2;
  const y = cy - h / 2;
  freeform(s, [
    { x, y, moveTo: true }, { x: x + w, y: y + h }, { x: x + w, y }, { x, y: y + h }, { close: true },
  ], { fill: o.fill ?? C.white, line: o.color ?? C.slate, width: 1.5, name: o.name });
  if (o.actuator === 'servo' || o.actuator === 'solenoid' || o.actuator === 'manual') {
    line(s, cx, cy, cx, cy - h / 2 - 0.16, { color: o.color ?? C.slate, width: 1.25 });
    if (o.actuator === 'servo') {
      box(s, cx - 0.26, cy - h / 2 - 0.4, 0.52, 0.24, {
        fill: o.actFill ?? C.white, line: o.color ?? C.slate, label: 'Servo', size: 8, bold: true,
      });
    } else if (o.actuator === 'solenoid') {
      box(s, cx - 0.14, cy - h / 2 - 0.42, 0.28, 0.26, { fill: C.white, line: o.color ?? C.slate });
      line(s, cx - 0.1, cy - h / 2 - 0.2, cx + 0.1, cy - h / 2 - 0.38, { color: o.color ?? C.slate, width: 1 });
    }
  }
};

/** Check valve: triangle pointing in the allowed flow direction, with a seat bar. */
const checkValve = (s, cx, cy, dir = 'right', o = {}) => {
  const a = 0.15;
  const col = o.color ?? C.slate;
  if (dir === 'right') {
    freeform(s, [{ x: cx - a, y: cy - a, moveTo: true }, { x: cx + a, y: cy }, { x: cx - a, y: cy + a }, { close: true }], { fill: col, line: col, width: 1 });
    line(s, cx + a, cy - a, cx + a, cy + a, { color: col, width: 2 });
  } else if (dir === 'down') {
    freeform(s, [{ x: cx - a, y: cy - a, moveTo: true }, { x: cx + a, y: cy - a }, { x: cx, y: cy + a }, { close: true }], { fill: col, line: col, width: 1 });
    line(s, cx - a, cy + a, cx + a, cy + a, { color: col, width: 2 });
  } else if (dir === 'up') {
    freeform(s, [{ x: cx - a, y: cy + a, moveTo: true }, { x: cx + a, y: cy + a }, { x: cx, y: cy - a }, { close: true }], { fill: col, line: col, width: 1 });
    line(s, cx - a, cy - a, cx + a, cy - a, { color: col, width: 2 });
  }
};

/** Horizontal pressure vessel: a capsule. */
const tank = (s, x, y, w, h, o = {}) => {
  box(s, x, y, w, h, {
    radius: 0.5, fill: o.fill ?? C.white, line: o.color ?? C.slate, lineWidth: 1.75,
    label: o.label, size: o.size ?? 12, bold: true, color: o.textColor ?? C.ink,
  });
};

/** Instrument bubble (PI, TC) on a short stem. */
const instrument = (s, cx, cy, tag, o = {}) => {
  line(s, cx, cy + 0.17, cx, cy + (o.stem ?? 0.32), { color: C.muted, width: 1 });
  circle(s, cx, cy, 0.17, { label: tag, size: 8, line: C.muted });
};

// --- dimensioning ------------------------------------------------------

/** Dimension line with arrowheads both ends and a centred value. */
const dim = (s, x1, y1, x2, y2, value, o = {}) => {
  line(s, x1, y1, x2, y2, { color: o.color ?? C.muted, width: 1, start: 'triangle', end: 'triangle' });
  const horiz = Math.abs(y2 - y1) < Math.abs(x2 - x1);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  if (horiz) {
    text(s, value, mx - 1, my - (o.below ? -0.06 : 0.3), 2, 0.24, { size: o.size ?? 11, color: o.color ?? C.muted, align: 'center', bold: o.bold });
  } else {
    text(s, value, mx + (o.left ? -1.58 : 0.08), my - 0.12, 1.5, 0.24, { size: o.size ?? 11, color: o.color ?? C.muted, align: o.left ? 'right' : 'left', bold: o.bold });
  }
};

/** Tick-mark extension line for dimensions. */
const ext = (s, x1, y1, x2, y2) => line(s, x1, y1, x2, y2, { color: C.faint, width: 0.75 });

// --- read-me slide ------------------------------------------------------

/**
 * First slide of every deck: where each fact came from and what still needs
 * Ryan's eye. Not for export — delete or skip it.
 */
const readMe = (pres, { project, slides, sources, checks }) => {
  const s = slideOf(pres);
  s.background = { color: C.fill };
  label(s, 'Read me — not for export', 0.5, 0.42, 6, { color: C.accent });
  text(s, project, 0.5, 0.7, 9, 0.5, { size: 26, bold: true });
  text(s, 'Diagrams', 0.5, 1.4, 4.2, 0.3, { size: 12, bold: true, color: C.slate });
  text(s, slides.map((t, i) => ({ text: `${i + 2}. ${t}`, options: { breakLine: i < slides.length - 1 } })), 0.5, 1.72, 4.3, 2.0, { size: 11, color: C.ink, lineSpacing: 1.25 });
  text(s, 'Sources', 0.5, 3.9, 4.2, 0.3, { size: 12, bold: true, color: C.slate });
  text(s, sources.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < sources.length - 1 } })), 0.5, 4.2, 4.3, 1.6, { size: 10, color: C.muted, lineSpacing: 1.2 });
  box(s, 5.2, 1.4, 4.3, 4.4, { fill: C.white, line: C.line, radius: 0.04 });
  text(s, 'Check before publishing', 5.45, 1.6, 3.8, 0.3, { size: 12, bold: true, color: C.accent });
  text(s, checks.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < checks.length - 1 } })), 5.45, 1.95, 3.85, 3.7, { size: 10.5, color: C.ink, lineSpacing: 1.2 });
  return s;
};

const write = async (pres, file) => {
  await pres.writeFile({ fileName: file });
  return file;
};

module.exports = {
  W, H, C, FONT,
  newDeck, slideOf, text, label, box, line, arrow, path, freeform, circle, marker,
  valve, checkValve, tank, instrument, dim, ext, readMe, write,
};
