import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../scripts/chrome.mjs';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = join(ROOT, 'bin', 'csslab.mjs');

/** 終了コードは CI の判定に使うので、失敗も値として受け取る。 */
async function csslab(args) {
  try {
    const { stdout } = await run(process.execPath, [CLI, ...args], { env: { ...process.env, NO_COLOR: '1' } });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.code, stdout: error.stdout ?? '' };
  }
}

async function withCss(css, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'csslab-test-'));
  try {
    const file = join(dir, 'anim.css');
    await writeFile(file, css);
    return await fn(file, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const EATEN = [
  '@keyframes spin {',
  '  from { rotate: 0deg }',
  '  to { rotate: 360deg }',
  '}',
  '.subject { animation-name: spin; rotate: 45deg; }',
].join('\n');

const CLEAN = [
  '@keyframes rise {',
  '  from { translate: 0 14px; opacity: 0 }',
  '  to { translate: 0 0; opacity: 1 }',
  '}',
  '.subject { animation-name: rise; }',
].join('\n');

test('check exits non-zero on a fail-level finding', async () => {
  await withCss(EATEN, async (file) => {
    const { code, stdout } = await csslab(['check', file]);
    assert.equal(code, 1, '要修正があるときは終了コード 1');
    assert.match(stdout, /静的な値が食われる/);
  });
});

test('check exits zero on clean css', async () => {
  await withCss(CLEAN, async (file) => {
    const { code, stdout } = await csslab(['check', file]);
    assert.equal(code, 0);
    assert.match(stdout, /指摘なし/);
  });
});

test('check --json emits a parseable report', async () => {
  await withCss(EATEN, async (file) => {
    const { stdout } = await csslab(['check', '--json', file]);
    const report = JSON.parse(stdout);
    assert.equal(report.version, 1);
    assert.equal(report.reports.length, 1);
    assert.ok(report.reports[0].findings.some((f) => f.rule === '静的な値が食われる'));
  });
});

test('catalog --json returns catalog entries', async () => {
  const { stdout } = await csslab(['catalog', '--json', '--limit', '3', 'ローディング']);
  const hits = JSON.parse(stdout);
  assert.ok(hits.length > 0 && hits.length <= 3);
  assert.ok(hits.every((item) => item.id && item.layer));
});

test('findings --json returns structured findings', async () => {
  const { stdout } = await csslab(['findings', '--json', 'offset-path']);
  const hits = JSON.parse(stdout);
  assert.ok(hits.length > 0);
  assert.match(hits[0].id, /^F\d+$/);
  assert.ok(hits[0].confidence, '確度は必ず記録されている');
});

/**
 * 実行時の検査は Chrome を借りる。無い環境では飛ばす。
 * 「静的には無傷だが実際には何も起きない」を捕まえられることがこの道具の要点なので、
 * ここが通らないと CLI の存在意義そのものが無くなる。
 */
test('check --runtime catches css that generates no animation', async (t) => {
  try {
    await findChrome();
  } catch {
    t.skip('Chrome が無い環境なので飛ばす');
    return;
  }
  await withCss('.subject { animation-name: doesNotExist; }', async (file) => {
    const { code, stdout } = await csslab(['check', '--runtime', '--json', file]);
    assert.equal(code, 1);
    const report = JSON.parse(stdout).reports[0];
    assert.ok(report.findings.some((f) => f.rule === '動きが無い'));
    assert.equal(report.runtime.animationCount, 0);
  });
});

/**
 * 実験の CSS は [data-exp="<id>"] でスコープされている。
 * 名前をファイル名（anim）から取ると、どのセレクタも当たらず
 * 「動きが無い」と誤って報告される。実際に踏んだ。
 */
test('check resolves the experiment id from its directory, not the filename', async (t) => {
  try {
    await findChrome();
  } catch {
    t.skip('Chrome が無い環境なので飛ばす');
    return;
  }
  const { code, stdout } = await csslab([
    'check', '--runtime', '--json',
    join(ROOT, 'experiments', 'lift', 'anim.css'),
  ]);
  assert.equal(code, 0, `カタログの実験は無指摘であるべき: ${stdout}`);
  const report = JSON.parse(stdout).reports[0];
  assert.equal(report.id, 'lift');
  assert.ok(report.runtime.animationCount > 0, 'アニメーションが検出されている');
  assert.equal(report.runtime.cost, 'paint');
});

test('check --runtime classifies animation cost', async (t) => {
  try {
    await findChrome();
  } catch {
    t.skip('Chrome が無い環境なので飛ばす');
    return;
  }
  await withCss(CLEAN, async (file) => {
    const { code, stdout } = await csslab(['check', '--runtime', '--json', file]);
    assert.equal(code, 0);
    const report = JSON.parse(stdout).reports[0];
    assert.equal(report.runtime.cost, 'compositor');
    assert.deepEqual(report.runtime.properties, ['opacity', 'translate']);
  });
});
