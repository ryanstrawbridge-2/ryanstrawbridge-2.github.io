const L = require('./lib');
const { C } = L;

module.exports = async (out) => {
  const pres = L.newDeck('Faucet Leak Ring — diagrams');

  L.readMe(pres, {
    project: 'Faucet Leak Ring',
    slides: [
      'Where the water went, before and after',
      'Section through the ring',
    ],
    sources: [
      'Project page',
      'Your photo on-faucet.jpeg: the ring sits on the neck with a lip that points into the sink',
    ],
    checks: [
      'Slide 3: dimensions are labels only (measured neck Ø, clearance). Add your caliper reading and the clearance you chose if you want numbers.',
      'The channel shape is drawn from the photo and your description, not the CAD. Match it to your model.',
    ],
  });

  const faucet = (s, x, y0, y1, w) => {
    L.box(s, x - w / 2, y0, w, y1 - y0, { fill: C.fill2, line: C.slate, lineWidth: 1.5, radius: 0.12 });
  };

  // ---------------------------------------------------------------------
  // 2. Before / after
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Problem: water leaked from the top of the faucet, ran down the back and soaked the counter. The ring catches it on the way down and its lip sends it into the sink instead.');
    const panel = (x, good, t, sub) => {
      L.box(s, x, 0.45, 4.3, 5.35, { fill: good ? C.accentTint : C.fill, line: good ? C.accent : C.fill, radius: 0.04 });
      L.text(s, t, x + 0.3, 0.65, 3.7, 0.4, { size: 20, bold: true, color: good ? C.accent : C.ink });
      L.text(s, sub, x + 0.3, 1.08, 3.7, 0.3, { size: 12, bold: true, color: good ? C.accent : C.muted });
    };
    panel(0.4, false, 'Before', 'Runs down the back, onto the counter');
    panel(5.3, true, 'After', 'Caught and sent into the sink');

    [[0.4, false], [5.3, true]].forEach(([px, good]) => {
      const fx = px + 2.6;
      // counter and sink
      L.box(s, px + 0.3, 4.75, 3.7, 0.18, { fill: C.line, noLine: true });
      L.text(s, 'Counter', px + 2.8, 4.98, 1.2, 0.22, { size: 9.5, color: C.muted, align: 'right' });
      L.box(s, px + 0.3, 4.93, 1.6, 0.6, { fill: C.white, line: C.line });
      L.text(s, 'Sink', px + 0.3, 5.08, 1.6, 0.22, { size: 9.5, color: C.muted, align: 'center' });
      faucet(s, fx, 1.75, 4.75, 0.55);
      // leak source
      L.circle(s, fx + 0.05, 1.82, 0.07, { fill: C.water, noLine: true });
      if (!good) {
        L.line(s, fx + 0.3, 1.9, fx + 0.3, 4.7, { color: C.water, width: 3 });
        L.box(s, fx + 0.2, 4.68, 1.1, 0.09, { fill: C.water, noLine: true, radius: 0.5 });
        L.text(s, 'Puddle', fx + 0.42, 4.4, 1, 0.22, { size: 10, bold: true, color: C.water });
      } else {
        L.line(s, fx + 0.3, 1.9, fx + 0.3, 3.05, { color: C.water, width: 3 });
        // ring
        L.box(s, fx - 0.42, 3.05, 0.84, 0.22, { fill: 'FACC15', line: 'A16207', lineWidth: 1.25, radius: 0.2 });
        L.freeform(s, [{ x: fx - 0.42, y: 3.1, moveTo: true }, { x: fx - 0.9, y: 3.25 }, { x: fx - 0.9, y: 3.32 }, { x: fx - 0.42, y: 3.27 }, { close: true }], { fill: 'FACC15', line: 'A16207', width: 1.25 });
        L.text(s, 'Ring', fx + 0.5, 3.03, 0.8, 0.25, { size: 11, bold: true, color: 'A16207' });
        // redirected path into sink
        L.path(s, [[fx + 0.3, 3.05], [fx - 0.88, 3.28]], { color: C.water, width: 2 });
        L.arrow(s, fx - 0.9, 3.33, fx - 1.5, 4.9, { color: C.water, width: 2.5 });
      }
    });
  }

  // ---------------------------------------------------------------------
  // 3. Section through the ring
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Section through one side of the ring on the faucet neck. Bore = measured neck diameter plus a touch of clearance for a snug grip. The top is a channel that collects water running down the faucet; the wall is lower on the sink side, so it spills out there.');
    const nx = 3.2; // neck wall x (right edge of neck)
    // faucet neck (left part, cut)
    L.box(s, 0.6, 0.9, nx - 0.6, 4.6, { fill: C.fill2, line: C.slate, lineWidth: 1.5 });
    L.text(s, 'Faucet neck', 0.8, 1.05, 2.2, 0.3, { size: 12, bold: true, color: C.slate });
    // ring section: L with channel
    const top = 2.6;
    L.freeform(s, [
      { x: nx + 0.04, y: top, moveTo: true },
      { x: nx + 0.04, y: top + 1.6 },
      { x: nx + 1.9, y: top + 1.6 },
      { x: nx + 1.9, y: top + 0.45 },
      { x: nx + 1.55, y: top + 0.45 },
      { x: nx + 1.55, y: top + 0.85 },
      { x: nx + 0.45, y: top + 0.85 },
      { x: nx + 0.45, y: top },
      { close: true },
    ], { fill: 'FDE68A', line: 'A16207', width: 2 });
    // water in channel
    L.box(s, nx + 0.47, top + 0.55, 1.06, 0.28, { fill: C.waterTint, line: C.water, lineWidth: 1 });
    // water film down the neck
    L.line(s, nx - 0.06, 0.9, nx - 0.06, top + 0.5, { color: C.water, width: 3 });
    L.arrow(s, nx - 0.06, top + 0.3, nx + 0.6, top + 0.62, { color: C.water, width: 2 });
    // out over the lip toward sink (out of plane, drawn as arrow right)
    L.path(s, [[nx + 1.35, top + 0.6], [nx + 1.85, top + 0.38], [nx + 2.35, top + 1.5]], { color: C.water, width: 2.25, end: 'triangle' });
    L.text(s, 'Spills over the low lip,\ninto the sink', nx + 2.0, top + 1.6, 2.2, 0.5, { size: 11, bold: true, color: C.water });

    // clearance callout
    L.dim(s, nx - 0.06, top + 2.0, nx + 0.04, top + 2.0, '');
    L.line(s, nx - 0.02, top + 1.6, nx - 0.02, top + 2.15, { color: C.faint, width: 0.75 });
    // markers
    L.marker(s, nx + 1.0, top + 1.25, 1);
    L.marker(s, nx + 1.0, top + 0.3, 2);
    L.marker(s, nx + 0.0, top + 2.35, 3);

    const kx = 6.2;
    const row = (y, n, t, d) => {
      L.marker(s, kx, y + 0.13, n);
      L.text(s, t, kx + 0.3, y, 3.2, 0.3, { size: 13, bold: true });
      L.text(s, d, kx + 0.3, y + 0.32, 3.2, 0.7, { size: 11, color: C.slate });
    };
    row(1.1, 1, 'Printed ring', 'FDM, on the apartment printer. Designed and printed in an afternoon.');
    row(2.3, 2, 'Collecting channel', 'Catches water running down the faucet before it reaches the counter.');
    row(3.5, 3, 'Bore: measured Ø + clearance', 'Neck measured with calipers. A touch of clearance for a snug, leak-tight grip.');
    L.text(s, 'Inspired by wine-bottle drip rings.', kx, 4.75, 3.3, 0.3, { size: 11, italic: true, color: C.muted });
  }

  return L.write(pres, out);
};
