/**
 * A folder (or zip, or single file) of STL parts -> one glTF Document.
 *
 * SolidWorks writes one STL per component when "Save all components of an
 * assembly in a single file" is unticked, each already in assembly
 * coordinates, so the parts only need stacking, not placing. Each part becomes
 * its own node and mesh so the viewer can colour them separately.
 *
 * STL carries no colour, so parts are coloured by what their filename says
 * they are: boards green, fasteners steel, the housing see-through so the
 * inside is visible. Override per model with a `colors` map (substring ->
 * hex) passed in from the caller.
 *
 * No normals are written. three.js (inside model-viewer) flat-shades a mesh
 * without them, which reads as CAD, and it keeps the file smaller.
 */

import { readFileSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { Document } from '@gltf-transform/core';

/** [match, rgb, opts] — first match wins, matched against the upper-cased name. */
const DEFAULT_RULES = [
  [/HOUSING|ENCLOSURE|SHELL/, [0.62, 0.72, 0.8], { alpha: 0.28 }],
  [/BOARD|PCB|MODEM|PICOMODEM/, [0.13, 0.42, 0.22]],
  [/BATTERY|INR\d|CELL/, [0.16, 0.33, 0.62]],
  [/CABLE|WIRE/, [0.5, 0.12, 0.1]],
  [/CONNECTOR|GHR-/, [0.92, 0.9, 0.84]],
  [/O-?RING|ORING|AS568/, [0.08, 0.08, 0.08]],
  [/MOTOR/, [0.25, 0.25, 0.27]],
  [/BEARING/, [0.72, 0.73, 0.75], { metal: 0.8 }],
  // McMaster part numbers, and generic hardware words: steel.
  [/(^|[^A-Z])MC_|SCREW|BOLT|NUT|WASHER|PIN|SPRING|STANDOFF|SHCS/, [0.7, 0.71, 0.73], { metal: 0.8 }],
];
const DEFAULT_PART = [0.86, 0.87, 0.89]; // the parts you designed: light, neutral

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};

/** Expand a .zip / folder / .stl path into a sorted list of STL file paths. */
export const listStl = (input) => {
  const ext = extname(input).toLowerCase();
  let dir = input;
  if (ext === '.stl') return [input];
  if (ext === '.zip') {
    dir = mkdtempSync(join(tmpdir(), 'stl-'));
    execFileSync('unzip', ['-q', '-o', input, '-d', dir]);
  }
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name.startsWith('.') || name === '__MACOSX') continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (extname(name).toLowerCase() === '.stl') out.push(p);
    }
  };
  walk(dir);
  return out.sort();
};

/** Binary or ASCII STL -> Float32Array of triangle vertex positions (mm). */
const readStl = (path) => {
  const b = readFileSync(path);
  const n = b.length >= 84 ? b.readUInt32LE(80) : 0;
  if (n > 0 && 84 + 50 * n === b.length) {
    const pos = new Float32Array(n * 9);
    for (let t = 0; t < n; t++) {
      const o = 84 + t * 50 + 12;
      for (let k = 0; k < 9; k++) pos[t * 9 + k] = b.readFloatLE(o + k * 4);
    }
    return pos;
  }
  const nums = [...b.toString('utf8').matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].flatMap((m) => [+m[1], +m[2], +m[3]]);
  if (!nums.length) throw new Error(`${basename(path)} is not a readable STL`);
  return Float32Array.from(nums);
};

/** Short, readable part name: drops the top-level assembly prefix and instance suffix. */
const partName = (path) =>
  basename(path, extname(path))
    .replace(/^.*? - /, '') // top-level assembly: "ITD-A000-TLA - "
    .split(' ')
    .pop() // sub-assembly prefixes: "ITD-A001-MOTOR&ELECTRONICS-1 "
    .replace(/-\d+$/, ''); // instance number

export const stlToDocument = (files, { colors = {} } = {}) => {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('assembly');
  const root = doc.createNode('assembly');
  scene.addChild(root);

  const materials = new Map();
  const materialFor = (name) => {
    const upper = name.toUpperCase();
    const custom = Object.entries(colors).find(([key]) => upper.includes(key.toUpperCase()));
    let rgb = DEFAULT_PART;
    let opts = {};
    if (custom) rgb = hexToRgb(custom[1]);
    else {
      const rule = DEFAULT_RULES.find(([re]) => re.test(upper));
      if (rule) [, rgb, opts = {}] = rule;
    }
    const key = `${rgb.join()}|${opts.alpha ?? 1}|${opts.metal ?? 0}`;
    if (!materials.has(key)) {
      const m = doc.createMaterial(`m${materials.size}`)
        .setBaseColorFactor([...rgb, opts.alpha ?? 1])
        .setMetallicFactor(opts.metal ?? 0.05)
        .setRoughnessFactor(opts.metal ? 0.35 : 0.6);
      if (opts.alpha) m.setAlphaMode('BLEND').setDoubleSided(true);
      materials.set(key, m);
    }
    return materials.get(key);
  };

  // Centre the assembly on the origin and convert mm -> m, in one pass.
  const parts = files.map((f) => ({ name: partName(f), pos: readStl(f) }));
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const { pos } of parts) {
    for (let i = 0; i < pos.length; i++) {
      const c = i % 3;
      if (pos[i] < lo[c]) lo[c] = pos[i];
      if (pos[i] > hi[c]) hi[c] = pos[i];
    }
  }
  const mid = lo.map((v, i) => (v + hi[i]) / 2);
  let triangles = 0;

  for (const { name, pos } of parts) {
    const scaled = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i++) scaled[i] = (pos[i] - mid[i % 3]) / 1000;
    triangles += pos.length / 9;
    const position = doc.createAccessor().setType('VEC3').setArray(scaled).setBuffer(buffer);
    const prim = doc.createPrimitive().setAttribute('POSITION', position).setMaterial(materialFor(name));
    const mesh = doc.createMesh(name).addPrimitive(prim);
    root.addChild(doc.createNode(name).setMesh(mesh));
  }

  return { doc, triangles, parts: parts.length, sizeMm: hi.map((v, i) => v - lo[i]) };
};
