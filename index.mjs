/**
 * css-animation-lab のプログラム向け入口。
 *
 * 3 つのものを配っている。
 *
 * 1. 検査器 —— CSS アニメーションが「本当に動いているか」「重くないか」を機械で見る。
 * 2. カタログ —— 211 件の実験を軸で索引したもの。何が作れるかを引く。
 * 3. 知見 —— 効いたこと・効かなかったことを、確度つきで記録したもの。
 *
 * 生成そのものは扱わない。生成の後に来る「判断」を助けるための道具。
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

export { checkCss, runtimeCheck, hasFailure } from './scripts/check.mjs';
export { staticChecks, HARNESS_CLASSES } from './scripts/checks/static.mjs';
export { serveHarness, SUBJECT } from './scripts/harness.mjs';
export { launch, findChrome } from './scripts/chrome.mjs';

let catalogCache;

/** 全実験のカタログ。id / layer / axes / predicted / note を持つ。 */
export async function loadCatalog() {
  catalogCache ??= JSON.parse(await readFile(join(ROOT, 'catalog.json'), 'utf8'));
  return catalogCache;
}

/**
 * カタログを引く。用途・技法・名称のどれからでも当たる。
 *
 * @param {string} [query] 部分一致で探す語。
 * @param {{layer?: string, driver?: string, limit?: number}} [options]
 */
export async function searchCatalog(query = '', { layer, driver, limit = 20 } = {}) {
  const items = await loadCatalog();
  const needle = query.trim().toLowerCase();
  return items
    .filter((item) => !layer || item.layer === layer)
    .filter((item) => !driver || (item.mode ?? 'keyframes') === driver)
    // 日本語と英語のどちらでも当たるようにする。引く側の言語を先に決めさせない。
    .filter((item) => !needle || [
      item.id, item.title, item.note, item.title_en, item.note_en,
      ...Object.values(item.axes ?? {}).flat(),
    ].filter(Boolean).join(' ').toLowerCase().includes(needle))
    .slice(0, limit);
}

/**
 * 知見を引く。1 件は「主張・根拠・確度・効き方」の 4 つを必ず持つ。
 * 確度は `実測` / `仕様から確定` / `仮説` のいずれかで、
 * どこまで信用してよいかがそのまま書いてある。
 */
export async function searchFindings(query = '') {
  const text = await readFile(join(ROOT, 'FINDINGS.md'), 'utf8');
  const blocks = text.split(/\n(?=## F\d+)/).filter((block) => block.startsWith('## F'));
  const needle = query.trim().toLowerCase();
  return blocks
    .filter((block) => !needle || block.toLowerCase().includes(needle))
    .map((block) => {
      const [heading, ...rest] = block.split('\n');
      const field = (name) => rest.find((line) => line.includes(`**${name}**`))
        ?.split('—').slice(1).join('—').trim() ?? null;
      return {
        id: heading.match(/F\d+/)?.[0] ?? null,
        claim: heading.replace(/^## F\d+\s*/, '').trim(),
        evidence: field('根拠'),
        confidence: field('確度'),
        effect: field('効き方'),
        markdown: block.trim(),
      };
    });
}

/** 型ごとの性格（注意度・由来・反復耐性）。優劣ではなく性格を書いてある。 */
export async function loadPatterns() {
  return readFile(join(ROOT, 'PATTERNS.md'), 'utf8');
}
