const L = require('./lib');
const { C } = L;

module.exports = async (out) => {
  const pres = L.newDeck('3-Point Lifting Frame — diagrams');

  L.readMe(pres, {
    project: '3-Point Lifting Frame',
    slides: [
      'Why three points: statically determinate vs hyperstatic',
      'Load path at one corner',
      'Storage footprint, to scale',
      'By the numbers',
    ],
    sources: [
      'Co-op final presentation (Jun 2026): problem list, determinate vs hyperstatic slide, proof test, footprint',
      'STRENGSR-373 structural analysis: arms in compression, pins not load-bearing, joint redesigned to remove welds',
      'Project page',
    ],
    checks: [
      'Time saved: your page says 30-45 min per lift, the co-op deck says 25-45. Pick one and use it in both places.',
      'Slide 5 uses the deck figures: 10 ft x 10 ft / 1,260 lb before, 10 ft x 1 ft / 70 lb after, proof test 2,625 lb. Confirm these are fine to publish.',
      'Slide 3 is simplified: the real frame offsets the lift and pancake points, which adds bending and torsion in the arms. No analysis values are shown, on purpose.',
      'Nothing from the structural report is reproduced beyond the two qualitative facts above. Part numbers, margins and the internal file paths are left out.',
      'Joint revision copy (site figure 1): the report says Rev 1 was redesigned to eliminate welds. That is the honest one-line takeaway.',
    ],
  });

  // ---------------------------------------------------------------------
  // 2. Determinate vs hyperstatic
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'From the co-op deck slide "Statically Determinate < Hyperstatic". Three supports is exactly what statics needs, so each sling\'s share is fixed by geometry. A fourth support is redundant: small differences in sling length decide the load share, and the frame can rock on two diagonal slings. That was the "instability" item in the Problem.');
    const panel = (x, title, sub, legs, slackIndex, good) => {
      L.box(s, x, 0.45, 4.3, 5.35, { fill: good ? C.accentTint : C.fill, line: good ? C.accent : C.fill, radius: 0.04 });
      L.text(s, title, x + 0.3, 0.65, 3.7, 0.4, { size: 20, bold: true, color: good ? C.accent : C.ink });
      L.text(s, sub, x + 0.3, 1.08, 3.7, 0.3, { size: 12, color: good ? C.accent : C.muted, bold: true });

      // elevation: hook, slings, frame
      const hx = x + 2.15;
      const hy = 1.75;
      L.circle(s, hx, hy, 0.09, { fill: C.slate, line: C.slate });
      const fy = 3.55;
      for (let i = 0; i < legs.length; i += 1) {
        const lx = legs[i];
        const slack = i === slackIndex;
        if (slack) {
          // a sling a touch too long: drawn kinked and dashed
          L.path(s, [[hx, hy], [lx + (hx - lx) * 0.45 + 0.12, hy + (fy - hy) * 0.55], [x + lx - x, fy]], { color: C.faint, width: 1.5, dash: 'dash' });
        } else {
          L.line(s, hx, hy, lx, fy, { color: C.slate, width: 1.75 });
        }
      }
      L.box(s, x + 0.55, fy, 3.2, 0.14, { fill: C.slate, line: C.slate });
      if (slackIndex >= 0) {
        L.text(s, 'Slack', legs[slackIndex] + 0.18, 2.55, 0.8, 0.25, { size: 11, color: C.bad, bold: true });
      }

      // plan view
      const py = 4.15;
      L.label(s, 'Plan view', x + 0.3, py, 2);
      return { py: py + 0.35 };
    };

    // left: three point
    const left = 0.4;
    const { py } = panel(left, 'Three points', 'Statically determinate', [left + 0.6, left + 2.15, left + 3.7], -1, true);
    // triangle plan
    const tri = [[left + 0.75, py + 1.0], [left + 1.75, py + 0.05], [left + 2.75, py + 1.0]];
    L.path(s, [...tri, tri[0]], { color: C.accent, width: 2.25 });
    tri.forEach(([cx, cy]) => L.circle(s, cx, cy, 0.09, { fill: C.accent, noLine: true }));
    L.text(s, 'Each sling\'s share is set by geometry. Small length differences don\'t change it.', left + 3.0, py - 0.05, 1.2, 1.2, { size: 10, color: C.slate });

    // right: four point
    const right = 5.3;
    const p2 = panel(right, 'Four points', 'Hyperstatic: one support too many', [right + 0.6, right + 1.6, right + 2.7, right + 3.7], 2, false);
    const sq = [[right + 0.75, p2.py + 0.05], [right + 2.55, p2.py + 0.05], [right + 2.55, p2.py + 1.0], [right + 0.75, p2.py + 1.0]];
    L.path(s, [...sq, sq[0]], { color: C.slate, width: 2.25 });
    sq.forEach(([cx, cy], i) => L.circle(s, cx, cy, 0.09, { fill: i === 2 ? C.white : C.slate, line: i === 2 ? C.bad : C.slate }));
    L.line(s, sq[0][0], sq[0][1], sq[2][0], sq[2][1], { color: C.bad, width: 1, dash: 'dash' });
    L.text(s, 'Sling lengths decide the share. The frame can rock on a diagonal.', right + 2.8, p2.py - 0.05, 1.35, 1.2, { size: 10, color: C.slate });
  }

  // ---------------------------------------------------------------------
  // 3. Load path at one corner
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Qualitative free body of one corner. Vertical: the sling\'s vertical component carries that corner\'s share of the load. Horizontal: the sling also pulls the corner inward, and the two arms push back in compression. STRENGSR-373: the beam is in compression and bears on the joint, so the assembly pins carry no load in operation - they only hold the frame together while it is unloaded. Real frame offsets lift and attachment points, adding bending and torsion; not shown.');
    // corner node
    const nx = 3.3;
    const ny = 3.4;
    // arms going away (plan-ish elevation simplification): two arms to the right/back
    L.box(s, nx - 0.32, ny - 0.32, 0.64, 0.64, { fill: C.accentTint, line: C.accent, lineWidth: 1.75, radius: 0.1 });
    L.text(s, 'Corner\njoint', nx - 0.32, ny - 0.22, 0.64, 0.44, { size: 9, bold: true, color: C.accent, align: 'center' });

    // arm 1 (to the right)
    L.box(s, nx + 0.32, ny - 0.12, 2.6, 0.24, { fill: C.fill2, line: C.steel });
    L.text(s, 'Arm', nx + 1.3, ny - 0.1, 0.6, 0.2, { size: 9, color: C.slate, align: 'center', bold: true });
    // compression arrows on arm (pointing into the joint)
    L.arrow(s, nx + 2.3, ny + 0.42, nx + 0.55, ny + 0.42, { color: C.slate, width: 2 });
    L.text(s, 'Arm pushes back: compression', nx + 0.55, ny + 0.5, 2.6, 0.25, { size: 11, color: C.slate });

    // sling tension: up and to the right (toward hook at centre of frame)
    const tx = nx + 1.6;
    const ty = ny - 2.4;
    L.arrow(s, nx + 0.15, ny - 0.3, tx, ty, { color: C.accent, width: 2.75 });
    L.text(s, 'T  sling tension', tx + 0.1, ty - 0.1, 2, 0.3, { size: 13, bold: true, color: C.accent });
    // components
    L.arrow(s, nx + 0.15, ny - 0.3, nx + 0.15, ty, { color: C.accent, width: 1.25, dash: 'dash' });
    L.text(s, 'T sin α', nx - 0.75, (ny + ty) / 2 - 0.3, 0.8, 0.25, { size: 12, color: C.accent, align: 'right' });
    L.arrow(s, nx + 0.15, ny - 0.3, tx, ny - 0.3, { color: C.accent, width: 1.25, dash: 'dash' });
    L.text(s, 'T cos α  pulls the corner inward', nx + 0.55, ny - 0.62, 2.8, 0.25, { size: 11, color: C.accent });
    // angle label
    L.text(s, 'α', nx + 0.5, ny - 1.05, 0.3, 0.25, { size: 13, color: C.accent, bold: true });

    // load
    L.arrow(s, nx, ny + 0.32, nx, ny + 1.65, { color: C.ink, width: 2.75 });
    L.text(s, 'W/3  one corner\'s share of the load', nx + 0.12, ny + 1.3, 3, 0.3, { size: 12, bold: true });

    // equations / takeaways
    const ex = 6.75;
    L.label(s, 'At each corner', ex, 0.75, 3);
    L.box(s, ex, 1.05, 2.75, 0.62, { fill: C.fill, noLine: true, radius: 0.08, label: 'T sin α = W / 3', size: 18, bold: true });
    L.text(s, 'Vertical: the sling carries its third.', ex, 1.78, 2.75, 0.3, { size: 11, color: C.slate });
    L.box(s, ex, 2.3, 2.75, 0.62, { fill: C.fill, noLine: true, radius: 0.08, label: 'T cos α → arms', size: 18, bold: true });
    L.text(s, 'Horizontal: the inward pull puts both arms in compression.', ex, 3.03, 2.75, 0.5, { size: 11, color: C.slate });
    L.box(s, ex, 3.75, 2.75, 1.25, { fill: C.okTint, line: C.ok, radius: 0.08 });
    L.text(s, 'Pins carry nothing', ex + 0.2, 3.88, 2.4, 0.3, { size: 13, bold: true, color: C.ok });
    L.text(s, 'The arm bears on the joint in compression. Pins only hold the frame together while it is unloaded.', ex + 0.2, 4.2, 2.4, 0.75, { size: 10.5, color: C.slate });
    L.text(s, 'Shallower sling angle α → more tension and more compression.', ex, 5.25, 2.75, 0.5, { size: 10.5, italic: true, color: C.muted });
  }

  // ---------------------------------------------------------------------
  // 4. Footprint, to scale
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'To scale: 1 ft = 0.4 in on the slide. Figures from the co-op deck: previous equipment 10 ft x 10 ft and 1,260 lb; new frame broken down 10 ft x 1 ft and 70 lb. 100 - 10 = 90 sq ft, matching the 90 sq ft on the project page.');
    const ft = 0.4;
    const ox = 0.75;
    const oy = 1.05;
    // grid
    for (let i = 0; i <= 10; i += 1) {
      L.line(s, ox + i * ft, oy, ox + i * ft, oy + 10 * ft, { color: C.fill2, width: 0.5 });
      L.line(s, ox, oy + i * ft, ox + 10 * ft, oy + i * ft, { color: C.fill2, width: 0.5 });
    }
    L.box(s, ox, oy, 10 * ft, 10 * ft, { fill: C.fill2, line: C.slate, lineWidth: 1.5 });
    L.text(s, 'Previous equipment', ox, oy + 1.6, 10 * ft, 0.35, { size: 15, bold: true, align: 'center', color: C.slate });
    L.text(s, '100 sq ft  ·  1,260 lb', ox, oy + 2.0, 10 * ft, 0.3, { size: 12, align: 'center', color: C.muted });
    L.dim(s, ox, oy - 0.22, ox + 10 * ft, oy - 0.22, '10 ft');
    L.dim(s, ox - 0.22, oy, ox - 0.22, oy + 10 * ft, '10 ft', { left: true });

    // new frame, broken down
    const nx = 5.25;
    L.box(s, nx, oy, 10 * ft, 1 * ft, { fill: C.accentTint, line: C.accent, lineWidth: 1.5 });
    L.dim(s, nx, oy - 0.22, nx + 10 * ft, oy - 0.22, '10 ft');
    L.dim(s, nx + 10 * ft + 0.15, oy, nx + 10 * ft + 0.15, oy + ft, '1 ft');
    L.text(s, 'New frame, broken down', nx, oy + 0.6, 10 * ft, 0.35, { size: 15, bold: true, color: C.accent });
    L.text(s, '10 sq ft  ·  70 lb  ·  hand-portable', nx, oy + 0.98, 10 * ft, 0.3, { size: 12, color: C.muted });

    // saving callout
    L.box(s, nx, oy + 2.1, 10 * ft, 1.5, { fill: C.white, line: C.line, radius: 0.06 });
    L.text(s, '90 sq ft', nx + 0.3, oy + 2.25, 3.5, 0.75, { size: 44, bold: true, color: C.accent });
    L.text(s, 'of storage floor back, now used for magnet-stacking tooling.', nx + 0.3, oy + 3.0, 3.6, 0.5, { size: 12, color: C.slate });
  }

  // ---------------------------------------------------------------------
  // 5. By the numbers
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Rated load and standards from the project page; proof test and weights from the co-op deck. 2,625 / 2,100 = 1.25, the 125% proof load ASME B30.20 calls for. Time saved: pick 30-45 (page) or 25-45 (deck).');
    const tiles = [
      ['2,100 lb', 'rated load', C.accent],
      ['2,625 lb', 'proof test, 125% of rated', C.ink],
      ['70 lb', 'frame weight, hand-portable', C.ink],
      ['30–45 min', 'saved per lift', C.ink],
    ];
    const tw = 4.35;
    const th = 2.2;
    tiles.forEach(([big, small, col], i) => {
      const x = 0.5 + (i % 2) * (tw + 0.3);
      const y = 0.55 + Math.floor(i / 2) * (th + 0.3);
      L.box(s, x, y, tw, th, { fill: i === 0 ? C.accentTint : C.fill, noLine: true, radius: 0.05 });
      L.text(s, big, x + 0.35, y + 0.4, tw - 0.7, 0.95, { size: 48, bold: true, color: col });
      L.text(s, small, x + 0.35, y + 1.4, tw - 0.7, 0.4, { size: 15, color: C.slate });
    });
    L.text(s, 'Designed to ASME BTH-1 and ASME B30.20.', 0.5, 5.6, 9, 0.3, { size: 12, color: C.muted });
  }

  return L.write(pres, out);
};
