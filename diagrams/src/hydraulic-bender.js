const L = require('./lib');
const { C } = L;

/**
 * S-offset (joggle) centreline: two equal, tangent arcs of radius R, each
 * sweeping theta, joined to straight lead-in and lead-out. Returns points for
 * a freeform polyline. y grows downward on the slide, so "up" is negative.
 */
const sCurve = (x0, y0, lead, R, theta, steps = 24) => {
  const pts = [[x0, y0], [x0 + lead, y0]];
  // first arc: centre above the line, bending upward
  const c1x = x0 + lead;
  const c1y = y0 - R;
  for (let i = 1; i <= steps; i += 1) {
    const a = (theta * i) / steps;
    pts.push([c1x + R * Math.sin(a), c1y + R * Math.cos(a)]);
  }
  const [ex, ey] = pts[pts.length - 1];
  // second arc: centre below, bending back to horizontal
  const c2x = ex + R * Math.sin(theta);
  const c2y = ey - R * Math.cos(theta) + 2 * R * Math.cos(theta);
  // param from angle theta back to 0 around c2 (point is above-left of centre)
  for (let i = 1; i <= steps; i += 1) {
    const a = theta - (theta * i) / steps;
    pts.push([c2x - R * Math.sin(a), c2y - R * Math.cos(a)]);
  }
  const [fx, fy] = pts[pts.length - 1];
  pts.push([fx + lead, fy]);
  return pts;
};

const drawCable = (s, pts, o = {}) => {
  L.freeform(s, pts.map(([x, y], i) => (i === 0 ? { x, y, moveTo: true } : { x, y })), {
    line: o.color ?? C.slate, width: o.width ?? 7,
  });
};

module.exports = async (out) => {
  const pres = L.newDeck('Hydraulic Bender — diagrams');

  L.readMe(pres, {
    project: 'Hydraulic Bender',
    slides: [
      'Old plates vs new: one bend at a time vs both at once',
      'The offset geometry and spring-back',
      'How the press is laid out',
      'A full shift to a quarter',
    ],
    sources: [
      'Project page',
      'Your photos: the matched S-profile dies, two cylinders and the crane shackle (bender-01, bender-03, hero)',
    ],
    checks: [
      'Slide 3 shows the textbook relation for two equal tangent arcs: h = 2R(1 - cos θ), run = 2R sin θ, arc = 2Rθ. Your page says you derived your own generalizable equation. Swap yours in, or confirm this is it.',
      'Slide 3: whether the die over-bends angle, radius or both to beat spring-back is my reading. Confirm what your compensation actually adjusts.',
      'Slide 4 is schematic. Cylinder count and the shackle are from your photos. 44 kips is from your page.',
      'Slide 5: "a full shift" is not given in hours anywhere, so the bars are in shifts.',
    ],
  });

  // ---------------------------------------------------------------------
  // 2. One at a time vs both at once
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Problem: the old plates formed one bend at a time, came out short, needed several adjustments and relied on eyeballing. New: matched upper and lower dies cut to the full S-profile form both bends of the offset in a single press.');
    const panel = (x, good) => {
      L.box(s, x, 0.45, 4.3, 5.35, { fill: good ? C.accentTint : C.fill, line: good ? C.accent : C.fill, radius: 0.04 });
    };
    panel(0.4, false);
    panel(5.3, true);
    L.text(s, 'Old plates', 0.7, 0.65, 3.7, 0.4, { size: 20, bold: true });
    L.text(s, 'One bend per press', 0.7, 1.08, 3.7, 0.3, { size: 12, bold: true, color: C.muted });
    L.text(s, 'New dies', 5.6, 0.65, 3.7, 0.4, { size: 20, bold: true, color: C.accent });
    L.text(s, 'Both bends in one press', 5.6, 1.08, 3.7, 0.3, { size: 12, bold: true, color: C.accent });

    // old: step 1, step 2
    const steps = [
      { y: 2.0, t: '1  Form the first bend' },
      { y: 3.35, t: '2  Reposition, form the second' },
    ];
    steps.forEach(({ y, t }, i) => {
      L.text(s, t, 0.7, y - 0.45, 3.7, 0.3, { size: 12, color: C.slate });
      if (i === 0) {
        // one bend: straight then rising
        drawCable(s, [[0.8, y + 0.45], [2.0, y + 0.45], [2.35, y + 0.4], [2.6, y + 0.25], [2.85, y + 0.08], [3.2, y], [4.3, y]], { color: C.slate, width: 6 });
      } else {
        drawCable(s, sCurve(0.8, y + 0.5, 0.9, 0.45, 0.85), { color: C.slate, width: 6 });
      }
    });
    L.box(s, 0.7, 4.45, 3.7, 1.1, { fill: C.white, line: C.line, radius: 0.06 });
    L.text(s, [
      { text: 'Bends came out short', options: { bullet: true, breakLine: true } },
      { text: 'Several adjustments per part', options: { bullet: true, breakLine: true } },
      { text: 'Geometry checked by eye', options: { bullet: true } },
    ], 0.85, 4.55, 3.5, 0.95, { size: 11.5, color: C.bad, lineSpacing: 1.15 });

    // new: matched dies with cable between
    const dx = 5.75;
    const top = 2.0;
    const curve = sCurve(dx, top + 1.15, 0.75, 0.55, 0.9);
    // upper die block (accent) above curve, lower die below — drawn as outlines following the curve
    const upper = [{ x: dx, y: top, moveTo: true }, ...curve.map(([x, y]) => ({ x, y: y - 0.06 })), { x: curve[curve.length - 1][0], y: top }, { close: true }];
    L.freeform(s, upper, { fill: C.fill2, line: C.slate, width: 1.25 });
    const lower = [{ x: dx, y: top + 2.0, moveTo: true }, ...curve.map(([x, y]) => ({ x, y: y + 0.06 })), { x: curve[curve.length - 1][0], y: top + 2.0 }, { close: true }];
    L.freeform(s, lower, { fill: C.fill2, line: C.slate, width: 1.25 });
    drawCable(s, curve, { color: C.accent, width: 6 });
    L.arrow(s, dx + 1.7, top - 0.5, dx + 1.7, top - 0.05, { color: C.accent, width: 2.5 });
    L.text(s, 'Press', dx + 1.85, top - 0.48, 1, 0.25, { size: 11, bold: true, color: C.accent });
    L.text(s, 'Upper die', dx + 2.4, top + 0.12, 1.2, 0.25, { size: 10, color: C.slate });
    L.text(s, 'Lower die', dx + 0.1, top + 1.68, 1.2, 0.25, { size: 10, color: C.slate });
    L.box(s, 5.6, 4.45, 3.7, 1.1, { fill: C.white, line: C.line, radius: 0.06 });
    L.text(s, [
      { text: 'Both bends to spec on the first press', options: { bullet: true, breakLine: true } },
      { text: 'Profile set by the die, not the operator', options: { bullet: true } },
    ], 5.75, 4.6, 3.5, 0.9, { size: 11.5, color: C.ok, lineSpacing: 1.15 });
  }

  // ---------------------------------------------------------------------
  // 3. Offset geometry and spring-back
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Geometry of an S-offset built from two equal tangent arcs. This is the textbook relation; replace with the generalizable equation you derived if it differs. Spring-back: the cable relaxes toward straight when the die opens, so the die profile is cut tighter than the finished shape. Dashed = die profile, solid = cable after release.');
    const R = 1.35;
    const th = 0.95; // rad
    const x0 = 0.6;
    const y0 = 4.55;
    const lead = 0.65;
    const cable = sCurve(x0, y0, lead, R, th, 36);
    // die profile: tighter
    const die = sCurve(x0, y0, lead, R * 0.85, th * 1.12, 36);
    L.freeform(s, die.map(([x, y], i) => (i === 0 ? { x, y, moveTo: true } : { x, y })), { line: C.accent, width: 2, dash: 'dash' });
    drawCable(s, cable, { color: C.slate, width: 5 });

    const start = cable[1];
    const end = cable[cable.length - 2];
    const h = start[1] - end[1];
    // offset dimension
    L.ext(s, end[0], end[1], end[0] + 1.1, end[1]);
    L.ext(s, start[0] + 2 * R * Math.sin(th), start[1], end[0] + 1.1, start[1]);
    L.dim(s, end[0] + 0.95, end[1], end[0] + 0.95, start[1], 'h  offset');
    // run dimension
    L.ext(s, start[0], start[1], start[0], start[1] + 0.5);
    L.ext(s, end[0], end[1], end[0], start[1] + 0.5);
    L.dim(s, start[0], start[1] + 0.4, end[0], start[1] + 0.4, 'run', { below: true });
    // radius
    const c1x = start[0];
    const c1y = start[1] - R;
    L.circle(s, c1x, c1y, 0.04, { fill: C.muted, noLine: true });
    L.arrow(s, c1x, c1y, c1x + R * Math.sin(th / 2), c1y + R * Math.cos(th / 2), { color: C.muted, width: 1 });
    L.text(s, 'R', c1x + 0.12, c1y + 0.25, 0.3, 0.25, { size: 13, bold: true, color: C.muted });
    L.text(s, 'θ', c1x + 0.25, c1y + 0.72, 0.3, 0.25, { size: 13, bold: true, color: C.muted });

    // legend
    L.line(s, 0.7, 0.8, 1.15, 0.8, { color: C.slate, width: 5 });
    L.text(s, 'Cable after release', 1.3, 0.69, 2.5, 0.25, { size: 11, color: C.slate });
    L.line(s, 0.7, 1.15, 1.15, 1.15, { color: C.accent, width: 2, dash: 'dash' });
    L.text(s, 'Die profile, over-bent for spring-back', 1.3, 1.04, 3.5, 0.25, { size: 11, color: C.accent });

    // equations
    const ex = 6.2;
    L.label(s, 'Two tangent arcs', ex, 0.8, 3);
    const eq = (y, t) => L.box(s, ex, y, 3.3, 0.58, { fill: C.fill, noLine: true, radius: 0.08, label: t, size: 16, bold: true, align: 'left', pad: 0.2 });
    eq(1.12, 'h = 2R (1 − cos θ)');
    eq(1.82, 'run = 2R sin θ');
    eq(2.52, 'arc length = 2Rθ');
    L.text(s, 'Pick the offset and run the part needs, solve for R and θ, then over-bend the die by what the cable springs back.', ex, 3.3, 3.3, 1.0, { size: 11.5, color: C.slate, lineSpacing: 1.2 });
    L.text(s, 'Textbook form. Replace with your derived equation if it differs.', ex, 4.65, 3.3, 0.5, { size: 9.5, italic: true, color: C.faint });
  }

  // ---------------------------------------------------------------------
  // 4. Press layout
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Front view, schematic. From photos: two hydraulic cylinders drive the upper die; a shackle on the top plate takes the crane hook, so the tool is never lifted by hand. From the page: bolting and piston layout reconfigured, shear capacity raised to 44 kips.');
    const cx = 3.4;
    // crane hook + shackle
    L.line(s, cx, 0.35, cx, 0.75, { color: C.slate, width: 2 });
    L.circle(s, cx, 0.88, 0.13, { fill: C.white, line: C.slate, width: 2 });
    L.text(s, 'Crane', cx + 0.22, 0.38, 1, 0.25, { size: 11, bold: true, color: C.slate });
    // cylinders
    [-1.0, 1.0].forEach((dx) => {
      L.box(s, cx + dx - 0.32, 1.05, 0.64, 1.25, { fill: 'FDE68A', line: C.kero, lineWidth: 1.5, radius: 0.08 });
      L.box(s, cx + dx - 0.09, 2.3, 0.18, 0.35, { fill: C.steel, line: C.slate });
    });
    L.text(s, 'Hydraulic cylinders ×2', cx + 1.45, 1.45, 2.2, 0.3, { size: 12, bold: true, color: C.kero });
    // top plate
    L.box(s, cx - 1.7, 2.65, 3.4, 0.28, { fill: C.fill2, line: C.slate });
    // upper die
    L.box(s, cx - 1.45, 2.93, 2.9, 0.75, { fill: C.accentTint, line: C.accent, lineWidth: 1.5 });
    L.text(s, 'Upper die', cx - 1.45, 3.12, 2.9, 0.3, { size: 12, bold: true, color: C.accent, align: 'center' });
    // cable
    L.box(s, 0.6, 3.72, 5.6, 0.14, { fill: C.slate, line: C.slate });
    L.text(s, 'Cable', 0.6, 3.92, 1, 0.25, { size: 11, color: C.slate });
    // lower die
    L.box(s, cx - 1.45, 3.9, 2.9, 0.75, { fill: C.accentTint, line: C.accent, lineWidth: 1.5 });
    L.text(s, 'Lower die', cx - 1.45, 4.1, 2.9, 0.3, { size: 12, bold: true, color: C.accent, align: 'center' });
    L.box(s, cx - 1.7, 4.65, 3.4, 0.28, { fill: C.fill2, line: C.slate });
    // bolts / shear plane
    [-1.55, 1.55].forEach((dx) => {
      L.line(s, cx + dx, 2.6, cx + dx, 5.0, { color: C.ink, width: 2.5 });
    });
    L.line(s, cx - 2.2, 3.79, cx + 2.2, 3.79, { color: C.bad, width: 1, dash: 'dash' });

    // callouts
    const kx = 6.5;
    L.marker(s, kx, 1.0, 1);
    L.text(s, 'Crane-assisted handling', kx + 0.3, 0.88, 3, 0.3, { size: 13, bold: true });
    L.text(s, 'Shackle on the top plate. No manual lifting.', kx + 0.3, 1.18, 3, 0.5, { size: 11, color: C.slate });
    L.marker(s, kx, 2.25, 2);
    L.text(s, 'Matched S-profile dies', kx + 0.3, 2.13, 3, 0.3, { size: 13, bold: true });
    L.text(s, 'Both bends of the offset in one stroke.', kx + 0.3, 2.43, 3, 0.5, { size: 11, color: C.slate });
    L.marker(s, kx, 3.5, 3);
    L.text(s, 'Bolting and piston layout', kx + 0.3, 3.38, 3, 0.3, { size: 13, bold: true });
    L.text(s, 'Reconfigured to raise shear capacity.', kx + 0.3, 3.68, 3, 0.5, { size: 11, color: C.slate });
    L.text(s, '44 kips', kx + 0.3, 4.15, 3, 0.7, { size: 36, bold: true, color: C.accent });
    L.text(s, 'shear capacity', kx + 0.3, 4.85, 3, 0.3, { size: 12, color: C.muted });
    // marker anchors on the drawing
    L.marker(s, cx + 0.45, 0.88, 1, { r: 0.13, size: 9 });
    L.marker(s, cx + 1.15, 3.3, 2, { r: 0.13, size: 9 });
    L.marker(s, cx + 1.8, 4.4, 3, { r: 0.13, size: 9 });
  }

  // ---------------------------------------------------------------------
  // 5. Time
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'From the page: operation time cut by 75%, from a full shift to a quarter of one. Shown in shifts because the page gives no hours.');
    const x0 = 2.2;
    const full = 6.8;
    L.text(s, 'Old', 0.5, 1.35, 1.5, 0.75, { size: 16, bold: true, color: C.slate, valign: 'middle' });
    L.box(s, x0, 1.35, full, 0.75, { fill: C.fill2, noLine: true, radius: 0.08 });
    L.text(s, '1 shift', x0 + 0.25, 1.35, 3, 0.75, { size: 16, bold: true, color: C.slate, valign: 'middle' });
    L.text(s, 'New', 0.5, 2.6, 1.5, 0.75, { size: 16, bold: true, color: C.accent, valign: 'middle' });
    L.box(s, x0, 2.6, full / 4, 0.75, { fill: C.accent, noLine: true, radius: 0.08 });
    L.text(s, '¼ shift', x0 + full / 4 + 0.2, 2.6, 3, 0.75, { size: 16, bold: true, color: C.accent, valign: 'middle' });
    L.text(s, '−75%', 0.5, 4.0, 4, 1.1, { size: 64, bold: true, color: C.accent });
    L.text(s, 'operation time. Still in use over a year later, saving hundreds of labor hours.', 4.2, 4.3, 5.2, 0.8, { size: 14, color: C.slate });
  }

  return L.write(pres, out);
};
