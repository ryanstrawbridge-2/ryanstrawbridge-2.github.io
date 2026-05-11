#!/usr/bin/env node
// Renders public/og-image.png from the design described in src/og-template.html
// using Sharp (already installed as part of Astro's image pipeline). No
// headless browser required.

import sharp from 'sharp';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'og-image.png');
const HEADSHOT = join(ROOT, 'src', 'assets', 'images', 'about', 'headshot.jpg');

const W = 1200;
const H = 630;
const PHOTO_SIZE = 360;
const PHOTO_X = W - PHOTO_SIZE - 100;
const PHOTO_Y = (H - PHOTO_SIZE) / 2;

console.log('Generating Open Graph image (1200×630)…');

// Round-clip the headshot into a 360×360 circle PNG buffer.
const headshotBuf = await sharp(HEADSHOT)
  .resize(PHOTO_SIZE, PHOTO_SIZE, { fit: 'cover' })
  .composite([
    {
      input: Buffer.from(
        `<svg width="${PHOTO_SIZE}" height="${PHOTO_SIZE}">` +
          `<circle cx="${PHOTO_SIZE / 2}" cy="${PHOTO_SIZE / 2}" r="${PHOTO_SIZE / 2}" fill="white"/>` +
          `</svg>`,
      ),
      blend: 'dest-in',
    },
  ])
  .png()
  .toBuffer();

// SVG overlay: gradient background + name + role + url + headshot ring/shadow.
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#c2410c"/>
      <stop offset="100%" stop-color="#9a3412"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="20"/>
      <feOffset dx="0" dy="14"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- Text block -->
  <text x="80" y="280" fill="white"
        font-family="-apple-system, BlinkMacSystemFont, Inter, Helvetica, Arial, sans-serif"
        font-size="84" font-weight="800" letter-spacing="-2.5">Ryan Strawbridge</text>
  <text x="80" y="340" fill="white" opacity="0.85"
        font-family="-apple-system, BlinkMacSystemFont, Inter, Helvetica, Arial, sans-serif"
        font-size="36" font-weight="400">Mechanical Engineer</text>
  <text x="80" y="420" fill="white" opacity="0.6"
        font-family="-apple-system, BlinkMacSystemFont, Inter, Helvetica, Arial, sans-serif"
        font-size="22" font-weight="500" letter-spacing="1.2">ryanstrawbridge-2.github.io</text>

  <!-- Headshot frame ring (just behind the photo) -->
  <circle cx="${PHOTO_X + PHOTO_SIZE / 2}" cy="${PHOTO_Y + PHOTO_SIZE / 2}" r="${PHOTO_SIZE / 2 + 8}"
          fill="rgba(255,255,255,0.18)"/>
</svg>`;

await sharp(Buffer.from(svg))
  .composite([{ input: headshotBuf, left: Math.round(PHOTO_X), top: Math.round(PHOTO_Y) }])
  .png()
  .toFile(OUT);

console.log(`✓ wrote ${OUT.replace(ROOT + '/', '')}`);

// Self-clean: the HTML template was just for reference. Remove once the PNG
// is generated (per the task spec).
const TEMPLATE = join(ROOT, 'src', 'og-template.html');
if (existsSync(TEMPLATE)) {
  await unlink(TEMPLATE);
  console.log('✓ removed src/og-template.html (reference design, no longer needed)');
}
