#!/usr/bin/env node
/**
 * Refuse to publish draft copy.
 *
 * Walkthrough figures are seeded with placeholder headlines and points so the
 * structure is reviewable before the diagrams exist. A figure that has an image
 * but still has its placeholder text WILL render on the live site — the
 * placeholder skeleton is dev-only, the copy is not.
 *
 * So this looks for the markers in fields that actually publish, and ignores
 * `plan`, which exists precisely to hold notes-to-self and is never rendered
 * outside dev.
 *
 * Warn-only by default, like check:media and check:tina: a CMS commit must
 * never fail the GitHub Actions deploy, because that leaves the live site
 * silently stale. `--strict` is for publish.sh, where someone is watching.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.argv.includes('--strict');

// Case-sensitive on purpose: "placeholder" is a legitimate English word that
// could appear in real copy about, say, a placeholder fixture.
const MARKERS = ['PLACEHOLDER', 'CHECK AND REWRITE', 'ADD FS', 'TODO', 'FIXME', 'XXX'];

/** Never rendered outside dev, so notes here are the whole point. */
const EXEMPT_FIELDS = new Set(['plan']);

const findMarkers = (value) => MARKERS.filter((marker) => value.includes(marker));

/** Walk any nested value, yielding [dotted.path, string]. */
function* strings(value, path = []) {
  if (typeof value === 'string') {
    yield [path.join('.'), value];
  } else if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) yield* strings(item, [...path, i]);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) yield* strings(item, [...path, key]);
  }
}

const findings = [];

const checkMarkdown = async (file) => {
  const raw = await readFile(file, 'utf8');
  if (!raw.startsWith('---')) return;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return;

  let data;
  try {
    data = YAML.parse(raw.slice(3, end));
  } catch (error) {
    // A file this script cannot parse is not a file it may pass. Report and
    // let the exit code decide, rather than silently skipping it.
    findings.push({ file, path: '(frontmatter)', marker: 'UNPARSEABLE', text: String(error.message) });
    return;
  }

  for (const [path, text] of strings(data)) {
    const leaf = path.split('.').pop();
    if (EXEMPT_FIELDS.has(leaf)) continue;
    for (const marker of findMarkers(text)) {
      findings.push({ file, path, marker, text: text.slice(0, 80) });
    }
  }

  // The body publishes too.
  for (const marker of findMarkers(raw.slice(end))) {
    findings.push({ file, path: '(body)', marker, text: '' });
  }
};

const dirs = [
  { dir: join(ROOT, 'src/content/projects'), ext: '.md' },
];

for (const { dir, ext } of dirs) {
  const entries = await readdir(dir).catch(() => []);
  for (const entry of entries) {
    if (entry.endsWith(ext)) await checkMarkdown(join(dir, entry));
  }
}

if (findings.length === 0) {
  console.log('\ncheck:copy — no placeholder copy in publishable fields\n');
  process.exit(0);
}

const byFile = new Map();
for (const finding of findings) {
  const key = basename(finding.file);
  byFile.set(key, [...(byFile.get(key) ?? []), finding]);
}

console.log(`\ncheck:copy — ${findings.length} placeholder(s) in copy that WOULD publish\n`);
for (const [file, items] of byFile) {
  console.log(`  ${file}`);
  for (const item of items) {
    console.log(`    ${item.path.padEnd(24)} ${item.marker}${item.text ? ` — ${item.text}` : ''}`);
  }
  console.log('');
}
console.log('  `plan` fields are exempt — those notes never leave localhost.');
console.log(STRICT ? '\n  Refusing to publish.\n' : '\n  Warning only. publish.sh runs this with --strict.\n');

process.exit(STRICT ? 1 : 0);
