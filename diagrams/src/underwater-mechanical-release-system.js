const L = require('./lib');
const { C } = L;

module.exports = async (out) => {
  const pres = L.newDeck('Underwater Mechanical Release System — diagrams');

  L.readMe(pres, {
    project: 'Underwater Mechanical Release System',
    slides: [
      'Cost against commercial releases',
      'Release sequence: transmit to reset',
      'Section: what seals where',
      'Load path and the hand calcs along it',
      'Test results',
    ],
    sources: [
      'Project page',
      'Team 9 poster draft (Team9_Poster_48x36.pptx): five-step sequence, 8.5 kHz signal, MEMS microphone, PicoModem, gearmotor-driven sheath, lever release, POM-C housing, 35 kg ballast',
      'Your cross-section render (cross-section.png) for the layout of slide 4',
    ],
    checks: [
      'Pressure: your page says vessel tested to 470 psi; the poster says a 480 psi depth rating. 300 m of seawater is about 440 psi. Make the two documents agree.',
      'Slide 2 shows $260 per unit at quantity 100 from the poster draft. It is a projection; drop it if it is not final.',
      'Slide 5 maps each hand calc to a part (bending and torsion on the shaft, tear-out at the lever pin, pullout at the end-cap fasteners). That mapping is my reading. Only the 2.25 FS on the release arm is on your page; the rest show "FS ?".',
      'Slide 3 is team work from the poster. Your page should stay clear about which parts were yours: the mechanical release, the top-level CAD, seals and hand calcs.',
    ],
  });

  // ---------------------------------------------------------------------
  // 2. Cost
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'From the page: target production cost under $400 against $2,000+ commercial systems. Poster draft: $260 per unit at quantity 100 (projection - confirm or delete that bar).');
    const x0 = 2.6;
    const scale = 3.0; // in per $1000
    const bar = (y, usd, lab, val, col, fill, o = {}) => {
      L.text(s, lab, 0.5, y, 2.0, 0.7, { size: 13, bold: true, color: col, valign: 'middle' });
      L.box(s, x0, y, (usd / 1000) * scale, 0.7, { fill, noLine: !o.dash, line: col, dash: o.dash, radius: 0.08 });
      L.text(s, val, x0 + (usd / 1000) * scale + 0.15, y, 2.4, 0.7, { size: 15, bold: true, color: col, valign: 'middle' });
    };
    bar(1.0, 2000, 'Commercial\nreleases', '$2,000+', C.slate, C.fill2);
    bar(2.0, 400, 'Our target', '< $400', C.accent, C.accentTint, { dash: 'dash' });
    bar(3.0, 260, 'Projected\nat qty 100', '$260', C.accent, C.accent);
    L.line(s, x0, 0.85, x0, 3.85, { color: C.slate, width: 1 });
    L.box(s, 0.5, 4.3, 9.0, 1.3, { fill: C.fill, noLine: true, radius: 0.06 });
    L.text(s, 'Same job, smaller vehicle', 0.75, 4.45, 8.5, 0.3, { size: 13, bold: true });
    L.text(s, 'Rated for 300 m, resettable without opening the housing, and sized to fit the payload space of small autonomous underwater vehicles.', 0.75, 4.78, 8.5, 0.7, { size: 12, color: C.slate });
  }

  // ---------------------------------------------------------------------
  // 3. Release sequence
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Five steps from the poster: Transmit, Receive, Decode, Release, Reset. Step 4 and 5 are the mechanical release this project covers.');
    const steps = [
      ['Transmit', 'Surface tow fish sends a coded 8.5 kHz signal.', false],
      ['Receive', 'Sound crosses the domed endcap to a MEMS microphone.', false],
      ['Decode', 'The modem validates the repeated command.', false],
      ['Release', 'Gearmotor turns the sheath. The lever drops the 35 kg ballast.', true],
      ['Reset', 'Re-hang the ballast, rotate back. Nothing to replace.', true],
    ];
    const w = 1.66;
    const gap = 0.2;
    steps.forEach(([t, d, mine], i) => {
      const x = 0.45 + i * (w + gap);
      L.box(s, x, 1.3, w, 3.3, { fill: mine ? C.accentTint : C.fill, line: mine ? C.accent : C.fill, radius: 0.06 });
      L.circle(s, x + w / 2, 1.95, 0.32, { fill: mine ? C.accent : C.slate, noLine: true, label: String(i + 1), color: C.white, size: 16 });
      L.text(s, t, x + 0.12, 2.5, w - 0.24, 0.35, { size: 15, bold: true, align: 'center', color: mine ? C.accent : C.ink });
      L.text(s, d, x + 0.15, 2.95, w - 0.3, 1.5, { size: 11, color: C.slate, align: 'center', lineSpacing: 1.2 });
      if (i < steps.length - 1) L.arrow(s, x + w + 0.01, 2.95, x + w + gap - 0.01, 2.95, { color: C.slate, width: 1.5 });
    });
    L.label(s, 'Acoustics and electronics', 0.45, 0.85, 5);
    L.label(s, 'Mechanical release', 0.45 + 3 * (w + gap), 0.85, 3.5, { color: C.accent });
    L.text(s, 'Resettable in the field: no burn wire, no corrodible link, no part used up per release.', 0.45, 5.0, 9.1, 0.5, { size: 12, italic: true, color: C.muted });
  }

  // ---------------------------------------------------------------------
  // 4. Section
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Simplified from your cross-section render. Numbers match the list on the right. Dual dynamic nitrile O-rings seal the rotating shaft/sheath; a static face seal seals the end cap to the housing; both sized to Parker Handbook practice at 470 psi.');
    const hx = 1.3;
    const hw = 2.7;
    // domed housing
    L.freeform(s, [
      { x: hx, y: 4.0, moveTo: true },
      { x: hx, y: 1.25 },
      { x: hx + hw, y: 1.25, curve: { type: 'quadratic', x1: hx + hw / 2, y1: 0.45 } },
      { x: hx + hw, y: 4.0 },
      { close: true },
    ], { fill: C.fill2, line: C.slate, width: 1.75 });
    // inner cavity
    L.box(s, hx + 0.2, 1.35, hw - 0.4, 2.65, { fill: C.white, line: C.line });
    // electronics
    L.box(s, hx + 0.3, 1.45, hw - 0.6, 0.35, { fill: C.okTint, line: C.ok, label: 'Electronics', size: 9, color: C.ok, bold: true });
    // motor + battery
    L.box(s, hx + 0.3, 1.95, 1.15, 1.85, { fill: '99F6E4', line: '0F766E', label: 'Gear-\nmotor', size: 10, bold: true, color: '0F766E' });
    L.box(s, hx + 1.55, 1.95, 0.85, 1.85, { fill: 'BBF7D0', line: C.ok, label: 'Battery', size: 10, bold: true, color: C.ok });
    // end cap
    L.box(s, hx - 0.25, 4.0, hw + 0.5, 0.55, { fill: C.fill2, line: C.slate, lineWidth: 1.75 });
    // face seal (between housing and cap)
    L.box(s, hx + 0.05, 3.94, hw - 0.1, 0.1, { fill: C.ink, noLine: true });
    // shaft
    const sx = hx + 0.87;
    L.box(s, sx - 0.12, 3.8, 0.24, 1.35, { fill: C.steel, line: C.slate });
    // o-rings on shaft (pairs both sides)
    [4.15, 4.38].forEach((y) => {
      L.circle(s, sx - 0.16, y, 0.05, { fill: C.ink, noLine: true });
      L.circle(s, sx + 0.16, y, 0.05, { fill: C.ink, noLine: true });
    });
    // sheath + lever below
    L.box(s, sx - 0.28, 4.6, 0.56, 0.75, { fill: C.fill, line: C.slate, label: '', size: 9 });
    L.freeform(s, [
      { x: sx + 0.25, y: 5.0, moveTo: true }, { x: sx + 1.5, y: 5.0 }, { x: sx + 1.5, y: 5.3 }, { x: sx + 0.25, y: 5.3 }, { close: true },
    ], { fill: C.accentTint, line: C.accent, width: 1.75 });
    L.circle(s, sx + 1.32, 5.15, 0.08, { fill: C.white, line: C.accent });
    // ballast line
    L.line(s, sx + 1.32, 5.23, sx + 1.32, 5.95, { color: C.slate, width: 2 });
    L.text(s, 'to ballast', sx + 1.42, 5.62, 1.2, 0.25, { size: 9, color: C.muted });

    // markers
    const m = [
      [hx + hw / 2, 0.7, 1],
      [hx + hw + 0.18, 3.97, 2],
      [sx - 0.42, 4.27, 3],
      [sx - 0.5, 4.95, 4],
      [sx + 1.72, 5.15, 5],
      [hx + hw + 0.25, 2.3, 6],
    ];
    m.forEach(([x, y, n]) => L.marker(s, x, y, n, { r: 0.14, size: 10 }));

    const kx = 5.2;
    const items = [
      ['Domed housing', 'POM-C. The dome carries pressure in compression, so the receiving face stays thin.'],
      ['Static face seal', 'End cap to housing.'],
      ['Dual dynamic O-rings', 'Nitrile, on the rotating shaft. Sized to Parker Handbook practice at 470 psi.'],
      ['Sheath', 'Turned by the gearmotor to release. A thread frees a seized lever.'],
      ['Release lever', 'Simple lever: fewer joints to seize than a pelican hook.'],
      ['Gearmotor and battery', 'Everything that needs to stay dry stays above the seals.'],
    ];
    items.forEach(([t, d], i) => {
      const y = 0.55 + i * 0.86;
      L.marker(s, kx, y + 0.13, i + 1, { r: 0.14, size: 10 });
      L.text(s, t, kx + 0.28, y, 4.1, 0.28, { size: 12.5, bold: true });
      L.text(s, d, kx + 0.28, y + 0.28, 4.1, 0.55, { size: 10.5, color: C.slate });
    });
  }

  // ---------------------------------------------------------------------
  // 5. Load path
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'The six hand calcs from What I did, laid along the path the ballast load takes from the hook into the housing. Mapping of calc to part is inferred - confirm. Only the release-arm FS (2.25 at 80 lb) is on the page; fill in the rest or delete the FS chips.');
    const chain = [
      ['Ballast', '35 kg (80 lb) max', false],
      ['Release lever', 'Shear tear-out at the pin', true],
      ['Shaft', 'Bending and torsion', true],
      ['Sheath / tensile path', 'Tensile', true],
      ['End-cap fasteners', 'Bolt pullout', true],
      ['Face seal', 'Clamping force', true],
    ];
    const fs = ['', '2.25', '?', '?', '?', '?'];
    const x = 1.0;
    chain.forEach(([t, d, check], i) => {
      const y = 0.45 + i * 0.9;
      L.box(s, x, y, 3.0, 0.68, { fill: i === 0 ? C.fill2 : C.white, line: i === 0 ? C.fill2 : C.slate, radius: 0.08, label: t, size: 13, bold: true });
      if (i < chain.length - 1) L.arrow(s, x + 1.5, y + 0.68, x + 1.5, y + 0.9, { color: C.accent, width: 2 });
      if (check) {
        L.line(s, x + 3.0, y + 0.34, x + 3.5, y + 0.34, { color: C.line, width: 1 });
        L.text(s, d, x + 3.6, y + 0.08, 3.0, 0.3, { size: 12, color: C.slate });
        const known = fs[i] !== '?';
        L.box(s, x + 6.6, y + 0.12, 1.4, 0.44, {
          fill: known ? C.okTint : C.white, line: known ? C.ok : C.faint, dash: known ? undefined : 'dash', radius: 0.5,
          label: `FS ${fs[i]}`, size: 12, bold: true, color: known ? C.ok : C.faint,
        });
      } else {
        L.text(s, d, x + 3.6, y + 0.18, 3.0, 0.3, { size: 12, color: C.muted });
      }
    });
  }

  // ---------------------------------------------------------------------
  // 6. Results
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'All from the Outcome section of the page.');
    const tiles = [
      ['470 psi', 'Vessel pressure test, no leaks', true],
      ['60 ft', 'Released 20 lb after 5 days in the ocean', false],
      ['2.25', 'Factor of safety, release arm at 80 lb', false],
      ['300 m', 'Depth rating', false],
    ];
    const tw = 4.35;
    const th = 2.2;
    tiles.forEach(([big, small, hi], i) => {
      const x = 0.5 + (i % 2) * (tw + 0.3);
      const y = 0.55 + Math.floor(i / 2) * (th + 0.3);
      L.box(s, x, y, tw, th, { fill: hi ? C.accentTint : C.fill, noLine: true, radius: 0.05 });
      L.text(s, big, x + 0.35, y + 0.4, tw - 0.7, 0.95, { size: 48, bold: true, color: hi ? C.accent : C.ink });
      L.text(s, small, x + 0.35, y + 1.4, tw - 0.7, 0.6, { size: 15, color: C.slate });
    });
    L.text(s, 'Next: prove maximum ballast release at depth and over duration.', 0.5, 5.6, 9, 0.3, { size: 12, color: C.muted });
  }

  return L.write(pres, out);
};
