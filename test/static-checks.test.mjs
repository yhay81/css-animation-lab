import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../scripts/catalog.mjs';
import { HARNESS_CLASSES, staticChecks } from '../scripts/checks/static.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('checked-in experiments raise no static findings', async () => {
  const { items, errors } = await loadCatalog(ROOT, { readCss: true });
  assert.deepEqual(errors, []);

  const found = items.flatMap((item) => staticChecks(item, item.css));
  assert.deepEqual(
    found.map((f) => `${f.id}: ${f.rule} — ${f.msg}`),
    [],
    'カタログは無指摘であるべき。ここが増えたら実験か規則のどちらかが壊れている。',
  );
});

/**
 * 規則が「動いていること」を確かめる。
 * 無指摘のカタログだけでは、検査が常に空を返していても気づけない。
 */
const CASES = [
  {
    rule: '名前衝突',
    item: { id: 'x', markup: '<div class="mark"></div>' },
    css: '[data-exp="x"] .mark { opacity: 0 }',
  },
  {
    rule: '未登録の変数',
    item: { id: 'x', markup: '' },
    css: [
      '[data-exp="x"] span { --i: sibling-index(); }',
      '[data-exp="x"] em { translate: calc(var(--i) * 4px); }',
    ].join('\n'),
  },
  {
    rule: 'd は path 限定',
    item: { id: 'x', markup: '<svg><circle/></svg>' },
    css: '[data-exp="x"] circle { d: path("M0 0 L1 1"); }',
  },
  {
    rule: '静的な値が食われる',
    item: { id: 'x', markup: '' },
    css: [
      '@keyframes spin {',
      '  from { rotate: 0deg }',
      '  to { rotate: 360deg }',
      '}',
      '[data-exp="x"] .subject { animation-name: spin; rotate: 45deg; }',
    ].join('\n'),
  },
  {
    rule: '面積ゼロの切り抜き',
    item: { id: 'x', markup: '' },
    // 頂点が一直線。エラーにはならず、その要素だけが黙って消える。
    css: '[data-exp="x"] .subject { clip-path: polygon(0% 0%, 50% 50%, 100% 100%); }',
  },
  {
    rule: '破線の座標系',
    item: { id: 'x', markup: '<svg><path pathLength="100" style="vector-effect:non-scaling-stroke"/></svg>' },
    css: '[data-exp="x"] path { stroke-dasharray: 100; }',
  },
  {
    rule: '裏面の非対称な指定',
    item: { id: 'x', markup: '' },
    css: '[data-exp="x"] .back { transform: rotateY(180deg); border-radius: 12px 0 0 12px; }',
  },
  {
    rule: '余白の相殺',
    item: { id: 'x', markup: '' },
    css: '[data-exp="x"] .seg .seg { margin-top: 12px; }',
  },
];

for (const { rule, item, css } of CASES) {
  test(`static check fires: ${rule}`, () => {
    const found = staticChecks(item, css, HARNESS_CLASSES);
    assert.ok(
      found.some((f) => f.rule === rule),
      `${rule} を検出できていない。得られた指摘: ${JSON.stringify(found.map((f) => f.rule))}`,
    );
  });
}

test('clean css raises nothing', () => {
  const css = [
    '@keyframes rise {',
    '  from { translate: 0 12px; opacity: 0 }',
    '  to { translate: 0 0; opacity: 1 }',
    '}',
    '[data-exp="x"] .subject { animation-name: rise; }',
  ].join('\n');
  assert.deepEqual(staticChecks({ id: 'x', markup: '' }, css), []);
});
