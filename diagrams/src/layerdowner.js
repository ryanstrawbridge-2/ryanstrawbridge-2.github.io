const L = require('./lib');
const { C } = L;

module.exports = async (out) => {
  const pres = L.newDeck('Layerdowner — diagrams');

  L.readMe(pres, {
    project: 'Layerdowner',
    slides: [
      'The old way: a strap holding a cantilevered cable',
      'How the carriage sets the first turn',
      'Time saved per layer',
    ],
    sources: [
      'Project page',
      'Co-op final presentation: aluminum sheet and tab welds, "lays down first turn", 0.5 to 3 hours per pancake, operator quote',
      'Your photos: the overhead strap (layerdowner-01) and the cradle on a vertical rail with a lock knob (carriage-blurred)',
    ],
    checks: [
      'Slide 3 reads the vertical carriage as following the cable down as it lowers, and the base slide as the radial adjustment with the knob locking it. That is from the photo. Confirm.',
      'Your page says "per magnet layer", the deck says "per pancake". Use one term in both.',
      'The operator quote on the deck is a strong caption: "Keeping the coil steady for that first turn really helps the guys dial in the wrapping heads." Get the OK before publishing it.',
      'Frame material: the page says aluminium sheet metal, the deck adds tab welds.',
    ],
  });

  // ---------------------------------------------------------------------
  // 2. The old way
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'From the Problem section and the strap photo. The first turn had to be placed by hand at the correct radial position. The cable cantilevers out from the stack, internal forces fight you, it gets harder as the cable lowers, and sway or misalignment means unwinding and re-laying.');
    const frames = [
      { t: 'Cantilevered', sub: 'Held up by a strap from overhead' },
      { t: 'Sways as it lowers', sub: 'Internal forces push it off position' },
      { t: 'Unwind and re-lay', sub: 'Misalignment means rework' },
    ];
    frames.forEach((f, i) => {
      const x = 0.4 + i * 3.1;
      L.box(s, x, 0.5, 2.9, 4.4, { fill: C.fill, noLine: true, radius: 0.04 });
      L.marker(s, x + 0.35, 0.85, i + 1, { fill: C.slate });
      L.text(s, f.t, x + 0.6, 0.72, 2.2, 0.3, { size: 14, bold: true });
      // overhead beam
      L.box(s, x + 0.25, 1.35, 2.4, 0.1, { fill: C.steel, noLine: true });
      // stack/support on the left
      L.box(s, x + 0.25, 3.0, 0.5, 1.6, { fill: C.fill2, line: C.line });
      L.text(s, 'Stack', x + 0.25, 4.25, 0.5, 0.2, { size: 8, color: C.muted, align: 'center' });
      const cy = 3.0 + (i === 1 ? 0.25 : 0);
      if (i < 2) {
        // cable cantilevered from the stack
        L.line(s, x + 0.75, 3.05, x + 2.6, cy + (i === 1 ? 0.15 : 0), { color: C.slate, width: 6 });
        // strap
        const sx = x + 1.85;
        L.line(s, sx, 1.45, sx + (i === 1 ? 0.18 : 0), cy + (i === 1 ? 0.1 : 0) - 0.06, { color: 'D6B07A', width: 5 });
        if (i === 1) {
          L.line(s, x + 0.75, 3.05, x + 2.6, 2.85, { color: C.faint, width: 3, dash: 'dash' });
          L.arrow(s, x + 2.45, 2.7, x + 2.45, 3.3, { color: C.bad, width: 1.5, start: 'triangle' });
        }
      } else {
        // cable lifted back off: curled arrow
        L.line(s, x + 0.75, 3.05, x + 2.6, 3.05, { color: C.faint, width: 6, dash: 'dash' });
        L.arrow(s, x + 2.3, 3.25, x + 1.1, 3.25, { color: C.bad, width: 2 });
        L.arrow(s, x + 1.1, 2.75, x + 2.3, 2.75, { color: C.bad, width: 2 });
      }
      L.text(s, f.sub, x + 0.25, 4.95, 2.4, 0.5, { size: 11, color: C.slate });
    });
    L.text(s, 'Placed by hand at the correct radial position, every first turn.', 0.4, 5.55, 9, 0.3, { size: 12, italic: true, color: C.muted });
  }

  // ---------------------------------------------------------------------
  // 3. How the carriage sets the first turn
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Schematic of the photo carriage-blurred: a U-shaped cradle with two retaining pins holds the cable; the cradle rides an off-the-shelf carriage on a vertical linear rail, so it follows the cable down passively; a base slide sets the radial position and a knob locks it. Frame: lightweight aluminium sheet metal.');
    // frame plate
    L.box(s, 3.35, 0.55, 0.7, 4.75, { fill: C.fill, line: C.line });
    // vertical rail
    L.box(s, 3.55, 0.65, 0.3, 4.55, { fill: C.fill2, line: C.steel });
    // carriage
    const cy = 2.0;
    L.box(s, 3.45, cy, 0.5, 0.75, { fill: '86EFAC', line: C.ok, lineWidth: 1.25 });
    // cradle arm
    L.box(s, 1.6, cy + 0.15, 1.85, 0.45, { fill: C.accentTint, line: C.accent, lineWidth: 1.5 });
    // U cradle around cable
    L.box(s, 1.65, cy + 0.6, 0.12, 0.65, { fill: C.accentTint, line: C.accent, lineWidth: 1.5 });
    L.box(s, 2.55, cy + 0.6, 0.12, 0.65, { fill: C.accentTint, line: C.accent, lineWidth: 1.5 });
    // cable section
    L.circle(s, 2.16, cy + 0.95, 0.3, { fill: C.slate, line: C.slate });
    L.text(s, 'Cable', 1.3, cy + 1.4, 1.7, 0.25, { size: 11, color: C.slate, align: 'center' });
    // pins
    L.circle(s, 1.95, cy + 0.38, 0.07, { fill: C.white, line: C.slate });
    L.circle(s, 2.4, cy + 0.38, 0.07, { fill: C.white, line: C.slate });
    // travel arrow
    L.arrow(s, 4.35, cy, 4.35, cy + 2.0, { color: C.ok, width: 2.25, start: 'none' });
    L.text(s, 'Rides down with\nthe cable', 4.5, cy + 0.6, 1.6, 0.5, { size: 11, bold: true, color: C.ok });
    // base slide
    L.box(s, 1.3, 5.0, 3.6, 0.25, { fill: C.fill2, line: C.steel });
    L.box(s, 3.2, 4.7, 1.0, 0.3, { fill: C.white, line: C.slate });
    L.arrow(s, 2.2, 5.5, 4.0, 5.5, { color: C.accent, width: 1.75, start: 'triangle' });
    L.text(s, 'Radial position', 2.2, 5.6, 1.8, 0.25, { size: 11, bold: true, color: C.accent, align: 'center' });
    // knob
    L.circle(s, 4.55, 4.85, 0.16, { fill: C.slate, line: C.slate });

    // callouts
    L.marker(s, 1.3, cy + 0.38, 1);
    L.marker(s, 3.7, cy - 0.25, 2);
    L.marker(s, 5.0, 4.5, 3);
    const kx = 6.3;
    const row = (y, n, t, d) => {
      L.marker(s, kx, y + 0.13, n);
      L.text(s, t, kx + 0.3, y, 3.1, 0.3, { size: 13, bold: true });
      L.text(s, d, kx + 0.3, y + 0.32, 3.1, 0.7, { size: 11, color: C.slate });
    };
    row(0.9, 1, 'Cradle holds the cable', 'Retaining pins keep it seated. No strap, no hands.');
    row(2.05, 2, 'Off-the-shelf carriage and rail', 'Passive: it follows the cable down as it lowers.');
    row(3.2, 3, 'Set the radial position, lock it', 'Technicians dial it in directly instead of holding a cantilevered cable.');
    L.text(s, 'Lightweight aluminium sheet-metal frame. Easy to assemble and install.', kx, 4.55, 3.2, 0.6, { size: 10.5, italic: true, color: C.muted });
  }

  // ---------------------------------------------------------------------
  // 4. Time saved per layer
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'From the page: 0.5 to 3 hours saved per magnet layer, depending on configuration. Range bar, not a single value.');
    const x0 = 0.9;
    const scale = 2.6; // in per hour
    const y = 2.6;
    L.line(s, x0, y + 0.9, x0 + 3.2 * scale, y + 0.9, { color: C.slate, width: 1 });
    for (let h = 0; h <= 3; h += 0.5) {
      L.line(s, x0 + h * scale, y + 0.9, x0 + h * scale, y + 1.0, { color: C.slate, width: 1 });
      L.text(s, `${h} h`, x0 + h * scale - 0.4, y + 1.08, 0.8, 0.25, { size: 11, color: C.muted, align: 'center' });
    }
    L.box(s, x0 + 0.5 * scale, y + 0.15, 2.5 * scale, 0.6, { fill: C.accent, noLine: true, radius: 0.5 });
    L.text(s, '0.5–3 hours saved per layer', 0.9, 0.9, 8.5, 0.8, { size: 36, bold: true, color: C.accent });
    L.text(s, 'Depends on the configuration being wound.', 0.9, 1.65, 8, 0.35, { size: 14, color: C.slate });
    L.text(s, 'Also removes the unwind-and-re-lay rework caused by cable sway.', 0.9, 4.6, 8.5, 0.35, { size: 14, color: C.slate });
  }

  return L.write(pres, out);
};
