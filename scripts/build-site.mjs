/**
 * 公開用の静的サイトを組み立てる。
 *
 * 開発サーバーが動的に返している 4 本の API のうち、判定の書き戻し以外はすべて
 * リポジトリからの純粋な導出でしかない。ビルド時にファイルへ吐けば、
 * サーバーの無い場所でも一覧・ストリップ・検証がそのまま動く。
 *
 * 書き戻しだけは残せない。公開サイトでは api/config.json の readonly を立てて、
 * クライアントに「判定は端末内に持て」と伝える。
 */
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyTranslations, loadCatalog } from './catalog.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = join(ROOT, 'dist', 'site');

const { items, errors } = await loadCatalog(ROOT, { readCss: true });
if (errors.length) throw new Error(errors.join('\n'));
// 公開サイトからも英語で引けるようにする。export と同じものを通す。
await applyTranslations(items, ROOT);

const verdicts = JSON.parse(await readFile(join(ROOT, 'verdicts.json'), 'utf8'));

/** サイトに要るファイルだけを運ぶ。実験ディレクトリは api/ に畳んであるので要らない。 */
const COPY = [
  'lab/common.css',
  'lab/contact.css',
  'lab/contact.html',
  'lab/contact.js',
  'lab/lab.js',
  'lab/strip.html',
  'lab/verify.html',
  // verify.html と lab.js が ../scripts/checks/ を読む。検査は 1 か所にしか置かない。
  'scripts/checks/static.mjs',
  'scripts/checks/runtime.mjs',
];

await rm(SITE, { recursive: true, force: true });
for (const rel of COPY) {
  const to = join(SITE, rel);
  await mkdir(dirname(to), { recursive: true });
  await copyFile(join(ROOT, rel), to);
}

await mkdir(join(SITE, 'api'), { recursive: true });
const write = (rel, body) => writeFile(join(SITE, rel), body);

const catalogItems = items.map(({ css, ...meta }) => meta);
await write('api/catalog.json', `${JSON.stringify(catalogItems)}\n`);
await write('api/sources.json', `${JSON.stringify(Object.fromEntries(items.map((i) => [i.id, i.css])))}\n`);
await write('api/styles.css', `${items.map((i) => `/* ${i.id} */\n${i.css}`).join('\n')}\n`);
await write('api/verdicts.json', `${JSON.stringify(verdicts, null, 2)}\n`);
await write('api/config.json', `${JSON.stringify({
  readonly: true,
  source: 'static-site',
  repository: 'https://github.com/yhay81/css-animation-lab',
}, null, 2)}\n`);

/* ───────────────────────── 見つからなかったとき ───────────────────────── */

/**
 * 素の 404 を返すと、配信が壊れているのか URL が違うだけなのかが読む側に分からない。
 * wrangler.toml の not_found_handling がこれを返す。
 */
await write('404.html', `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>見つかりません — css-animation-lab</title>
<style>
  body {
    margin: 0; min-height: 100dvh; display: grid; place-items: center;
    background: #0b1020; color: #e6e9f5;
    font: 15px/1.9 ui-sans-serif, system-ui, sans-serif;
  }
  main { max-width: 32rem; padding: 24px; text-align: center }
  h1 { font-size: 20px; margin: 0 0 8px }
  p { margin: 0 0 20px; color: #8b93b5 }
  a { color: #7dd3fc }
  nav { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap }
</style>
</head>
<body>
<main>
  <h1>そのページはありません</h1>
  <p>URL が変わったか、もともと無かったかのどちらかです。</p>
  <nav>
    <a href="/">入口</a>
    <a href="/lab/contact.html">一覧・評価</a>
    <a href="/lab/strip.html">ストリップ</a>
    <a href="/lab/verify.html">検証</a>
  </nav>
</main>
</body>
</html>
`);

/* ───────────────────────── 入口 ───────────────────────── */

const count = (fn) => items.filter(fn).length;
const layers = [...new Set(items.map((i) => i.layer))].sort();
const stats = {
  total: items.length,
  keyframes: count((i) => !i.mode),
  state: count((i) => i.mode === 'state'),
  scroll: count((i) => i.mode === 'scroll'),
  interactive: count((i) => i.mode === 'interactive'),
  star: Object.values(verdicts.marks ?? {}).filter((m) => (m?.state ?? m) === 'star').length,
  judged: Object.keys(verdicts.marks ?? {}).length,
};

const findingsCount = (await readFile(join(ROOT, 'FINDINGS.md'), 'utf8'))
  .match(/^## F\d+/gm)?.length ?? 0;

const escape = (value) => String(value).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const layerRows = layers.map((layer) =>
  `<tr><td><code>${escape(layer)}</code></td><td>${count((i) => i.layer === layer)}</td></tr>`).join('');

await write('index.html', `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>css-animation-lab — CSS アニメーションの研究環境</title>
<meta name="description" content="CSS アニメーション ${stats.total} 件の実験と ${findingsCount} 件の知見。効いたことと同じだけ、効かなかったことを残す。">
<style>
  :root {
    --bg: #0b1020; --panel: #151a2e; --line: #2a3150;
    --fg: #e6e9f5; --muted: #8b93b5; --accent: #7dd3fc;
  }
  * { box-sizing: border-box }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 15px/1.9 ui-sans-serif, system-ui, sans-serif;
  }
  main { max-width: 760px; margin: 0 auto; padding: 56px 20px 80px }
  h1 { font-size: 28px; margin: 0 0 6px; letter-spacing: .01em }
  .lede { color: var(--muted); margin: 0 0 36px }
  h2 { font-size: 15px; margin: 40px 0 12px; padding-top: 20px; border-top: 1px solid var(--line) }
  p { margin: 0 0 14px }
  a { color: var(--accent) }
  code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: .92em; color: var(--muted) }
  .tools { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)) }
  .tool {
    display: block; padding: 14px 16px; border: 1px solid var(--line);
    border-radius: 10px; background: var(--panel); text-decoration: none; color: var(--fg);
  }
  .tool:hover, .tool:focus-visible { border-color: var(--accent) }
  .tool b { display: block; margin-bottom: 3px }
  .tool span { color: var(--muted); font-size: 13px; line-height: 1.6; display: block }
  table { border-collapse: collapse; width: 100%; font-size: 14px }
  td, th { padding: 5px 10px; border-bottom: 1px solid var(--line); text-align: left }
  th { color: var(--muted); font-weight: 600 }
  td + td, th + th { text-align: right; font-variant-numeric: tabular-nums }
  .note { color: var(--muted); font-size: 13px }
  ul { padding-left: 1.2em; margin: 0 0 14px }
  li { margin-bottom: 6px }
</style>
</head>
<body>
<main>
  <h1>css-animation-lab</h1>
  <p class="lede">
    CSS アニメーションの表現範囲を、実験・機械検証・比較評価の反復で体系化する研究環境。
    依存パッケージもビルド工程も持たない。
  </p>

  <div class="tools">
    <a class="tool" href="lab/contact.html">
      <b>一覧・評価</b>
      <span>${stats.total} 件を同位相で並べて比較する。絞り込みと判定つき</span>
    </a>
    <a class="tool" href="lab/strip.html">
      <b>フィルムストリップ</b>
      <span>動きを静止画の連番に展開して、再生せずに読む</span>
    </a>
    <a class="tool" href="lab/verify.html">
      <b>検証</b>
      <span>静的・実行時の検査と負荷分類をこのブラウザで実行する</span>
    </a>
  </div>

  <h2>この場所が扱っている問題</h2>
  <p>
    CSS アニメーションは、生成するより<strong>判断するほうが高くつく</strong>。
    書けば動くが、動いたものが良いかどうかは見るまで分からない。
    AI が大量に書けるようになったいま、詰まるのは生成側ではなく、
    人間が動きを見て判断する時間のほうになった。
  </p>
  <p>
    そこで評価を 3 層に分けている。機械にできることは機械に寄せ、
    人間の時間は「気持ちよさ」の判断だけに使う。
  </p>
  <table>
    <tr><th>層</th><th style="text-align:left">判定内容</th></tr>
    <tr><td>機械検証</td><td style="text-align:left">ファイル整合性、動きの有無、意図との不一致、負荷候補</td></tr>
    <tr><td>フィルムストリップ</td><td style="text-align:left">軌跡、行き過ぎ、到達の早さ</td></tr>
    <tr><td>感性</td><td style="text-align:left">気持ちよさ、上品さ、場面との相性 — ここだけが人間</td></tr>
  </table>

  <h2>現在地</h2>
  <table>
    <tr><th>項目</th><th>件数</th></tr>
    <tr><td>実験</td><td>${stats.total}</td></tr>
    <tr><td><code>keyframes</code> 駆動</td><td>${stats.keyframes}</td></tr>
    <tr><td><code>state</code> 駆動</td><td>${stats.state}</td></tr>
    <tr><td><code>scroll</code> 駆動</td><td>${stats.scroll}</td></tr>
    <tr><td><code>interactive</code> 駆動</td><td>${stats.interactive}</td></tr>
    <tr><td>知見</td><td>${findingsCount}</td></tr>
    <tr><td>人手判定済み</td><td>${stats.judged}</td></tr>
  </table>
  <p class="note">層の内訳</p>
  <table><tr><th>層</th><th>件数</th></tr>${layerRows}</table>

  <h2>判定に参加する</h2>
  <p>
    このページは読み取り専用で配信されている。判定は<strong>この端末の中にだけ</strong>保存され、
    どこにも送信されない。付けた判定は「判定を書き出す」から JSON で取り出せる。
  </p>
  <p>
    <a href="https://github.com/yhay81/css-animation-lab/blob/main/CONTRIBUTING.md">CONTRIBUTING.md</a>
    の手順でプルリクエストに乗せると、集計に加わる。
    <code>${stats.total}</code> 件を 1 人で見るのは無理だが、
    1 人が 20 件見るなら現実的な量になる。
  </p>

  <h2>成果物</h2>
  <ul>
    <li><a href="api/catalog.json">catalog.json</a> — 全実験を軸で索引した機械可読カタログ</li>
    <li><a href="https://github.com/yhay81/css-animation-lab/blob/main/FINDINGS.md">FINDINGS.md</a> — 効いたこと・効かなかったことの記録（${findingsCount} 件）</li>
    <li><a href="https://github.com/yhay81/css-animation-lab/blob/main/PATTERNS.md">PATTERNS.md</a> — 型ごとの性格（注意度・由来・反復耐性）</li>
    <li><a href="https://github.com/yhay81/css-animation-lab/blob/main/llms.txt">llms.txt</a> — AI に渡すための入口</li>
  </ul>

  <h2>手元で使う</h2>
  <p>
    自分の CSS を検査したい場合は CLI がある。依存パッケージは無い。
  </p>
  <p><code>npx css-animation-lab check path/to/anim.css</code></p>
  <p class="note">
    MIT License ·
    <a href="https://github.com/yhay81/css-animation-lab">GitHub</a>
  </p>
</main>
</body>
</html>
`);

const files = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).length;
};
console.log(`built dist/site (${await files(SITE)} files, ${stats.total} experiments, readonly)`);
