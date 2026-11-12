#!/usr/bin/env node
/**
 * `npm run photos:sort` — file photo-inbox/PREFIX_title.ext originals into
 * portfolio-photos/<project>/ by prefix. Studio's Save does the same thing.
 *   --dry-run   show where each file would go, move nothing
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileInbox } from './lib/inbox-file.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const { moved, skipped } = await fileInbox(ROOT, { dryRun });

if (!moved.length && !skipped.length) console.log('photo-inbox is empty.');
for (const m of moved) console.log(`${dryRun ? 'would move' : 'moved'}  ${m.name}  ->  ${m.to}`);
for (const s of skipped) console.log(`left     ${s.name}  (${s.reason})`);
