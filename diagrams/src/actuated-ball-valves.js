const L = require('./lib');
const { C } = L;

module.exports = async (out) => {
  const pres = L.newDeck('Actuated Ball Valves — diagrams');

  L.readMe(pres, {
    project: 'Actuated Ball Valves',
    slides: [
      'Where the valve sits in the feed system',
      'Architecture trade-off',
      'Torque budget (structure only — add your numbers)',
      'Bench test: what was commanded, what was measured',
    ],
    sources: [
      'Your P&ID, photo-inbox/ABV_P&ID.png (PID-001 rev A)',
      'Project page: Problem / What I did / Outcome',
    ],
    checks: [
      'Slide 2 is simplified from PID-001: vents, reliefs, fills and instruments are left out on purpose. Add any back that matter.',
      'Slide 3: the ball valve\'s mass and "lighter than a regulator" are implied by your Problem section, not stated. Confirm.',
      'Slide 4 has no numbers. Add the model torque, the margin you chose, and the servo\'s rated torque, or keep it qualitative.',
      'Slide 5: confirm the measured signals (current draw, position feedback) match how the bench test was instrumented.',
      'The position-vs-current plot should come from your own data, so it is not drawn here.',
    ],
  });

  // ---------------------------------------------------------------------
  // 2. Feed system, simplified from PID-001
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Simplified from PID-001 rev A. Omitted: N2/LOX/kero vents, pressure reliefs, QD and propellant fills, TC/PI instruments. The servo ball valves are the actuated ball valves this project designs: they meter N2 pressurant into each propellant tank in place of a pressure regulator.');
    const yL = 1.45;
    const yK = 4.55;
    const yN = 3.0;
    const trunk = 2.45;

    // N2 tank and trunk
    L.tank(s, 0.5, yN - 0.38, 1.5, 0.76, { label: 'N₂ tank' });
    L.line(s, 2.0, yN, trunk, yN, { color: C.gas, width: 2 });
    L.line(s, trunk, yL, trunk, yK, { color: C.gas, width: 2 });

    const row = (y, name, col, tint) => {
      // pressurant side
      L.line(s, trunk, y, 5.35, y, { color: C.gas, width: 2 });
      L.checkValve(s, 2.95, y, 'right', { color: C.gas });
      L.text(s, 'Check', 2.6, y + 0.24, 0.7, 0.2, { size: 9, color: C.muted, align: 'center' });
      L.valve(s, 3.75, y, { actuator: 'servo', fill: C.accentTint, color: C.accent, actFill: C.accentTint });
      L.text(s, 'Actuated\nball valve', 3.2, y + 0.24, 1.1, 0.4, { size: 9, bold: true, color: C.accent, align: 'center' });
      L.valve(s, 4.7, y, { actuator: 'solenoid' });
      L.text(s, 'Press\nsolenoid', 4.25, y + 0.24, 0.9, 0.4, { size: 9, color: C.muted, align: 'center' });
      // tank
      L.tank(s, 5.35, y - 0.36, 1.55, 0.72, { label: `${name} tank`, color: col, fill: tint, textColor: col });
      // propellant side
      L.line(s, 6.9, y, 8.35, y, { color: col, width: 2.25 });
      L.valve(s, 7.45, y, { actuator: 'solenoid', color: col });
      L.text(s, 'Main', 7.1, y + 0.24, 0.7, 0.2, { size: 9, color: C.muted, align: 'center' });
      L.line(s, 8.35, y, 8.35, yN + (y < yN ? -0.32 : 0.32), { color: col, width: 2.25, end: 'triangle' });
      L.checkValve(s, 8.35, (y + yN) / 2 + (y < yN ? -0.15 : 0.15), y < yN ? 'down' : 'up', { color: col });
    };
    row(yL, 'LOX', C.lox, C.loxTint);
    row(yK, 'Kero', C.kero, C.keroTint);

    // Injector
    L.circle(s, 8.35, yN, 0.32, { fill: C.white, line: C.slate, width: 1.75 });
    L.text(s, 'Injector', 8.75, yN - 0.12, 1.0, 0.25, { size: 12, bold: true });

    // annotation: what the valve replaces
    L.box(s, 3.05, 2.45, 2.6, 1.1, { fill: C.white, line: C.accent, dash: 'dash', radius: 0.06 });
    L.text(s, 'Replaces a pressure regulator', 3.2, 2.56, 2.3, 0.25, { size: 11, bold: true, color: C.accent });
    L.text(s, 'Meters N₂ into each tank to hold ullage pressure. A regulator does this too, but is too heavy to fly.', 3.2, 2.84, 2.33, 0.65, { size: 9.5, color: C.slate });
    L.line(s, 3.75, 2.45, 3.75, yL + 0.42, { color: C.accent, width: 1, dash: 'dash' });
    L.line(s, 3.75, 3.55, 3.75, yK - 0.6, { color: C.accent, width: 1, dash: 'dash' });

    // legend
    const ly = 5.65;
    const key = (x, col, t, w = 2) => {
      L.line(s, x, ly + 0.1, x + 0.35, ly + 0.1, { color: col, width: 2.25 });
      L.text(s, t, x + 0.45, ly, w, 0.22, { size: 9.5, color: C.muted });
    };
    key(0.5, C.gas, 'N₂ pressurant');
    key(1.95, C.lox, 'Liquid oxygen');
    key(3.4, C.kero, 'Kerosene');
    L.text(s, 'Simplified from PID-001. Vents, reliefs, fills and instruments omitted.', 5.1, ly, 4.4, 0.22, { size: 9, color: C.faint, align: 'right', italic: true });
  }

  // ---------------------------------------------------------------------
  // 3. Architecture trade-off
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Rows are the three constraints from the Problem section. Red cells are the stated reason each option was ruled out. Ball-valve cells: high Cv is a property of a full-bore ball valve; the torque cell reflects the torque derivation and servo selection in What I did. Mass is implied, not stated - confirm.');
    const x0 = 0.5;
    const colW = [2.0, 2.33, 2.33, 2.34];
    const rowH = [0.85, 1.15, 1.15, 1.15, 0.95];
    const cols = ['', 'Pressure regulator', 'Needle valve\n+ stepper motor', 'Actuated\nball valve'];
    const rows = ['Mass', 'Flow capacity (Cv)', 'Breakaway torque', 'Verdict'];
    const cells = [
      [['Too heavy to fly', 'bad'], ['Not the constraint', ''], ['Light enough to fly', 'ok']],
      [['Not the constraint', ''], ['Too low', 'bad'], ['High: full-bore ball', 'ok']],
      [['Not the constraint', ''], ['Too high', 'bad'], ['High, but sized for:\nservo with margin', 'ok']],
      [['Ruled out', 'badStrong'], ['Ruled out', 'badStrong'], ['Selected', 'okStrong']],
    ];
    let y = 0.5;
    // header
    let x = x0;
    cols.forEach((c, i) => {
      if (i > 0) {
        L.box(s, x + 0.05, y, colW[i] - 0.1, rowH[0], {
          fill: i === 3 ? C.accentTint : C.fill, line: i === 3 ? C.accent : C.fill, radius: 0.08,
          label: c, size: 13, bold: true, color: i === 3 ? C.accent : C.ink,
        });
      }
      x += colW[i];
    });
    y += rowH[0] + 0.1;
    rows.forEach((r, ri) => {
      const h = rowH[ri + 1] - 0.1;
      L.text(s, r, x0, y, colW[0] - 0.15, h, { size: 13, bold: true, valign: 'middle', color: C.slate });
      let cx = x0 + colW[0];
      cells[ri].forEach(([t, kind], ci) => {
        const style = {
          bad: { fill: C.badTint, line: C.badTint, color: C.bad, bold: true },
          ok: { fill: C.white, line: C.line, color: C.ink, bold: false },
          '': { fill: C.white, line: C.line, color: C.muted, bold: false },
          badStrong: { fill: C.bad, line: C.bad, color: C.white, bold: true },
          okStrong: { fill: C.ok, line: C.ok, color: C.white, bold: true },
        }[kind];
        L.box(s, cx + 0.05, y, colW[ci + 1] - 0.1, h, { ...style, label: t, size: 12, radius: 0.06 });
        cx += colW[ci + 1];
      });
      y += rowH[ri + 1];
    });
  }

  // ---------------------------------------------------------------------
  // 4. Torque budget (structure, no numbers)
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'Qualitative on purpose - no values are on your page. Replace the bar heights and add a scale, or keep it as a structure diagram. Order of the stack follows What I did: model torque from differential pressure, seat friction and port geometry, then margin for seat creep and breakaway the simple model misses.');
    const base = 5.3;
    const bx = 1.6;
    const bw = 1.7;
    // axis
    L.line(s, 1.2, 0.8, 1.2, base, { color: C.slate, width: 1.25 });
    L.line(s, 1.2, base, 6.4, base, { color: C.slate, width: 1.25 });
    L.text(s, 'Torque', 0.35, 2.8, 0.8, 0.3, { size: 12, color: C.muted, rotate: 270, align: 'center' });

    // stacked bar
    const segs = [
      { h: 2.45, label: 'Model torque\nfrom ΔP, seat friction\nand port geometry', fill: C.fill2, color: C.ink },
      { h: 1.05, label: 'Margin: seat creep\n+ breakaway', fill: C.accentTint, color: C.accent, line: C.accent, dash: 'dash' },
    ];
    let top = base;
    for (const seg of segs) {
      top -= seg.h;
      L.box(s, bx, top, bw, seg.h, { fill: seg.fill, line: seg.line ?? C.white, dash: seg.dash, label: seg.label, size: 11, color: seg.color, bold: seg.color === C.accent });
    }
    L.text(s, 'Required torque', bx, base + 0.12, bw, 0.25, { size: 12, bold: true, align: 'center' });

    // available line
    const avail = top - 0.55;
    L.line(s, 1.2, avail, 6.4, avail, { color: C.ok, width: 2, dash: 'dash' });
    L.text(s, 'Servo torque available', 3.6, avail - 0.32, 2.8, 0.25, { size: 12, bold: true, color: C.ok });
    L.arrow(s, 4.0, top, 4.0, avail + 0.02, { color: C.ok, width: 1.25, start: 'triangle' });
    L.text(s, 'Headroom', 4.12, (top + avail) / 2 - 0.12, 1.2, 0.24, { size: 11, color: C.ok });
    L.line(s, bx + bw, top, 4.1, top, { color: C.faint, width: 0.75, dash: 'sysDot' });

    // explanation
    L.text(s, 'How the requirement was built', 6.8, 1.0, 2.8, 0.3, { size: 13, bold: true });
    L.text(s, [
      { text: 'Model torque from differential pressure, seat friction and port geometry.', options: { bullet: { type: 'number' }, breakLine: true } },
      { text: 'Margin on top for seat creep and breakaway, which the simple model does not capture.', options: { bullet: { type: 'number' }, breakLine: true } },
      { text: 'Servo chosen to clear the total, then checked under pressure on the bench.', options: { bullet: { type: 'number' } } },
    ], 6.8, 1.4, 2.75, 3.2, { size: 12, color: C.slate, lineSpacing: 1.25 });
    L.text(s, 'Bar heights are illustrative. Add your values.', 6.8, 5.0, 2.75, 0.4, { size: 9.5, italic: true, color: C.faint });
  }

  // ---------------------------------------------------------------------
  // 5. Bench test signal flow
  // ---------------------------------------------------------------------
  {
    const s = L.slideOf(pres, 'From What I did / Outcome: a high-torque RC servo evaluated under pressure for signal control and position feedback, in a 3D-printed test jig, before water-flow testing. Outcome: actuation under 2,300 psi differential; commanded position vs current plotted across pressures. Confirm the instrumentation.');
    const y = 2.2;
    L.box(s, 0.5, y, 1.75, 1.0, { fill: C.fill, line: C.line, radius: 0.08, label: 'Commanded\nposition\n(PWM)', size: 12, bold: true });
    // Jig outline first, so the servo and valve sit on top of it.
    L.box(s, 2.65, y - 0.4, 4.5, 1.8, { fill: C.white, line: C.faint, dash: 'dash', radius: 0.05 });
    L.label(s, '3D-printed test jig', 2.8, y - 0.33, 3);
    L.text(s, 'stem', 4.62, y + 0.18, 0.55, 0.2, { size: 9, color: C.muted, align: 'center' });
    L.box(s, 2.85, y, 1.75, 1.0, { fill: C.white, line: C.slate, radius: 0.08, label: 'High-torque\nRC servo', size: 12, bold: true });
    L.box(s, 5.2, y, 1.75, 1.0, { fill: C.accentTint, line: C.accent, radius: 0.08, label: 'Ball valve', size: 12, bold: true, color: C.accent });
    L.arrow(s, 4.6, y + 0.5, 5.2, y + 0.5);
    L.arrow(s, 2.25, y + 0.5, 2.85, y + 0.5);

    // pressure source
    L.box(s, 7.55, y, 1.95, 1.0, { fill: C.white, line: C.gas, radius: 0.08, label: 'Pressure source\nup to 2,300 psi ΔP', size: 12, bold: true, color: C.gas });
    L.arrow(s, 7.55, y + 0.5, 6.95, y + 0.5, { color: C.gas, width: 2 });

    // measured outputs
    const my = 4.45;
    L.box(s, 2.85, my, 1.75, 0.8, { fill: C.okTint, line: C.ok, radius: 0.08, label: 'Current draw', size: 12, bold: true, color: C.ok });
    L.box(s, 5.2, my, 1.75, 0.8, { fill: C.okTint, line: C.ok, radius: 0.08, label: 'Position\nfeedback', size: 12, bold: true, color: C.ok });
    L.arrow(s, 3.72, y + 1.4, 3.72, my, { color: C.ok });
    L.arrow(s, 6.08, y + 1.4, 6.08, my, { color: C.ok });
    L.label(s, 'Measured', 2.85, my + 0.9, 2, { color: C.ok });

    L.text(s, 'Result', 7.65, 3.95, 1.9, 0.3, { size: 13, bold: true });
    L.text(s, 'Actuated under 2,300 psi ΔP. Current vs commanded position, per pressure, sets the controller\'s starting parameters.', 7.65, 4.28, 1.9, 1.6, { size: 11, color: C.slate, lineSpacing: 1.2 });
  }

  return L.write(pres, out);
};
