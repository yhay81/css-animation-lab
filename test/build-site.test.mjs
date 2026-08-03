import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = join(ROOT, 'dist', 'site');

/**
 * 公開サイトはリポジトリからの導出でしかないが、導出の経路が export と別なので
 * 片方にだけ手を入れると気づかないまま食い違う。実際に英語フィールドがこれで落ちた。
 */
test('the built site carries everything the lab needs', async () => {
  await run(process.execPath, [join(ROOT, 'scripts', 'build-site.mjs')]);

  const catalog = JSON.parse(await readFile(join(SITE, 'api', 'catalog.json'), 'utf8'));
  const source = JSON.parse(await readFile(join(ROOT, 'catalog.json'), 'utf8'));
  assert.equal(catalog.length, source.length);

  // 英語で引けること。export だけに翻訳の合流を書くと、ここが静かに落ちる。
  assert.ok(
    catalog.every((item) => item.title_en && item.note_en),
    '公開サイトのカタログにも英語が要る',
  );
  // CSS 本体はサイトに含めない（api/styles.css へ畳んである）。
  assert.ok(catalog.every((item) => item.css === undefined));

  const config = JSON.parse(await readFile(join(SITE, 'api', 'config.json'), 'utf8'));
  assert.equal(config.readonly, true, '公開サイトは判定を書き戻せない');

  const styles = await readFile(join(SITE, 'api', 'styles.css'), 'utf8');
  assert.match(styles, /\[data-exp="fade"\]/);

  const sources = JSON.parse(await readFile(join(SITE, 'api', 'sources.json'), 'utf8'));
  assert.equal(Object.keys(sources).length, source.length);

  // verify.html と lab.js が ../scripts/checks/ を読む。運び忘れると画面が白くなる。
  for (const rel of ['scripts/checks/static.mjs', 'scripts/checks/runtime.mjs', 'lab/lab.js']) {
    await readFile(join(SITE, rel), 'utf8');
  }

  // 入口から評価画面へ辿れること。相対パスなのでサブパス配信でも当たる。
  const index = await readFile(join(SITE, 'index.html'), 'utf8');
  assert.match(index, /href="lab\/contact\.html"/);
});
