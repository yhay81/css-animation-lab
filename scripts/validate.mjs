import { readFile, readdir } from 'node:fs/promises';
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

const catalogIds = new Set(items.map((item) => item.id));

if (verdicts) {
  errors.push(...validateVerdicts(verdicts, catalogIds).map((error) => `verdicts.json: ${error}`));
}

/*
 * 送られてきた判定も同じ規則で検査する。
 * 形式が揃っていないものが混ざると、割れの集計がそのぶんだけ嘘になる。
 */
try {
  const dir = new URL('../verdicts/', import.meta.url);
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json'));
  for (const name of names) {
    try {
      const raw = JSON.parse(await readFile(new URL(name, dir), 'utf8'));
      errors.push(...validateVerdicts(raw, catalogIds).map((error) => `verdicts/${name}: ${error}`));
    } catch (error) {
      errors.push(`verdicts/${name}: ${error.message}`);
    }
  }
} catch {
  // verdicts/ がまだ無い。誰も送っていないだけなので問題にしない。
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
