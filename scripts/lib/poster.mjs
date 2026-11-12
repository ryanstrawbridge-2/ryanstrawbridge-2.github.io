/**
 * Render a still of a glTF Document, for the 3D viewer's poster.
 *
 * The viewer shows this until someone clicks "View in 3D", so it has to look
 * like the model, not a grey box. A browser can't be relied on to capture it
 * (WebGL won't read back from a background tab), so this is a small software
 * rasterizer: perspective camera on an orbit, flat Lambert shading, a z-buffer
 * for opaque parts, then see-through parts blended back to front on top.
 * About a second for 300k triangles at 1200 px.
 *
 * Returns raw RGBA pixels; the caller encodes them (sharp).
 */

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Every triangle in world space, with its material colour and alpha. */
const collect = (doc) => {
  const tris = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const xf = (x, y, z) => [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    ];
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const mat = prim.getMaterial();
      const color = mat ? mat.getBaseColorFactor() : [0.8, 0.8, 0.8, 1];
      const alpha = mat && mat.getAlphaMode() === 'BLEND' ? color[3] : 1;
      const idx = prim.getIndices();
      const count = idx ? idx.getCount() : pos.getCount();
      const p = [0, 0, 0];
      for (let i = 0; i < count; i += 3) {
        const v = [];
        for (let k = 0; k < 3; k++) {
          pos.getElement(idx ? idx.getScalar(i + k) : i + k, p);
          v.push(xf(p[0], p[1], p[2]));
        }
        tris.push({ v, color, alpha });
      }
    }
  }
  return tris;
};

export const renderPoster = (doc, { width = 1200, height = 900, yaw = 35, pitch = 70, fov = 30 } = {}) => {
  const tris = collect(doc);
  if (!tris.length) return null;

  // Frame the bounding sphere.
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (const v of t.v) for (let c = 0; c < 3; c++) {
    if (v[c] < lo[c]) lo[c] = v[c];
    if (v[c] > hi[c]) hi[c] = v[c];
  }
  const center = lo.map((v, i) => (v + hi[i]) / 2);
  const radius = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
  const f = 1 / Math.tan((fov * Math.PI) / 360);
  const dist = (radius * f) / Math.min(1, width / height) * 1.08;

  // model-viewer convention: yaw around +Y, pitch from the +Y pole.
  const th = (yaw * Math.PI) / 180;
  const ph = (pitch * Math.PI) / 180;
  const eye = [
    center[0] + dist * Math.sin(ph) * Math.sin(th),
    center[1] + dist * Math.cos(ph),
    center[2] + dist * Math.sin(ph) * Math.cos(th),
  ];
  const fwd = norm([center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]]);
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const light = norm([right[0] * -0.4 + up[0] * 0.8 - fwd[0] * 0.6, right[1] * -0.4 + up[1] * 0.8 - fwd[1] * 0.6, right[2] * -0.4 + up[2] * 0.8 - fwd[2] * 0.6]);

  const project = (p) => {
    const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const z = dot(d, fwd);
    return [
      width / 2 + ((dot(d, right) * f) / z) * (height / 2),
      height / 2 - ((dot(d, up) * f) / z) * (height / 2),
      z,
    ];
  };

  const rgba = new Uint8ClampedArray(width * height * 4); // transparent
  const zbuf = new Float32Array(width * height).fill(Infinity);

  const shade = (t) => {
    const n = norm(cross(
      [t.v[1][0] - t.v[0][0], t.v[1][1] - t.v[0][1], t.v[1][2] - t.v[0][2]],
      [t.v[2][0] - t.v[0][0], t.v[2][1] - t.v[0][1], t.v[2][2] - t.v[0][2]],
    ));
    const lambert = Math.abs(dot(n, light)); // CAD normals point either way
    const k = 0.38 + 0.62 * lambert;
    return t.color.slice(0, 3).map((c) => Math.round(Math.min(1, c * k) ** (1 / 2.2) * 255));
  };

  const raster = (t, blend) => {
    const [a, b, c] = t.v.map(project);
    if (a[2] <= 0 || b[2] <= 0 || c[2] <= 0) return;
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-9) return;
    const col = shade(t);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
        const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
        const i = y * width + x;
        if (z >= zbuf[i]) continue;
        const o = i * 4;
        if (!blend) {
          zbuf[i] = z;
          rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 255;
        } else {
          const al = t.alpha;
          const da = rgba[o + 3] / 255;
          const outA = al + da * (1 - al);
          for (let k = 0; k < 3; k++) {
            rgba[o + k] = (col[k] * al + rgba[o + k] * da * (1 - al)) / (outA || 1);
          }
          rgba[o + 3] = outA * 255;
        }
      }
    }
  };

  const opaque = tris.filter((t) => t.alpha >= 1);
  const clear = tris.filter((t) => t.alpha < 1);
  for (const t of opaque) raster(t, false);
  const depth = (t) => dot([t.v[0][0] - eye[0], t.v[0][1] - eye[1], t.v[0][2] - eye[2]], fwd);
  clear.sort((p, q) => depth(q) - depth(p));
  for (const t of clear) raster(t, true);

  return { data: Buffer.from(rgba.buffer), width, height };
};
