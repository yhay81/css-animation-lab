import {
  API, EASINGS, SUBSTRATES, DUR, loadCatalog, loadConfig, injectStyles, buildCell,
  createClock, setEasing, reportFailures, showFatal,
} from './lab.js';

reportFailures();

const $ = (selector) => document.querySelector(selector);
const grid = $('#grid');
const veil = $('#veil');
const savedEl = $('#saved');
const exportEl = $('#export-verdicts');
const empty = $('#empty');

const [items, storedRaw, config] = await Promise.all([
  loadCatalog(),
  fetch(API.verdicts).then((res) => {
    if (!res.ok) throw new Error(`判定を取得できません（HTTP ${res.status}）`);
    return res.json();
  }),
  loadConfig(),
  injectStyles(),
]);

function normalizeStored(input = {}) {
  const normalized = {};
  for (const [id, value] of Object.entries(input.marks ?? {})) {
    normalized[id] = typeof value === 'string'
      ? { state: value, context: null, updatedAt: input.updatedAt ?? null }
      : value;
  }
  return {
    defaultState: input.defaultState ?? 'pass',
    marks: normalized,
    settings: input.settings ?? {},
  };
}

/**
 * 判定の保存先は2通りある。
 *
 * 開発サーバーでは verdicts.json へそのまま書き戻すので、
 * 「配布されている判定」と「自分の判定」は同じ 1 つのものになる。
 *
 * 公開サイトでは書き戻せない。自分の判定は端末内にだけ持ち、
 * 配布されている判定の上に重ねて表示する。書き出すのは自分の判定だけで、
 * それがそのまま verdicts/<名前>.json として送れる形になる。
 */
const LOCAL_KEY = 'css-animation-lab:verdicts:v2';

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const stored = normalizeStored(storedRaw);
const baseMarks = stored.marks;
const localRaw = config.readonly ? readLocal() : null;
const local = localRaw ? normalizeStored(localRaw) : null;

let defaultState = local?.defaultState ?? stored.defaultState;
let marks = config.readonly ? (local?.marks ?? {}) : baseMarks;
const initialSettings = { ...stored.settings, ...(local?.settings ?? {}) };

/** 表示に使う判定。自分の判定が無ければ、配布されている判定を引き継ぐ。 */
const recordFor = (item) => marks[item.id] ?? (config.readonly ? baseMarks[item.id] : undefined);

const cells = new Map();
for (const item of items) {
  const cell = buildCell(item);
  cell.querySelector('figcaption').insertAdjacentHTML('afterend',
    `<div class="note">${item.note ?? ''}</div>`);
  cell.insertAdjacentHTML('afterbegin', `
    <div class="cell-actions" aria-label="${item.id} の判定">
      <button type="button" data-mark="pass" title="採用" aria-label="採用">✓</button>
      <button type="button" data-mark="veto" title="却下" aria-label="却下">×</button>
      <button type="button" data-mark="flag" title="気になる" aria-label="気になる">?</button>
      <button type="button" data-mark="star" title="手本" aria-label="手本">◎</button>
      <button type="button" data-mark="clear" title="判定を取り消す" aria-label="判定を取り消す">↶</button>
    </div>`);
  grid.append(cell);
  cells.set(item.id, cell);
}

const easeSel = $('#ease');
const subSel = $('#substrate');
const speed = $('#speed');
const speedOut = $('#speed-out');
const scrub = $('#scrub');
const playBtn = $('#play');
const hold = $('#hold');

function addOptions(select, rows, allLabel) {
  select.replaceChildren();
  if (allLabel) select.append(new Option(allLabel, ''));
  for (const row of rows) select.append(new Option(row.label, row.value));
}

addOptions(easeSel, EASINGS.map((entry) => ({ label: entry.label, value: entry.id })));
addOptions(subSel, SUBSTRATES.map((entry) => ({ label: entry.label, value: entry.id })));

easeSel.value = initialSettings.easing ?? 'linear';
subSel.value = initialSettings.substrate ?? 'gradient';
speed.value = String(initialSettings.cycleMs ?? DUR);
hold.checked = Boolean(initialSettings.hold);

const clock = createClock({ onTick: (t) => { if (!scrubbing) scrub.value = Math.round(t); } });
window.__clock = clock;
clock.cycleMs = Number(speed.value);
clock.restMs = hold.checked ? 450 : 0;

function applyEase() {
  const easing = EASINGS.find((entry) => entry.id === easeSel.value) ?? EASINGS[0];
  setEasing(document.documentElement, easing.value);
}
function applySubstrate() { document.documentElement.dataset.substrate = subSel.value; }
function applySpeed() {
  clock.cycleMs = Number(speed.value);
  speedOut.textContent = `×${(clock.cycleMs / DUR).toFixed(1)}`;
}
applyEase();
applySubstrate();
applySpeed();

function settingsSnapshot() {
  return {
    easing: easeSel.value,
    substrate: subSel.value,
    cycleMs: clock.cycleMs,
    hold: hold.checked,
  };
}

function contextSnapshot() {
  return {
    ...settingsSnapshot(),
    browser: navigator.userAgent,
    viewport: `${innerWidth}x${innerHeight}`,
  };
}

let saveTimer;
let changeRevision = 0;
let savedRevision = 0;
let saving = false;

function savePayload() {
  return {
    version: 2,
    defaultState,
    marks,
    settings: settingsSnapshot(),
    updatedAt: new Date().toISOString(),
  };
}

async function persist({ keepalive = false } = {}) {
  clearTimeout(saveTimer);
  if (saving) return;
  saving = true;
  savedEl.dataset.error = 'false';
  savedEl.textContent = '保存中…';
  try {
    if (config.readonly) {
      const revision = changeRevision;
      localStorage.setItem(LOCAL_KEY, JSON.stringify(savePayload()));
      savedRevision = Math.max(savedRevision, revision);
      savedEl.removeAttribute('title');
      savedEl.textContent = 'この端末に保存';
      return;
    }
    while (savedRevision < changeRevision) {
      const revision = changeRevision;
      const res = await fetch(API.verdicts, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(savePayload()),
        keepalive,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      savedRevision = Math.max(savedRevision, revision);
    }
    savedEl.removeAttribute('title');
    savedEl.textContent = '保存済み';
  } catch (error) {
    savedEl.dataset.error = 'true';
    savedEl.textContent = '保存失敗';
    savedEl.title = `クリックして再試行: ${error.message}`;
  } finally {
    saving = false;
  }
}

function queueSave() {
  clearTimeout(saveTimer);
  changeRevision++;
  savedEl.dataset.error = 'false';
  savedEl.textContent = '未保存';
  saveTimer = setTimeout(() => persist(), 400);
}

savedEl.addEventListener('click', () => { if (savedRevision < changeRevision) persist(); });
addEventListener('pagehide', () => {
  if (savedRevision >= changeRevision) return;
  clearTimeout(saveTimer);
  // 端末内保存は同期なので、離脱時でもそのまま書ける。書き戻し先があるときだけ beacon を使う。
  if (config.readonly) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(savePayload())); } catch { /* 容量超過 */ }
    return;
  }
  navigator.sendBeacon(API.verdicts, new Blob([JSON.stringify(savePayload())], { type: 'application/json' }));
});

/**
 * 判定の書き出し。公開サイトで付けた判定は端末内にしか無いので、
 * ここから出して verdicts/<名前>.json として送ってもらう。
 */
exportEl.hidden = !config.readonly;
exportEl.addEventListener('click', () => {
  const payload = { ...savePayload(), catalogVersion: items.length };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = 'my-verdicts.json';
  link.click();
  URL.revokeObjectURL(href);
});

const MARK_CHAR = { pass: '✓', veto: '✕', flag: '★?', star: '◎' };
const MARK_LABEL = { pass: '採用', veto: '却下', flag: '気になる', star: '手本' };

function effectiveState(item) {
  const record = recordFor(item);
  if (record?.state) return record.state;
  if (item.predicted === 'bad') return 'veto';
  return defaultState;
}

const filter = {
  query: $('#query'),
  layer: $('#layer'),
  mode: $('#filter-mode'),
  prediction: $('#prediction'),
  verdict: $('#verdict'),
  axis: $('#axis'),
};

const uniq = (values) => [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ja'));
addOptions(filter.layer, uniq(items.map((item) => item.layer)).map((value) => ({ label: `層: ${value}`, value })), 'すべての層');
addOptions(filter.mode, [
  { label: '駆動: keyframes', value: 'keyframes' },
  { label: '駆動: state', value: 'state' },
  { label: '駆動: scroll', value: 'scroll' },
  { label: '駆動: interactive', value: 'interactive' },
], 'すべての駆動');
addOptions(filter.prediction, [
  { label: '予測: good', value: 'good' },
  { label: '予測: uncertain', value: 'uncertain' },
  { label: '予測: bad', value: 'bad' },
], 'すべての予測');
addOptions(filter.verdict, [
  { label: '判定: 要判断', value: 'todo' },
  { label: '判定: 未評価', value: 'unreviewed' },
  { label: '判定: 採用', value: 'pass' },
  { label: '判定: 却下', value: 'veto' },
  { label: '判定: 気になる', value: 'flag' },
  { label: '判定: 手本', value: 'star' },
], 'すべての判定');

const AXIS_LABEL = {
  driver: '駆動', target: '対象', timing: '時間', orchestration: '編成',
  structure: '構造', technique: '技法', use: '用途', origin: '由来',
};
const axisRows = [];
for (const item of items) {
  for (const [key, value] of Object.entries(item.axes ?? {})) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      axisRows.push({ label: `${AXIS_LABEL[key] ?? key}: ${entry}`, value: `${key}\u001f${entry}` });
    }
  }
}
const axisByValue = new Map(axisRows.map((row) => [row.value, row]));
addOptions(filter.axis, [...axisByValue.values()].sort((a, b) => a.label.localeCompare(b.label, 'ja')), 'すべての索引軸');

let shownItems = [...items];

function matchesFilters(item) {
  const mode = item.mode ?? 'keyframes';
  const record = recordFor(item);
  const state = effectiveState(item);
  const query = filter.query.value.trim().toLocaleLowerCase('ja');
  if (query) {
    // 英語でも引けるようにする。カタログには title_en / note_en が入っている。
    const haystack = [
      item.id, item.title, item.note, item.title_en, item.note_en,
      ...Object.values(item.axes ?? {}).flat(),
    ].filter(Boolean).join(' ').toLocaleLowerCase('ja');
    if (!haystack.includes(query)) return false;
  }
  if (filter.layer.value && item.layer !== filter.layer.value) return false;
  if (filter.mode.value && mode !== filter.mode.value) return false;
  if (filter.prediction.value && item.predicted !== filter.prediction.value) return false;
  if (filter.verdict.value === 'todo' && !(item.predicted === 'uncertain' && !record)) return false;
  if (filter.verdict.value === 'unreviewed' && record) return false;
  if (['pass', 'veto', 'flag', 'star'].includes(filter.verdict.value) && state !== filter.verdict.value) return false;
  if (filter.axis.value) {
    const [key, expected] = filter.axis.value.split('\u001f');
    const actual = item.axes?.[key];
    if (!(Array.isArray(actual) ? actual.includes(expected) : actual === expected)) return false;
  }
  return true;
}

function applyFilters() {
  shownItems = items.filter(matchesFilters);
  const visible = new Set(shownItems.map((item) => item.id));
  for (const [id, cell] of cells) cell.hidden = !visible.has(id);
  $('#shown-count').textContent = shownItems.length;
  empty.hidden = shownItems.length > 0;
}

function render() {
  let todo = 0;
  let veto = 0;
  let flag = 0;
  let star = 0;
  for (const item of items) {
    const record = recordFor(item);
    const state = effectiveState(item);
    const cell = cells.get(item.id);
    // 自分で付けたのか、配布された判定を引き継いでいるのかを見分けられるようにする。
    const reviewSource = marks[item.id] ? 'explicit'
      : record ? 'inherited'
        : item.predicted === 'bad' ? 'predicted' : 'default';
    cell.dataset.state = state;
    cell.dataset.review = reviewSource;
    const markEl = cell.querySelector('.mark');
    markEl.textContent = record ? MARK_CHAR[state] : item.predicted === 'bad' ? '×予測' : '';
    markEl.setAttribute('aria-label', record ? `判定: ${MARK_LABEL[state]}` : item.predicted === 'bad' ? '事前予測: bad' : '未評価');
    if (item.predicted === 'uncertain' && !record) todo++;
    if (state === 'veto') veto++;
    if (state === 'flag') flag++;
    if (state === 'star') star++;
  }
  $('#c-todo').textContent = todo;
  $('#c-veto').textContent = veto;
  $('#c-flag').textContent = flag;
  $('#c-star').textContent = star;
  $('#mode').textContent = defaultState === 'veto' ? '既定＝却下（拾い上げモード）' : '';
  applyFilters();
}

function mark(cell, state) {
  const id = cell.dataset.exp;
  if (state === null || state === 'clear') delete marks[id];
  else marks[id] = { state, context: contextSnapshot(), updatedAt: new Date().toISOString() };
  render();
  queueSave();
}

for (const control of Object.values(filter)) control.addEventListener('input', applyFilters);
$('#clear-filters').addEventListener('click', () => {
  for (const control of Object.values(filter)) control.value = '';
  applyFilters();
  filter.query.focus();
});
$('#total-count').textContent = items.length;

let scrubbing = false;
scrub.addEventListener('pointerdown', () => { scrubbing = true; clock.playing = false; updatePlayButton(); });
scrub.addEventListener('pointerup', () => { scrubbing = false; });
scrub.addEventListener('input', () => clock.seek(Number(scrub.value)));

function updatePlayButton() {
  playBtn.textContent = clock.playing ? '⏸' : '▶';
  playBtn.setAttribute('aria-label', clock.playing ? '一時停止' : '再生');
}
playBtn.addEventListener('click', () => { clock.toggle(); updatePlayButton(); });
easeSel.addEventListener('change', () => { applyEase(); queueSave(); });
subSel.addEventListener('change', () => { applySubstrate(); queueSave(); });
speed.addEventListener('input', applySpeed);
speed.addEventListener('change', queueSave);
hold.addEventListener('change', () => { clock.restMs = hold.checked ? 450 : 0; queueSave(); });

const stateItems = items.filter((item) => item.mode === 'state');
for (const item of stateItems) cells.get(item.id).dataset.open = 'false';
const flip = (item) => {
  const cell = cells.get(item.id);
  cell.dataset.open = cell.dataset.open === 'true' ? 'false' : 'true';
};
setInterval(() => {
  if (!clock.playing) return;
  const viewTransitions = stateItems.filter((item) => item.viewTransition);
  for (const item of stateItems.filter((entry) => !entry.viewTransition)) flip(item);
  if (!viewTransitions.length) return;
  if (document.startViewTransition) document.startViewTransition(() => viewTransitions.forEach(flip));
  else viewTransitions.forEach(flip);
}, 1800);

let focusIdx = 0;
let lastFocus;
function focusCell(index) {
  if (!shownItems.length) return;
  focusIdx = Math.max(0, Math.min(shownItems.length - 1, index));
  cells.get(shownItems[focusIdx].id).focus({ preventScroll: false });
}
function columns() {
  const width = grid.clientWidth - 28;
  return Math.max(1, Math.floor(width / (230 + 14)));
}
function zoomed() { return $('.cell.zoom'); }
function setZoom(cell) {
  const current = zoomed();
  if (current) {
    current.classList.remove('zoom');
    current.removeAttribute('role');
    current.removeAttribute('aria-modal');
    current.setAttribute('aria-expanded', 'false');
  }
  if (cell) {
    lastFocus = document.activeElement;
    cell.classList.add('zoom');
    cell.setAttribute('role', 'dialog');
    cell.setAttribute('aria-modal', 'true');
    cell.setAttribute('aria-expanded', 'true');
    cell.focus();
  } else if (lastFocus?.isConnected) {
    lastFocus.focus();
  }
  veil.hidden = !cell;
}

veil.addEventListener('click', () => setZoom(null));
grid.addEventListener('focusin', (event) => {
  const cell = event.target.closest('.cell');
  if (cell) focusIdx = shownItems.findIndex((item) => item.id === cell.dataset.exp);
});
grid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-mark]');
  if (!button) return;
  const cell = button.closest('.cell');
  mark(cell, button.dataset.mark);
});

addEventListener('keydown', (event) => {
  if (event.target?.matches?.('input, select, button, summary')) return;
  const item = shownItems[focusIdx];
  if (!item) return;
  const cell = cells.get(item.id);
  const key = event.key;
  if (key === 'ArrowRight') focusCell(focusIdx + 1);
  else if (key === 'ArrowLeft') focusCell(focusIdx - 1);
  else if (key === 'ArrowDown') focusCell(focusIdx + columns());
  else if (key === 'ArrowUp') focusCell(focusIdx - columns());
  else if (key === 'p') mark(cell, 'pass');
  else if (key === 'x') mark(cell, 'veto');
  else if (key === 'f') mark(cell, 'flag');
  else if (key === 's') mark(cell, 'star');
  else if (key === 'z') mark(cell, null);
  else if (key === 't') { defaultState = defaultState === 'pass' ? 'veto' : 'pass'; render(); queueSave(); }
  else if (key === 'n') {
    const pending = shownItems.map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.predicted === 'uncertain' && !recordFor(entry));
    const next = pending.find(({ index }) => index > focusIdx) ?? pending[0];
    if (next) focusCell(next.index);
  } else if (key === 'Enter') setZoom(zoomed() ? null : cell);
  else if (key === 'Escape') setZoom(null);
  else if (key === ' ') { clock.toggle(); updatePlayButton(); }
  else if (key === ',') { clock.step(-DUR / 20); updatePlayButton(); }
  else if (key === '.') { clock.step(DUR / 20); updatePlayButton(); }
  else if (key === 'r') clock.seek(0);
  else if (key === 'e') {
    easeSel.selectedIndex = (easeSel.selectedIndex + 1) % EASINGS.length;
    applyEase();
    queueSave();
  } else if (key === 'b') {
    subSel.selectedIndex = (subSel.selectedIndex + 1) % SUBSTRATES.length;
    applySubstrate();
    queueSave();
  } else return;
  event.preventDefault();
});

render();
updatePlayButton();
if (config.readonly) {
  savedEl.textContent = local ? 'この端末に保存' : '読むだけ';
  savedEl.title = '公開サイトでは判定を端末内にだけ保存します。書き出してプルリクエストで送れます。';
} else {
  savedEl.textContent = '保存済み';
}
focusCell(0);

setTimeout(() => {
  if (document.getAnimations().length === 0) {
    savedEl.dataset.error = 'true';
    savedEl.textContent = '駆動失敗';
    showFatal(new Error('CSS アニメーションが生成されていません'));
  }
}, 500);
