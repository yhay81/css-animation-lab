import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadContributions, summarize, tally } from '../scripts/merge-verdicts.mjs';

const ITEMS = [
  { id: 'fade', title: 'フェード' },
  { id: 'rise', title: '立ち上がり' },
  { id: 'spin', title: '回転' },
  { id: 'unseen', title: '誰も見ていない' },
];

const contribution = (by, marks) => ({
  by,
  verdicts: {
    version: 2,
    defaultState: 'pass',
    marks: Object.fromEntries(
      Object.entries(marks).map(([id, state]) => [id, { state, context: null, updatedAt: null }]),
    ),
    settings: {},
    updatedAt: null,
  },
});

test('tally separates unanimous from contested experiments', () => {
  const rows = tally([
    contribution('a', { fade: 'star', rise: 'pass', spin: 'veto' }),
    contribution('b', { fade: 'star', rise: 'veto', spin: 'veto' }),
    contribution('c', { fade: 'star', rise: 'flag', spin: 'veto' }),
  ], ITEMS);

  const by = Object.fromEntries(rows.map((row) => [row.id, row]));

  // 全員一致。もう見なくていい。
  assert.equal(by.fade.agreement, 1);
  assert.equal(by.fade.contested, false);
  assert.equal(by.fade.majority, 'star');

  // 3 人が別々の判定。ここに基準が埋まっている。
  assert.equal(by.rise.votes, 3);
  assert.ok(by.rise.agreement < 0.75);
  assert.equal(by.rise.contested, true);

  assert.equal(by.spin.agreement, 1);
  assert.equal(by.spin.majority, 'veto');

  // 誰も判定していない実験は行に現れない。
  assert.equal(by.unseen, undefined);

  // 割れているものが先に来る。見るべき順に並べる。
  assert.equal(rows[0].id, 'rise');
});

test('summarize counts what is left to look at', () => {
  const contributions = [
    contribution('a', { fade: 'star', rise: 'pass' }),
    contribution('b', { fade: 'star', rise: 'veto' }),
  ];
  const rows = tally(contributions, ITEMS);
  const summary = summarize(rows, ITEMS, contributions);

  assert.deepEqual(summary.contributors, ['a', 'b']);
  assert.equal(summary.experiments, 4);
  assert.equal(summary.judged, 2);
  assert.equal(summary.unjudged, 2);
  assert.equal(summary.multiplyJudged, 2);
  assert.equal(summary.unanimous, 1);
  assert.equal(summary.contested, 1);
});

test('loadContributions reads one file per person and tolerates an empty directory', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'csslab-verdicts-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  // verdicts/ が無い段階でも落ちない。
  assert.deepEqual(await loadContributions(root), []);

  await mkdir(join(root, 'verdicts'), { recursive: true });
  await writeFile(join(root, 'verdicts', 'alice.json'), JSON.stringify({
    version: 2, marks: { fade: 'star' },
  }));
  // README.md のような JSON でないものは無視する。
  await writeFile(join(root, 'verdicts', 'README.md'), '# 送られた判定\n');

  const contributions = await loadContributions(root);
  assert.equal(contributions.length, 1);
  assert.equal(contributions[0].by, 'alice');
  // 旧形式（文字列）も version 2 に正規化される。
  assert.equal(contributions[0].verdicts.marks.fade.state, 'star');
});
