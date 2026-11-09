#!/usr/bin/env node
/**
 * Guards the hand-maintained GraphQL fragments in src/lib/tina-visual-editing.ts
 * against the schema in tina/tina-lock.json.
 *
 * Why this exists: the admin at /admin/ dies with a bare "Unexpected Error" when
 * the fragment selects a field the schema doesn't have. That has happened twice,
 * both times after a field was renamed or removed in tina/config.ts and the
 * fragment was left behind. The error says nothing about which field, so it costs
 * an hour to find by bisection. This finds it in a second.
 *
 * Two directions, two severities:
 *   - fragment asks for a field the schema lacks  -> ERROR (breaks the admin)
 *   - schema has a field the fragment skips       -> notice (field just can't be
 *     click-focused; sometimes deliberate, see gotcha #8 about list roots)
 *
 * After any schema change, regenerate the lock before trusting this:
 *   set -a && source .env.local && set +a && npx tinacms dev   # ~10s, then Ctrl-C
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Fields that exist on every Tina document, not in the collection's own list.
const BUILTINS = new Set(['__typename', 'id', '_sys', '_values']);

/** Collect {field, nested-object fields} for one collection in the lock. */
const collectionShape = (collection) => {
  const walk = (fields) => {
    const map = new Map();
    for (const field of fields ?? []) {
      map.set(field.name, field.fields ? walk(field.fields) : null);
    }
    return map;
  };
  return walk(collection.fields);
};

/**
 * Pull selected field names out of a GraphQL fragment body, keeping nesting.
 * The fragments here are flat enough that a brace-depth scan beats a parser.
 */
const parseSelection = (body) => {
  const tokens = body.match(/[A-Za-z_][A-Za-z0-9_]*|\{|\}/g) ?? [];
  const root = new Map();
  const stack = [root];
  let pending = null;
  for (const token of tokens) {
    if (token === '{') {
      const child = new Map();
      if (pending) stack[stack.length - 1].set(pending, child);
      stack.push(child);
      pending = null;
    } else if (token === '}') {
      // Flush before popping: the last field in a block is still pending when
      // its closing brace arrives, and dropping it hides a real mismatch.
      if (pending) stack[stack.length - 1].set(pending, null);
      stack.pop();
      pending = null;
    } else {
      if (pending) stack[stack.length - 1].set(pending, null);
      pending = token;
    }
  }
  if (pending) stack[stack.length - 1].set(pending, null);
  return root;
};

const compare = (selection, shape, path, errors, notices) => {
  for (const [name, children] of selection) {
    if (BUILTINS.has(name)) continue;
    const here = [...path, name].join('.');
    if (!shape || !shape.has(name)) {
      errors.push(here);
      continue;
    }
    const childShape = shape.get(name);
    if (children) compare(children, childShape, [...path, name], errors, notices);
  }
  for (const name of shape?.keys() ?? []) {
    if (selection.has(name)) continue;
    notices.push([...path, name].join('.'));
  }
};

const lock = JSON.parse(await readFile(join(ROOT, 'tina/tina-lock.json'), 'utf8'));
const source = await readFile(join(ROOT, 'src/lib/tina-visual-editing.ts'), 'utf8');

// fragment <Name> on <Type> { ... } — match to the closing backtick of the
// template literal, which is always the line after the fragment's final brace.
const fragments = [...source.matchAll(/fragment\s+\w+\s+on\s+(\w+)\s*\{([\s\S]*?)\n\}`/g)];
if (fragments.length === 0) {
  console.error('check-tina-fragment: no fragments found — did the file move?');
  process.exit(1);
}

let failed = false;
for (const [, typeName, body] of fragments) {
  const collection = lock.schema.collections.find(
    (c) => c.name.toLowerCase() === typeName.toLowerCase(),
  );
  if (!collection) {
    console.error(`✗ fragment targets "${typeName}" — no such collection in tina-lock.json`);
    failed = true;
    continue;
  }
  const errors = [];
  const notices = [];
  compare(parseSelection(body), collectionShape(collection), [typeName], errors, notices);

  if (errors.length > 0) {
    failed = true;
    console.error(`✗ ${typeName}: fragment selects ${errors.length} field(s) the schema does not have:`);
    for (const field of errors) console.error(`    ${field}`);
    console.error('  This is what makes /admin/ show "Unexpected Error".');
    console.error('  Either the field was renamed in tina/config.ts, or tina-lock.json is stale:');
    console.error('    set -a && source .env.local && set +a && npx tinacms dev   # ~10s, then Ctrl-C');
  } else {
    console.log(`✓ ${typeName}: every selected field exists in the schema`);
  }
  if (notices.length > 0) {
    console.log(`  note — not selected, so not click-to-edit: ${notices.join(', ')}`);
  }
}

process.exit(failed ? 1 : 0);
