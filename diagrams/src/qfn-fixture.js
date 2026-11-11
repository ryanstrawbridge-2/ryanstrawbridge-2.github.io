const L = require('./lib');
const { C } = L;

module.exports = async (out) => {
  const pres = L.newDeck('Solder Reflow Fixture — diagrams');

  L.readMe(pres, {
    project: 'Solder Reflow Fixture (Raytheon)',
    slides: [
      'Reflow profile and the 93 °C limit (generic)',
      'How the shield works (generic section)',
      'Design loop: Gerber to operator',
    ],
    sources: [
      'Project page only. Nothing here comes from program documents.',
    ],
    checks: [
      'ITAR: every slide is deliberately generic. No board, part, layout or real profile. Keep it that way, and check with your former Raytheon contact if unsure.',
      'Slide 2 is an illustrative reflow profile. The curve shape and peak are textbook, not your line\'s profile. The only real number is 93 °C, which is already on your page.',
      'Slide 2 draws the shielded component as a dashed "goal" line, not a result. Your page says the fix is projected to cut rework, not proven.',
      'Slide 4: confirm the loop matches what happened (Gerber hole data for pin alignment, SolidWorks, 3 printed test fixtures, operator feedback, Durastone for the final).',
    ],
  });

  // ---------------------------------------------------------------------
  // 2. Reflow profile
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Illustrative reflow profile only: preheat, soak, reflow peak, cool. Not the production profile. The filters on the boards failed above 93 °C. The board has to go well past that for the solder to reflow, so the filter needs shielding. The dashed line is the design goal for a shielded part, not a measured result.');
    const ox = 1.2;
    const oy = 5.2;
    const pw = 7.6;
    const ph = 4.3;
    const tMax = 360; // s
    const TMax = 270; // C
    const X = (t) => ox + (t / tMax) * pw;
    const Y = (T) => oy - (T / TMax) * ph;
    // axes
    L.line(s, ox, Y(TMax), ox, oy, { color: C.slate, width: 1.25 });
    L.line(s, ox, oy, X(tMax), oy, { color: C.slate, width: 1.25 });
    [0, 50, 100, 150, 200, 250].forEach((T) => {
      L.line(s, ox - 0.06, Y(T), ox, Y(T), { color: C.slate, width: 1 });
      L.text(s, `${T}`, ox - 0.6, Y(T) - 0.11, 0.5, 0.22, { size: 9.5, color: C.muted, align: 'right' });
    });
    L.text(s, '°C', ox - 0.6, Y(TMax) - 0.05, 0.5, 0.22, { size: 9.5, color: C.muted, align: 'right' });
    L.text(s, 'Time', X(tMax) - 1, oy + 0.1, 1, 0.22, { size: 10, color: C.muted, align: 'right' });

    // zones
    const zones = [[0, 90, 'Preheat'], [90, 200, 'Soak'], [200, 270, 'Reflow'], [270, 360, 'Cool']];
    zones.forEach(([a, b, t], i) => {
      if (i % 2 === 1) L.box(s, X(a), Y(TMax), X(b) - X(a), ph, { fill: C.fill, noLine: true });
      L.text(s, t, X(a), Y(TMax) + 0.05, X(b) - X(a), 0.22, { size: 9.5, bold: true, color: C.muted, align: 'center' });
    });
    // board profile (generic)
    const prof = [[0, 25], [90, 150], [200, 190], [235, 225], [250, 240], [265, 225], [300, 180], [360, 90]];
    L.freeform(s, prof.map(([t, T], i) => (i === 0 ? { x: X(t), y: Y(T), moveTo: true } : { x: X(t), y: Y(T) })), { line: C.slate, width: 3 });
    L.text(s, 'Board / solder joint', X(270) + 0.05, Y(232), 2, 0.25, { size: 10.5, bold: true, color: C.slate });
    // limit
    L.line(s, ox, Y(93), X(tMax), Y(93), { color: C.bad, width: 1.75, dash: 'dash' });
    L.text(s, '93 °C filter limit', X(100), Y(93) - 0.3, 1.9, 0.25, { size: 11, bold: true, color: C.bad });
    L.text(s, 'Unshielded, the filter overheated past this line', X(100), Y(93) - 0.55, 3.4, 0.25, { size: 10.5, color: C.bad });
    // goal
    const goal = [[0, 25], [120, 70], [250, 88], [300, 82], [360, 60]];
    L.freeform(s, goal.map(([t, T], i) => (i === 0 ? { x: X(t), y: Y(T), moveTo: true } : { x: X(t), y: Y(T) })), { line: C.accent, width: 2.5, dash: 'dash' });
    L.text(s, 'Goal: shielded filter stays under', X(130), Y(62), 3, 0.25, { size: 10.5, bold: true, color: C.accent });
    L.text(s, 'Illustrative profile. Not the production profile.', ox, oy + 0.35, 5, 0.25, { size: 9.5, italic: true, color: C.faint });
  }

  // ---------------------------------------------------------------------
  // 3. How the shield works
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Generic section. During reflow, hot air heats the whole board. The shield sits over the heat-sensitive filter, located by pins that drop into existing board holes (positions taken from the Gerber files), and blocks the direct heat so the filter stays cooler while everything around it reflows. Shield material: Durastone, a composite that handles reflow temperatures.');
    // board
    L.box(s, 0.6, 4.1, 8.8, 0.32, { fill: '86EFAC', line: C.ok });
    L.text(s, 'Circuit card', 0.7, 4.47, 2, 0.25, { size: 11, color: C.ok, bold: true });
    // components
    L.box(s, 1.2, 3.75, 0.9, 0.35, { fill: C.slate, noLine: true });
    L.box(s, 7.6, 3.75, 0.9, 0.35, { fill: C.slate, noLine: true });
    L.text(s, 'Reflows normally', 0.95, 3.4, 1.5, 0.25, { size: 10, color: C.muted, align: 'center' });
    L.text(s, 'Reflows normally', 7.3, 3.4, 1.5, 0.25, { size: 10, color: C.muted, align: 'center' });
    // filter
    L.box(s, 4.35, 3.6, 1.3, 0.5, { fill: C.bad, noLine: true, label: 'Filter', size: 11, bold: true, color: C.white });
    // shield (inverted U) with pins
    L.freeform(s, [
      { x: 3.4, y: 4.1, moveTo: true }, { x: 3.4, y: 2.75 }, { x: 6.6, y: 2.75 }, { x: 6.6, y: 4.1 },
      { x: 6.35, y: 4.1 }, { x: 6.35, y: 3.0 }, { x: 3.65, y: 3.0 }, { x: 3.65, y: 4.1 }, { close: true },
    ], { fill: C.accentTint, line: C.accent, width: 2 });
    L.text(s, 'Heat shield (Durastone)', 3.4, 2.4, 3.2, 0.3, { size: 13, bold: true, color: C.accent, align: 'center' });
    // pins into board
    [3.52, 6.48].forEach((px) => L.box(s, px - 0.04, 4.1, 0.08, 0.32, { fill: C.accent, noLine: true }));
    // heat arrows
    [1.65, 3.0, 4.2, 5.0, 5.8, 7.0, 8.05].forEach((x) => {
      const blocked = x > 3.3 && x < 6.7;
      L.arrow(s, x, 0.9, x, blocked ? 2.65 : 3.3, { color: blocked ? C.faint : C.kero, width: 2 });
    });
    L.text(s, 'Hot air during reflow', 0.6, 0.55, 3, 0.25, { size: 11, bold: true, color: C.kero });
    // callouts
    L.marker(s, 6.95, 4.25, 1, { r: 0.14, size: 10 });
    L.text(s, 'Alignment pins drop into existing board holes, located from the Gerber files.', 7.2, 4.65, 2.3, 0.8, { size: 10.5, color: C.slate });
    L.line(s, 6.95, 4.39, 7.15, 4.7, { color: C.accent, width: 1 });
    L.text(s, 'Universal: one shield design, re-pinned per board.', 0.6, 5.3, 6, 0.3, { size: 11.5, italic: true, color: C.muted });
  }

  // ---------------------------------------------------------------------
  // 4. Design loop
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'From the page: universal heat shield with iterative pin alignment using Gerber files and SolidWorks; 3 test fixtures printed to see how operators worked with it; fit well and operators affirmed its usefulness. Final material Durastone per the summary.');
    const steps = [
      ['Gerber files', 'Hole positions for the alignment pins'],
      ['SolidWorks', 'Shield model, pins placed from the data'],
      ['FDM test print', '3 fixtures printed'],
      ['Operator trial', 'Fit well. Operators affirmed it.'],
    ];
    const w = 1.95;
    const gap = 0.35;
    steps.forEach(([t, d], i) => {
      const x = 0.5 + i * (w + gap);
      const hi = i === 3;
      L.box(s, x, 1.6, w, 1.7, { fill: hi ? C.okTint : C.fill, line: hi ? C.ok : C.fill, radius: 0.08 });
      L.text(s, t, x + 0.15, 1.8, w - 0.3, 0.35, { size: 14, bold: true, color: hi ? C.ok : C.ink });
      L.text(s, d, x + 0.15, 2.2, w - 0.3, 1.0, { size: 11, color: C.slate });
      if (i < steps.length - 1) L.arrow(s, x + w + 0.03, 2.45, x + w + gap - 0.03, 2.45, { color: C.slate, width: 1.75 });
    });
    // iterate loop arrow back
    L.path(s, [[0.5 + 3 * (w + gap) + w / 2, 3.3], [0.5 + 3 * (w + gap) + w / 2, 3.85], [0.5 + w + gap + w / 2, 3.85], [0.5 + w + gap + w / 2, 3.32]], { color: C.accent, width: 1.75, end: 'triangle' });
    L.text(s, 'Iterate pin alignment', 0.5 + w + gap + w / 2 + 0.15, 3.93, 3, 0.25, { size: 11, bold: true, color: C.accent });
    L.box(s, 0.5, 4.55, 9.0, 1.05, { fill: C.white, line: C.line, radius: 0.06 });
    L.text(s, 'Outcome', 0.75, 4.68, 2, 0.3, { size: 13, bold: true });
    L.text(s, 'Projected to reduce rework across the board suite. A co-worker presented the design at a symposium after the co-op ended.', 0.75, 5.0, 8.5, 0.55, { size: 11.5, color: C.slate });
  }

  return L.write(pres, out);
};
