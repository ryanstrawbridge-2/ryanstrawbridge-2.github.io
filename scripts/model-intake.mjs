#!/usr/bin/env node
/**
 * Prepare a CAD model for the web.  `npm run model <file.glb> [slug]`
 *
 * CAD exports are enormous — an NX assembly through glTF is routinely 50–200 MB,
 * against a hard rule in this repo of never pushing more than 5 MB of new
 * binary in one commit. This does the three things that close that gap:
 *
 *   1. welds and reindexes the geometry, and drops anything unused
 *   2. resizes textures (CAD exports often carry 4K maps for flat colours)
 *   3. Draco-compresses the mesh, which is where most of the saving is
 *
 * It then refuses to write a file over the budget rather than leaving you to
 * discover it at push time.
 *
 * Input: .glb / .gltf, or STL straight out of SolidWorks — one .stl, a folder
 * of them, or a .zip of the folder (Save As STL with "Save all components of
 * an assembly in a single file" unticked). STL parts are coloured by name,
 * centred, converted mm -> m, and simplified until the result fits the budget.
 * STEP still needs converting to one of those first.
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { basename, extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, resample, textureCompress, draco, simplify, cloneDocument } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { listStl, stlToDocument } from './lib/stl.mjs';
import { renderPoster } from './lib/poster.mjs';
import draco3d from 'draco3dgltf';

// Imported lazily, and only when there are textures to re-encode. Loading it
// here as well as through gltf-transform's own copy makes macOS warn about two
// libvips in one process — harmless, but alarming, and most CAD exports have
// no textures at all.
const loadSharp = async () => (await import('sharp')).default;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public/models');
const BUDGET_MB = Number(process.env.MODEL_BUDGET_MB || 4);

const mb = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`;

const slugify = (value) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model';

const [, , inputArg, slugArg] = process.argv;

if (!inputArg || inputArg === '--help') {
  console.log(`
  npm run model <file.glb | file.stl | folder | stl.zip> [name]

  Compresses a glTF/GLB for the web and writes it to public/models/.

  Converting from CAD first:
    NX / SolidWorks  ->  export STL or OBJ
    Blender          ->  File > Import, then File > Export > glTF 2.0 (.glb)
                         tick Compression if you like; this script does it anyway

  Budget is ${BUDGET_MB} MB (MODEL_BUDGET_MB to change). Pushing more than 5 MB
  of new binary in one commit stalls the SSH push — see CLAUDE.md.
`);
  process.exit(inputArg ? 0 : 1);
}

const input = resolve(process.cwd(), inputArg);
if (!existsSync(input)) {
  console.error(`No such file: ${input}`);
  process.exit(1);
}

const ext = extname(input).toLowerCase();
const isStl = ext === '.stl' || ext === '.zip' || (await stat(input)).isDirectory();
if (!isStl && !['.glb', '.gltf'].includes(ext)) {
  console.error(`
  ${ext || 'That file'} isn't glTF, and this script doesn't convert it.

  Open it in Blender and export glTF 2.0 (.glb), then run this on the result.
  Blender reads STL and OBJ out of the box, and STEP with the free
  "STEPper" or "CAD Sketcher" add-on.
`);
  process.exit(1);
}

const name = slugify(slugArg || basename(input, ext));
const outPath = join(OUT_DIR, `${name}.glb`);

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

let before = (await stat(input)).size;
let document;
if (isStl) {
  const files = listStl(input);
  if (!files.length) { console.error('No .stl files found in that input.'); process.exit(1); }
  before = files.reduce((sum, f) => sum + statSync(f).size, 0);
  console.log(`\nreading ${files.length} STL part(s) — ${mb(before)}`);
  const built = stlToDocument(files);
  document = built.doc;
  console.log(`  assembly ${built.sizeMm.map((v) => v.toFixed(0)).join(' x ')} mm`);
} else {
  console.log(`\nreading ${basename(input)} — ${mb(before)}`);
  document = await io.read(input);
}

// What's actually in there, before touching it. A model that is mostly texture
// needs a different fix from one that is mostly triangles, and guessing wrong
// wastes a lot of time.
const meshes = document.getRoot().listMeshes();
const triangles = meshes.reduce(
  (total, mesh) =>
    total +
    mesh.listPrimitives().reduce((sum, primitive) => {
      const indices = primitive.getIndices();
      const position = primitive.getAttribute('POSITION');
      return sum + ((indices?.getCount() ?? position?.getCount() ?? 0) / 3);
    }, 0),
  0,
);
const textures = document.getRoot().listTextures();
const textureBytes = textures.reduce((sum, texture) => sum + (texture.getImage()?.byteLength ?? 0), 0);

console.log(`  ${meshes.length} mesh(es), ${Math.round(triangles).toLocaleString()} triangles`);
console.log(`  ${textures.length} texture(s), ${mb(textureBytes)}`);

// STL from CAD is dense where nobody looks (fillets, threads, board
// components). Simplify toward a triangle target and, if the result is still
// over budget, halve the target and try again. glTF input is left as authored.
const budget = BUDGET_MB * 1048576;
const TARGET = Number(process.env.MODEL_TRIANGLES || 300000);
await MeshoptSimplifier.ready;
await document.transform(dedup(), weld(), resample(), prune());

let data;
let finalDoc = document;
let target = TARGET;
for (let attempt = 0; attempt < 5; attempt++) {
  const doc = cloneDocument(document);
  const steps = [];
  if (isStl && triangles > target) {
    steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: target / triangles, error: 0.002, lockBorder: false }));
  }
  if (textures.length) {
    steps.push(textureCompress({ encoder: await loadSharp(), targetFormat: 'webp', resize: [2048, 2048] }));
  }
  steps.push(prune(), draco({ method: 'edgebreaker' }));
  await doc.transform(...steps);
  data = await io.writeBinary(doc);
  finalDoc = doc;
  if (!isStl || data.byteLength <= budget) {
    if (isStl) console.log(`  simplified to about ${Math.round(Math.min(target, triangles)).toLocaleString()} triangles`);
    break;
  }
  console.log(`  ${mb(data.byteLength)} at ~${target.toLocaleString()} triangles; over budget, trying fewer`);
  target = Math.round(target / 2);
}

await mkdir(OUT_DIR, { recursive: true });
const after = data.byteLength;

console.log(`\n  ${mb(before)} -> ${mb(after)}  (${Math.round((1 - after / before) * 100)}% smaller)`);

if (after > budget) {
  console.error(`
  Not written: ${mb(after)} is over the ${BUDGET_MB} MB budget.

  The usual fix is fewer triangles, which has to happen upstream:
    - export at a coarser tessellation / chord tolerance from NX
    - or add a Decimate modifier in Blender and export again
  Suppressing fasteners and internal parts usually helps more than either.
`);
  process.exit(1);
}

await writeFile(outPath, data);

// A still for the viewer to show before anyone clicks. Model3D picks up
// public/models/<name>.webp on its own; no frontmatter needed.
const still = renderPoster(finalDoc);
if (still) {
  const sharp = await loadSharp();
  await sharp(still.data, { raw: { width: still.width, height: still.height, channels: 4 } })
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(join(OUT_DIR, `${name}.webp`));
  console.log(`  wrote public/models/${name}.webp (poster)`);
}
console.log(`
  wrote public/models/${name}.glb

  Add it to a project gallery:
    - model: ${name}.glb
      alt: <what it shows>
`);
