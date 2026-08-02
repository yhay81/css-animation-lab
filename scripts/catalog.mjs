import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const PREDICTIONS = new Set(['good', 'uncertain', 'bad']);
export const MODES = new Set(['keyframes', 'state', 'scroll', 'interactive']);
export const VERDICT_STATES = new Set(['pass', 'veto', 'flag', 'star']);

const isStringArray = (value) =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

export function validateMeta(meta, directory) {
  const errors = [];
  const need = (ok, message) => { if (!ok) errors.push(message); };

  need(meta && typeof meta === 'object' && !Array.isArray(meta), 'JSON object が必要');
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return errors;

  need(meta.id === directory, `id はディレクトリ名 ${directory} と一致させる`);
  need(Number.isInteger(meta.n) && meta.n >= 0, 'n は 0 以上の整数にする');
  need(typeof meta.title === 'string' && meta.title.trim(), 'title が必要');
  need(typeof meta.note === 'string' && meta.note.trim(), 'note が必要');
  need(PREDICTIONS.has(meta.predicted), 'predicted は good / uncertain / bad のいずれか');
  need(MODES.has(meta.mode ?? 'keyframes'), 'mode は keyframes / state / scroll / interactive のいずれか');
  need(meta.axes && typeof meta.axes === 'object' && !Array.isArray(meta.axes), 'axes が必要');

  const axes = meta.axes ?? {};
  need(isStringArray(axes.driver) && axes.driver.length > 0, 'axes.driver は空でない文字列配列にする');

  if (String(meta.layer).startsWith('L')) {
    for (const key of ['target', 'timing', 'orchestration', 'structure']) {
      need(isStringArray(axes[key]), `基礎層では axes.${key} を文字列配列にする`);
    }
  } else {
    need(isStringArray(axes.technique) && axes.technique.length > 0,
      'T/E 層では axes.technique を空でない文字列配列にする');
    need(typeof axes.use === 'string' && axes.use.trim(), 'T/E 層では axes.use が必要');
  }

  if (meta.layer === 'E') {
    need(typeof axes.origin === 'string' && axes.origin.trim(), 'E 層では axes.origin が必要');
  }

  if (meta.markup !== undefined) need(typeof meta.markup === 'string', 'markup は文字列にする');
  if (meta.expect !== undefined) need(Array.isArray(meta.expect), 'expect は配列にする');
  return errors;
}

export async function loadCatalog(root, { readCss = false } = {}) {
  const experimentsDir = join(root, 'experiments');
  const entries = (await readdir(experimentsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory());
  const items = [];
  const errors = [];

  for (const entry of entries) {
    const dir = join(experimentsDir, entry.name);
    let meta;
    try {
      meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'));
    } catch (error) {
      errors.push(`${entry.name}/meta.json: ${error.message}`);
      continue;
    }

    for (const error of validateMeta(meta, entry.name)) {
      errors.push(`${entry.name}/meta.json: ${error}`);
    }

    try {
      const css = await readFile(join(dir, 'anim.css'), 'utf8');
      if (!css.includes(`[data-exp="${entry.name}"]`)) {
        errors.push(`${entry.name}/anim.css: [data-exp="${entry.name}"] でスコープされていない`);
      }
      if (readCss) meta.css = css;
    } catch (error) {
      errors.push(`${entry.name}/anim.css: ${error.message}`);
    }
    items.push(meta);
  }

  const byId = new Map();
  const byNumber = new Map();
  for (const item of items) {
    if (byId.has(item.id)) errors.push(`id ${item.id} が重複`);
    if (byNumber.has(item.n)) errors.push(`n ${item.n} が ${byNumber.get(item.n)} と ${item.id} で重複`);
    byId.set(item.id, true);
    byNumber.set(item.n, item.id);
  }

  return {
    items: items.sort((a, b) => (a.n ?? 0) - (b.n ?? 0)),
    errors,
  };
}

export function normalizeVerdicts(input = {}) {
  const marks = {};
  for (const [id, value] of Object.entries(input.marks ?? {})) {
    if (typeof value === 'string') {
      marks[id] = { state: value, context: null, updatedAt: input.updatedAt ?? null };
    } else if (value && typeof value === 'object') {
      marks[id] = {
        state: value.state,
        context: value.context ?? null,
        updatedAt: value.updatedAt ?? input.updatedAt ?? null,
      };
    }
  }
  return {
    version: 2,
    defaultState: input.defaultState ?? 'pass',
    marks,
    settings: input.settings ?? {},
    updatedAt: input.updatedAt ?? null,
  };
}

export function validateVerdicts(input, catalogIds) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['JSON object が必要'];
  const data = normalizeVerdicts(input);
  if (input.version !== undefined && input.version !== 2) errors.push('version は 2 にする');
  if (!['pass', 'veto'].includes(data.defaultState)) {
    errors.push('defaultState は pass / veto のいずれか');
  }
  if (input.settings !== undefined && (typeof input.settings !== 'object' || Array.isArray(input.settings))) {
    errors.push('settings は object にする');
  }
  for (const [id, record] of Object.entries(data.marks)) {
    if (!catalogIds.has(id)) errors.push(`未知の実験 id: ${id}`);
    if (!VERDICT_STATES.has(record.state)) errors.push(`${id}: 不正な state ${record.state}`);
    if (record.context !== null && (typeof record.context !== 'object' || Array.isArray(record.context))) {
      errors.push(`${id}: context は object または null にする`);
    }
    if (record.context) {
      if (typeof record.context.easing !== 'string') errors.push(`${id}: context.easing は文字列にする`);
      if (typeof record.context.substrate !== 'string') errors.push(`${id}: context.substrate は文字列にする`);
      if (!(Number.isFinite(record.context.cycleMs) && record.context.cycleMs > 0)) {
        errors.push(`${id}: context.cycleMs は正数にする`);
      }
      if (typeof record.context.hold !== 'boolean') errors.push(`${id}: context.hold は boolean にする`);
    }
  }
  return errors;
}
