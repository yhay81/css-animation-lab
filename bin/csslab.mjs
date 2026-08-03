#!/usr/bin/env node
/**
 * css-animation-lab の CLI。
 *
 * ラボの中でしか使えなかった検査を、任意の CSS に向けて開く。
 * AI が書いた CSS アニメーションは「動くように見えて何も起きていない」ことが多い。
 * それを目視ではなく機械で捕まえるのがこの道具の役目。
 *
 * 依存パッケージは無い。実行時の検査だけ Chrome を借りる。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCss, hasFailure } from '../scripts/check.mjs';
import { serveHarness, SUBJECT } from '../scripts/harness.mjs';
import { launch } from '../scripts/chrome.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const USAGE = `css-animation-lab — CSS アニメーションを検査する

  csslab check <file.css...>        書き方の誤りを静的に検査する
    --runtime                       Chrome で実際に動かして実行時も検査する
    --html <file>                   被写体の markup（既定は正方形の被写体ひとつ）
    --json                          機械可読で出す

  csslab strip <file.css>           動きを静止画の連番に展開する（Chrome が要る）
    --frames <n>                    コマ数（既定 9）
    --out <dir>                     出力先（既定 ./strip）
    --html <file>                   被写体の markup

  csslab catalog [検索語]           211 件の実験カタログを引く
    --layer <L0|L2|L3|L4|T|E>       層で絞る
    --limit <n>                     件数（既定 20）
    --json

  csslab findings [検索語]          知見（効いたこと・効かなかったこと）を引く
    --json

  csslab patterns                   型ごとの性格（注意度・由来・反復耐性）

  csslab mcp                        MCP サーバーとして待ち受ける（stdio）

指摘が 1 件でも「要修正」なら終了コードは 1 になる。CI にそのまま置ける。
`;

/* ───────────────────────── 引数 ───────────────────────── */

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const key = arg.slice(2);
    // 値を取る旗と、立てるだけの旗を分ける。
    if (['html', 'frames', 'out', 'layer', 'limit'].includes(key)) flags[key] = argv[++i];
    else flags[key] = true;
  }
  return { flags, positional };
}

/* ───────────────────────── 表示 ───────────────────────── */

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (COLOR ? `[${code}m${text}[0m` : text);
const red = (t) => paint('31', t);
const yellow = (t) => paint('33', t);
const green = (t) => paint('32', t);
const dim = (t) => paint('2', t);

function printFindings(findings) {
  for (const f of findings) {
    const label = f.sev === 'fail' ? red('要修正') : yellow('注意  ');
    console.log(`  ${label}  ${f.rule}`);
    console.log(`          ${f.msg}`);
    console.log(dim(`          → ${f.why}`));
  }
}

/* ───────────────────────── 検査対象の読み取り ───────────────────────── */

/**
 * CSS ファイルから、名前と被写体を割り出す。
 *
 * 実験の CSS は `[data-exp="<id>"]` でスコープされているので、名前を取り違えると
 * どのセレクタも当たらず「動きが無い」と誤って報告される。
 * `experiments/<id>/anim.css` のような置き方では、意味を持つ名前は親ディレクトリのほう。
 * 隣に meta.json があれば、そこの id と markup を正とする。
 */
async function describeTarget(path, explicitMarkup) {
  const dir = dirname(path);
  const base = basename(path).replace(/\.css$/, '');
  let id = base === 'anim' ? basename(dir) : base;
  let markup = explicitMarkup;

  try {
    const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'));
    if (typeof meta.id === 'string') id = meta.id;
    // meta.json があって markup が無いのは「既定の被写体」を意味する。
    // 「被写体が分からない」（null）とは別の状態なので、ここで確定させる。
    if (markup === null) markup = typeof meta.markup === 'string' ? meta.markup : SUBJECT;
  } catch {
    // 隣に meta.json が無いのが普通の使い方。被写体は分からないままにする。
  }

  return { id, markup };
}

/* ───────────────────────── check ───────────────────────── */

async function commandCheck({ flags, positional }) {
  if (!positional.length) {
    console.error('検査する CSS ファイルを指定してください。');
    return 2;
  }

  const markupArg = flags.html ? await readFile(resolve(flags.html), 'utf8') : null;
  const reports = [];
  let browser = null;

  try {
    for (const file of positional) {
      const path = resolve(file);
      const css = await readFile(path, 'utf8');
      const { id, markup } = await describeTarget(path, markupArg);

      // 複数ファイルでも Chrome の起動は 1 回だけにする。1 件ごとに立てると 2 秒ずつ増える。
      if (flags.runtime) browser ??= await launch();
      // markup を渡していないときは、markup を前提にする規則を伏せる。
      // 「<path> が無い」と言われても、そもそも被写体を渡していないだけかもしれない。
      const result = await checkCss(css, { id, markup, runtime: Boolean(flags.runtime), browser });
      reports.push({ file, ...result });
    }
  } finally {
    await browser?.close();
  }

  if (flags.json) {
    console.log(JSON.stringify({ version: 1, reports }, null, 2));
  } else {
    for (const report of reports) {
      console.log(`\n${report.file}`);
      if (!report.findings.length) console.log(green('  指摘なし'));
      else printFindings(report.findings);
      if (report.runtime) {
        const { cost, properties, animationCount, cycleMs } = report.runtime;
        console.log(dim(`  負荷  ${cost}${properties.length ? `（${properties.join(', ')}）` : ''}`));
        console.log(dim(`  1周   ${cycleMs}ms / アニメーション ${animationCount} 本`));
      }
    }
    const all = reports.flatMap((r) => r.findings);
    const fails = all.filter((f) => f.sev === 'fail').length;
    console.log(`\n${all.length} 件の指摘（要修正 ${fails}、注意 ${all.length - fails}）`);
  }

  return reports.some((r) => hasFailure(r.findings)) ? 1 : 0;
}

/* ───────────────────────── strip ───────────────────────── */

async function commandStrip({ flags, positional }) {
  const [file] = positional;
  if (!file) {
    console.error('展開する CSS ファイルを指定してください。');
    return 2;
  }
  const frames = Math.max(2, Number(flags.frames) || 9);
  const outDir = resolve(flags.out ?? 'strip');
  const path = resolve(file);
  const css = await readFile(path, 'utf8');
  const markupArg = flags.html ? await readFile(resolve(flags.html), 'utf8') : null;
  const { id, markup } = await describeTarget(path, markupArg);

  const harness = await serveHarness({ css, markup: markup ?? SUBJECT, id });
  const browser = await launch();
  try {
    await browser.goto(harness.url);
    await browser.evaluate(`(async () => {
      for (let i = 0; i < 40 && !window.__ready; i++) await new Promise((r) => setTimeout(r, 50));
    })()`);

    const cycleMs = await browser.evaluate('window.__cycle()');
    const box = await browser.evaluate('window.__stageBox()');
    await mkdir(outDir, { recursive: true });

    const names = [];
    for (let i = 0; i < frames; i++) {
      // ease-out 系は前半 3 割で動きが終わる（F004）。
      // 等間隔だと後半が全部同じ絵になるので、前半に密に採る。
      const at = (i / (frames - 1)) ** 2.4;
      await browser.evaluate(`window.__seek(${at * cycleMs})`);
      const shot = await browser.send('Page.captureScreenshot', {
        format: 'png',
        clip: { ...box, scale: 2 },
        captureBeyondViewport: true,
      });
      const name = `frame-${String(i).padStart(2, '0')}.png`;
      await writeFile(join(outDir, name), Buffer.from(shot.data, 'base64'));
      names.push({ name, percent: (at * 100).toFixed(at < 0.1 ? 1 : 0) });
    }

    await writeFile(join(outDir, 'index.html'), contactSheet(id, cycleMs, names));
    console.log(`${frames} コマを ${outDir} に書き出しました（1 周 ${cycleMs}ms）`);
    console.log(dim(`  ${join(outDir, 'index.html')} を開くと並べて見られます`));
    return 0;
  } finally {
    await browser.close();
    await harness.close();
  }
}

function contactSheet(id, cycleMs, names) {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>${id} — フィルムストリップ</title>
<style>
  body { margin: 0; padding: 20px; background: #0b1020; color: #e6e9f5;
         font: 13px/1.7 ui-sans-serif, system-ui, sans-serif; }
  h1 { font-size: 15px; margin: 0 0 4px }
  p { color: #8b93b5; margin: 0 0 16px }
  .strip { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 10px }
  figure { margin: 0; flex: 0 0 auto }
  img { display: block; width: 150px; border-radius: 8px; background: #0e132a }
  figcaption { text-align: center; padding-top: 5px; color: #8b93b5;
               font-variant-numeric: tabular-nums; font-size: 11px }
</style></head>
<body>
<h1>${id}</h1>
<p>1 周 ${cycleMs}ms / ${names.length} コマ・前半に密なサンプリング（F004）</p>
<div class="strip">
${names.map((f) => `  <figure><img src="${f.name}" alt="${f.percent}%"><figcaption>${f.percent}%</figcaption></figure>`).join('\n')}
</div>
</body></html>
`;
}

/* ───────────────────────── カタログと知見 ───────────────────────── */

const loadJson = async (file) => JSON.parse(await readFile(join(ROOT, file), 'utf8'));

async function commandCatalog({ flags, positional }) {
  const items = await loadJson('catalog.json');
  const query = positional.join(' ').toLowerCase();
  const limit = Number(flags.limit) || 20;

  let hits = items;
  if (flags.layer) hits = hits.filter((i) => i.layer === flags.layer);
  if (query) {
    // 日本語と英語のどちらでも当たる。
    hits = hits.filter((i) => [
      i.id, i.title, i.note, i.title_en, i.note_en, ...Object.values(i.axes ?? {}).flat(),
    ].filter(Boolean).join(' ').toLowerCase().includes(query));
  }

  if (flags.json) {
    console.log(JSON.stringify(hits.slice(0, limit), null, 2));
    return 0;
  }
  console.log(`${hits.length} 件${hits.length > limit ? `（先頭 ${limit} 件を表示）` : ''}\n`);
  for (const item of hits.slice(0, limit)) {
    const axes = Object.entries(item.axes ?? {})
      .filter(([key]) => key !== 'driver')
      .map(([key, value]) => `${key}: ${[value].flat().join(' / ')}`)
      .join('  ');
    console.log(`${item.id.padEnd(20)} ${dim(item.layer.padEnd(3))} ${item.title}`);
    if (axes) console.log(dim(`  ${axes}`));
    console.log(dim(`  ${item.note}`));
    console.log();
  }
  return 0;
}

async function commandFindings({ flags, positional }) {
  const text = await readFile(join(ROOT, 'FINDINGS.md'), 'utf8');
  // 「## F001 …」から次の見出しの直前までが 1 件。
  const blocks = text.split(/\n(?=## F\d+)/).filter((b) => b.startsWith('## F'));
  const query = positional.join(' ').toLowerCase();
  const hits = query ? blocks.filter((b) => b.toLowerCase().includes(query)) : blocks;

  if (flags.json) {
    console.log(JSON.stringify(hits.map((block) => {
      const [heading, ...rest] = block.split('\n');
      const field = (name) => rest.find((l) => l.includes(`**${name}**`))?.split('—').slice(1).join('—').trim() ?? null;
      return {
        id: heading.match(/F\d+/)?.[0],
        claim: heading.replace(/^## F\d+\s*/, ''),
        evidence: field('根拠'),
        confidence: field('確度'),
        effect: field('効き方'),
      };
    }), null, 2));
    return 0;
  }
  console.log(hits.length ? `${hits.length} 件\n` : '該当なし\n');
  for (const block of hits) console.log(`${block.trim()}\n`);
  return 0;
}

async function commandPatterns() {
  console.log(await readFile(join(ROOT, 'PATTERNS.md'), 'utf8'));
  return 0;
}

/* ───────────────────────── 入口 ───────────────────────── */

const [command, ...rest] = process.argv.slice(2);
const parsed = parseArgs(rest);

/**
 * MCP サーバーとして待ち受ける。
 * 読み込むだけで待ち受けが始まるので、ここで返る必要はない。
 */
async function commandMcp() {
  await import('../mcp/server.mjs');
  return 0;
}

const COMMANDS = {
  check: commandCheck,
  strip: commandStrip,
  catalog: commandCatalog,
  findings: commandFindings,
  patterns: commandPatterns,
  mcp: commandMcp,
};

// `npx css-animation-lab --mcp` は MCP クライアントの設定でよく使われる書き方。
if (command === '--mcp' || parsed.flags.mcp) {
  await import('../mcp/server.mjs');
  process.exit(0);
}

if (!command || command === 'help' || parsed.flags.help) {
  console.log(USAGE);
  process.exit(command ? 0 : 2);
}

const handler = COMMANDS[command];
if (!handler) {
  console.error(`知らないコマンド: ${command}\n`);
  console.log(USAGE);
  process.exit(2);
}

try {
  process.exitCode = await handler(parsed);
} catch (error) {
  console.error(red(`\n${error.message}`));
  process.exitCode = 2;
}
