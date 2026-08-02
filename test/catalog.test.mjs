import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadCatalog, normalizeVerdicts, validateVerdicts } from '../scripts/catalog.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('catalog is complete and internally consistent', async () => {
  const { items, errors } = await loadCatalog(ROOT);
  assert.deepEqual(errors, []);
  assert.equal(items.length, 211);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  assert.equal(new Set(items.map((item) => item.n)).size, items.length);
});

test('legacy verdicts normalize to version 2', () => {
  const normalized = normalizeVerdicts({
    defaultState: 'pass',
    marks: { fade: 'star' },
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(normalized.version, 2);
  assert.deepEqual(normalized.marks.fade, {
    state: 'star',
    context: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
});

test('checked-in verdicts reference known experiments', async () => {
  const { items } = await loadCatalog(ROOT);
  const verdicts = JSON.parse(await readFile(new URL('../verdicts.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateVerdicts(verdicts, new Set(items.map((item) => item.id))), []);
});

test('verdict validation rejects unknown ids and incomplete context', () => {
  const errors = validateVerdicts({
    version: 2,
    defaultState: 'pass',
    marks: { missing: { state: 'star', context: {} } },
  }, new Set(['fade']));
  assert.ok(errors.some((error) => error.includes('未知の実験 id')));
  assert.ok(errors.some((error) => error.includes('context.cycleMs')));
});
