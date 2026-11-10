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
 * Input must be .glb or .gltf. STEP, STL and OBJ are not glTF and nothing here
 * converts them — Blender does that in a couple of minutes and far more
 * reliably than a chain of npm converters would, so the script says so instead
 * of pretending.
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, resample, textureCompress, draco } from '@gltf-transform/functions';
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
  npm run model <file.glb> [name]

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
if (!['.glb', '.gltf'].includes(ext)) {
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

const before = (await stat(input)).size;
console.log(`\nreading ${basename(input)} — ${mb(before)}`);

const document = await io.read(input);

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

await document.transform(
  dedup(),
  // Welds coincident vertices. CAD tessellation duplicates them heavily, so
  // this alone often takes a third off before anything is compressed.
  weld(),
  resample(),
  prune(),
  ...(textures.length
    ? [
        textureCompress({
          encoder: await loadSharp(),
          targetFormat: 'webp',
          resize: [2048, 2048],
        }),
      ]
    : []),
  draco({ method: 'edgebreaker' }),
);

await mkdir(OUT_DIR, { recursive: true });
const data = await io.writeBinary(document);

const after = data.byteLength;
const budget = BUDGET_MB * 1048576;

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
console.log(`
  wrote public/models/${name}.glb

  Add it to a project gallery:
    - model: ${name}.glb
      alt: <what it shows>
`);
