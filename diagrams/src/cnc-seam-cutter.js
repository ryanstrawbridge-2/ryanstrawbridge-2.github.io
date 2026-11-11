const L = require('./lib');
const { C } = L;

/** GD&T position symbol drawn from shapes (Arial has no glyph for it). */
const posSymbol = (s, cx, cy, r = 0.08) => {
  L.circle(s, cx, cy, r, { fill: C.white, line: C.ink, width: 1 });
  L.line(s, cx - r * 1.6, cy, cx + r * 1.6, cy, { color: C.ink, width: 1 });
  L.line(s, cx, cy - r * 1.6, cx, cy + r * 1.6, { color: C.ink, width: 1 });
};
/** GD&T symmetry symbol: three bars, the middle one longer. */
const symSymbol = (s, cx, cy, w = 0.22) => {
  L.line(s, cx - w * 0.35, cy - 0.06, cx + w * 0.35, cy - 0.06, { color: C.ink, width: 1.25 });
  L.line(s, cx - w * 0.5, cy, cx + w * 0.5, cy, { color: C.ink, width: 1.25 });
  L.line(s, cx - w * 0.35, cy + 0.06, cx + w * 0.35, cy + 0.06, { color: C.ink, width: 1.25 });
};

/** Feature control frame: [symbol][tolerance][datums...]. */
const fcf = (s, x, y, kind, tol, datums) => {
  const h = 0.34;
  const cells = [0.42, 0.85, ...datums.map(() => 0.38)];
  let cx = x;
  cells.forEach((w, i) => {
    L.box(s, cx, y, w, h, { fill: C.white, line: C.ink, lineWidth: 1 });
    if (i === 0) {
      if (kind === 'pos') posSymbol(s, cx + w / 2, y + h / 2);
      else symSymbol(s, cx + w / 2, y + h / 2);
    } else if (i === 1) {
      L.text(s, tol, cx, y, w, h, { size: 11, align: 'center', valign: 'middle' });
    } else {
      L.text(s, datums[i - 2], cx, y, w, h, { size: 11, bold: true, align: 'center', valign: 'middle' });
    }
    cx += w;
  });
  return cx;
};

/** Datum feature symbol: boxed letter on a leader with a filled triangle. */
const datumTag = (s, x, y, letter, toX, toY) => {
  L.line(s, x + 0.15, y + 0.3, toX, toY, { color: C.ink, width: 1, end: 'triangle' });
  L.box(s, x, y, 0.3, 0.3, { fill: C.white, line: C.ink, lineWidth: 1, label: letter, size: 12, bold: true });
};

module.exports = async (out) => {
  const pres = L.newDeck('CNC Seam Cutter — diagrams');

  L.readMe(pres, {
    project: 'CNC Seam Cutter',
    slides: [
      'Prep time per assembly',
      'Eleven cable radii, one fixture',
      'Datum scheme (simplified)',
    ],
    sources: [
      'Project page',
      'Co-op final presentation, "CS Pre-Solder Tooling": curved jackets on CS, non-uniform cable radii, 11 unique radii in CS3, updated collets for test radii',
      'Your photos: slitting saw on the CNC spindle, cable in the fixture bar',
    ],
    checks: [
      'Your page contradicts itself on time: the Problem says the manual job took an entire shift, the Outcome says 2 hours to 30 minutes. Slide 2 uses the Outcome numbers.',
      'Page typo: "AMSE Y14.5" should be "ASME Y14.5".',
      'The deck calls this CS pre-solder tooling. The site calls it a CNC seam cutter for PF. Check which magnet it belongs to before publishing.',
      'Slide 3: radii are not to scale and carry no values, on purpose.',
      'Slide 4 is a generic datum scheme: dowel pins as datums B and C, position and symmetry controls. Tolerances read "t". It is not your drawing; adjust to match what you actually toleranced.',
    ],
  });

  // ---------------------------------------------------------------------
  // 2. Prep time
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Outcome numbers from the page: anticipated prep time per assembly from 2 hours to 30 minutes (75%). The Problem section says a full shift; reconcile before publishing.');
    const x0 = 2.4;
    const scale = 3.2; // in per hour
    const bar = (y, hrs, lab, val, col, fill) => {
      L.text(s, lab, 0.5, y, 1.8, 0.75, { size: 14, bold: true, color: col, valign: 'middle' });
      L.box(s, x0, y, hrs * scale, 0.75, { fill, noLine: true, radius: 0.08 });
      L.text(s, val, x0 + hrs * scale + 0.2, y, 2, 0.75, { size: 16, bold: true, color: col, valign: 'middle' });
    };
    bar(1.2, 2, 'Manual', '2 h', C.slate, C.fill2);
    bar(2.25, 0.5, 'CNC fixture', '30 min', C.accent, C.accent);
    L.text(s, 'per assembly, anticipated', x0, 3.15, 4, 0.3, { size: 11, color: C.muted, italic: true });
    L.box(s, 0.5, 3.95, 4.3, 1.6, { fill: C.fill, noLine: true, radius: 0.06 });
    L.text(s, 'Before', 0.75, 4.1, 3.8, 0.3, { size: 13, bold: true, color: C.slate });
    L.text(s, 'By hand. A skilled technician monitoring the cut the whole time.', 0.75, 4.42, 3.8, 0.9, { size: 12, color: C.slate });
    L.box(s, 5.2, 3.95, 4.3, 1.6, { fill: C.accentTint, noLine: true, radius: 0.06 });
    L.text(s, 'After', 5.45, 4.1, 3.8, 0.3, { size: 13, bold: true, color: C.accent });
    L.text(s, 'CNC cut on a fixture. Cut-to-cut variation down, operator error out.', 5.45, 4.42, 3.8, 0.9, { size: 12, color: C.slate });
  }

  // ---------------------------------------------------------------------
  // 3. Eleven radii
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'From the co-op deck: the cable jackets are curved, and the radii are not uniform - 11 unique radii in one coil. One modular fixture radially conforms to all eleven by swapping locators (the deck calls them collets). Arcs not to scale.');
    const ox = 0.7;
    const oy = 4.9;
    const lead = 0.6;
    L.line(s, ox, oy, ox + lead, oy, { color: C.slate, width: 3 });
    const radii = [1.6, 1.85, 2.1, 2.4, 2.75, 3.1, 3.5, 4.0, 4.6, 5.4, 6.4];
    const sweep = 3.4; // arc length kept equal, so tighter radii bend further
    radii.forEach((R, i) => {
      const th = sweep / R;
      const pts = [];
      const steps = 30;
      for (let k = 0; k <= steps; k += 1) {
        const a = (th * k) / steps;
        pts.push({ x: ox + lead + R * Math.sin(a), y: oy - R * (1 - Math.cos(a)) });
      }
      pts[0].moveTo = true;
      const hi = i === 4;
      L.freeform(s, pts, { line: hi ? C.accent : C.faint, width: hi ? 3.5 : 1.75 });
      const end = pts[pts.length - 1];
      if (i === 0 || i === 10 || hi) {
        L.text(s, `R${i + 1}`, end.x + 0.06, end.y - 0.14, 0.6, 0.25, { size: 11, bold: hi, color: hi ? C.accent : C.muted });
      }
    });
    L.text(s, 'Cable start', ox, oy + 0.12, 1.2, 0.25, { size: 10, color: C.muted });
    L.text(s, 'Not to scale', ox, 0.5, 2, 0.25, { size: 10, italic: true, color: C.faint });

    const kx = 6.2;
    L.text(s, '11', kx, 0.85, 3.3, 1.0, { size: 64, bold: true, color: C.accent });
    L.text(s, 'unique cable radii, one fixture', kx, 1.9, 3.3, 0.35, { size: 15, bold: true });
    L.text(s, [
      { text: 'Curved jackets, non-uniform radii.', options: { bullet: true, breakLine: true } },
      { text: 'Swap the locator, keep the datums.', options: { bullet: true, breakLine: true } },
      { text: 'Qualification testing ran ahead of the new production line.', options: { bullet: true } },
    ], kx, 2.5, 3.3, 2.0, { size: 12.5, color: C.slate, lineSpacing: 1.3 });
  }

  // ---------------------------------------------------------------------
  // 4. Datum scheme
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Generic, simplified datum scheme: primary datum A is the fixture face that seats on the machine; two dowel pins are datums B and C; the cable channel is controlled for symmetry to the pin datums, and the locator holes for position. Tolerances shown as t. Replace with your drawing\'s actual callouts.');
    // plan view of fixture plate
    const px = 0.8;
    const py = 1.2;
    const pw = 5.0;
    const ph = 3.4;
    L.box(s, px, py, pw, ph, { fill: C.fill, line: C.slate, lineWidth: 1.5, radius: 0.03 });
    // cable channel
    L.box(s, px, py + ph / 2 - 0.3, pw, 0.6, { fill: C.accentTint, line: C.accent, lineWidth: 1.5 });
    L.text(s, 'Cable channel', px + 0.2, py + ph / 2 - 0.27, 2, 0.22, { size: 11, bold: true, color: C.accent });
    // centreline
    L.line(s, px - 0.25, py + ph / 2, px + pw + 0.25, py + ph / 2, { color: C.accent, width: 0.75, dash: 'lgDashDot' });
    // dowel pins
    const pinB = [px + 0.6, py + 0.55];
    const pinC = [px + pw - 0.6, py + 0.55];
    L.circle(s, pinB[0], pinB[1], 0.13, { fill: C.slate, line: C.slate });
    L.circle(s, pinC[0], pinC[1], 0.13, { fill: C.slate, line: C.slate });
    // locator holes
    [[px + 1.6, py + ph - 0.55], [px + 3.4, py + ph - 0.55]].forEach(([hx, hy]) => L.circle(s, hx, hy, 0.12, { fill: C.white, line: C.slate }));
    // datum tags
    datumTag(s, pinB[0] - 0.55, py - 0.75, 'B', pinB[0] - 0.05, pinB[1] - 0.12);
    datumTag(s, pinC[0] + 0.25, py - 0.75, 'C', pinC[0] + 0.05, pinC[1] - 0.12);
    datumTag(s, px + pw + 0.35, py + ph - 0.3, 'A', px + pw, py + ph - 0.15);
    L.text(s, 'A = fixture face (seats on the machine)', px, py + ph + 0.25, 4.5, 0.25, { size: 10.5, color: C.muted });
    L.text(s, 'Dowel pins', px + pw / 2 - 1, py + 0.42, 2, 0.25, { size: 10.5, color: C.slate, align: 'center' });
    L.text(s, 'Locator holes', px + 1.85, py + ph - 0.68, 1.4, 0.25, { size: 10.5, color: C.slate, align: 'center' });

    // FCFs
    const fx = 6.35;
    L.label(s, 'Cable channel', fx, 1.3, 3);
    fcf(s, fx, 1.6, 'sym', 't', ['A', 'B', 'C']);
    L.text(s, 'Symmetry to the pin datums: the cut lands on the seam every time.', fx, 2.05, 3.1, 0.6, { size: 11, color: C.slate });
    L.label(s, 'Locator holes', fx, 2.95, 3);
    fcf(s, fx, 3.25, 'pos', '⌀ t', ['A', 'B', 'C']);
    L.text(s, 'Position to the same datums: swap a locator without re-indicating.', fx, 3.7, 3.1, 0.6, { size: 11, color: C.slate });
    L.text(s, 'ASME Y14.5. Simplified; tolerances shown as t.', fx, 4.7, 3.1, 0.5, { size: 9.5, italic: true, color: C.faint });
  }

  return L.write(pres, out);
};
