/**
 * Build every deck into diagrams/<slug>.pptx.
 *   cd diagrams && npm install && npm run build            # all
 *   node src/build-all.js lifting-frame                    # one
 */
const { join } = require('node:path');
const { readdirSync } = require('node:fs');
const { execFileSync } = require('node:child_process');

const only = process.argv.slice(2);
const decks = readdirSync(__dirname)
  .filter((f) => f.endsWith('.js') && !['lib.js', 'build-all.js'].includes(f))
  .map((f) => f.replace(/\.js$/, ''))
  .filter((slug) => only.length === 0 || only.includes(slug));

(async () => {
  for (const slug of decks) {
    const out = join(__dirname, '..', `${slug}.pptx`);
    await require(`./${slug}.js`)(out);
    // pptxgenjs writes directory entries into the ZIP. PowerPoint ignores
    // them, but cloud importers (Google Drive among them) can refuse the
    // file. Strip them so the deck uploads straight into Google Slides.
    try { execFileSync('zip', ['-dq', out, '*/']); } catch { /* none to strip */ }
    console.log(`wrote diagrams/${slug}.pptx`);
  }
})().catch((error) => { console.error(error); process.exit(1); });
