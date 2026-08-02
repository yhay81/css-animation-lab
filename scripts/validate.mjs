import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadCatalog, validateVerdicts } from './catalog.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { items, errors } = await loadCatalog(ROOT);

let verdicts;
try {
  verdicts = JSON.parse(await readFile(new URL('../verdicts.json', import.meta.url), 'utf8'));
} catch (error) {
  errors.push(`verdicts.json: ${error.message}`);
}

if (verdicts) {
  errors.push(...validateVerdicts(verdicts, new Set(items.map((item) => item.id)))
    .map((error) => `verdicts.json: ${error}`));
}

try {
  const support = JSON.parse(await readFile(new URL('../browser-support.json', import.meta.url), 'utf8'));
  if (!Array.isArray(support.features) || !support.features.length) {
    errors.push('browser-support.json: features が必要');
  }
  if (!Array.isArray(support.runs) || !support.runs.length) {
    errors.push('browser-support.json: runs が必要');
  } else {
    for (const run of support.runs) {
      if (run.verification?.total !== items.length) {
        errors.push(`browser-support.json: ${run.browser} の total が ${items.length} ではない`);
      }
      for (const feature of support.features ?? []) {
        if (typeof run.features?.[feature] !== 'boolean') {
          errors.push(`browser-support.json: ${run.browser} の ${feature} が boolean ではない`);
        }
      }
    }
  }
} catch (error) {
  errors.push(`browser-support.json: ${error.message}`);
}

if (errors.length) {
  console.error(`validation failed (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const modes = Object.groupBy(items, (item) => item.mode ?? 'keyframes');
  console.log(
    `validation passed: ${items.length} experiments ` +
    `(${Object.entries(modes).map(([mode, rows]) => `${mode} ${rows.length}`).join(', ')})`,
  );
}
