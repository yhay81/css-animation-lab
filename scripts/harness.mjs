/**
 * 任意の CSS を検査するための舞台。
 *
 * ラボの実験と同じ土俵に載せることが目的なので、common.css をそのまま使う。
 * 寸法・被写体・`animation-play-state: paused` が揃っていないと、
 * 「カタログでは通ったのに手元では通らない」という食い違いが出る。
 *
 * file:// ではモジュールを読み込めないため、127.0.0.1 に一時的な配信を立てる。
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 既定の被写体。lab.js の SUBJECT と揃えてある。 */
export const SUBJECT = '<div class="subject"><span class="label">Aa</span></div>';

function page({ id, markup }) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>css-animation-lab harness</title>
<link rel="stylesheet" href="/common.css">
<link rel="stylesheet" href="/user.css">
<style>
  /*
   * 検査は固定寸法で行う。窓の広さで結果が変わると、
   * 別の環境で採った結果と突き合わせられなくなる。
   */
  body { margin: 0; padding: 20px; }
  .cell { width: 260px; }
  .stage { height: 150px; }
</style>
</head>
<body>
<figure class="cell" data-exp="${id}" data-mode="keyframes" data-state="pass">
  <div class="stage">${markup}</div>
</figure>
<script type="module">
import { inspect, seekOnly, isCssAnimation } from '/runtime.mjs';

const cell = () => document.querySelector('.cell');
const timed = () => cell().getAnimations({ subtree: true })
  .filter((a) => isCssAnimation(a) && a.timeline === document.timeline);

/**
 * 1 周の長さ。ラボは 1000ms 固定だが、外から来た CSS は自分の尺を持っている。
 * 最も遅く終わるものに合わせないと、後ろのほうの動きを見ないまま判定してしまう。
 */
window.__cycle = () => {
  let max = 0;
  for (const a of timed()) {
    const t = a.effect?.getComputedTiming?.();
    if (!t) continue;
    max = Math.max(max, (Number(t.delay) || 0) + (Number(t.duration) || 0));
  }
  return Math.round(max) || 1000;
};

window.__inspect = (options) => {
  // timed には Animation が入るので、そのままでは持ち帰れない。数だけ返す。
  const { findings, cost, properties, animationCount, timed: list } = inspect(cell(), options);
  return { findings, cost, properties, animationCount, timedCount: list.length };
};

window.__seek = (t) => { seekOnly(timed(), t); };

/** 舞台の矩形。コマの切り出しに使う。 */
window.__stageBox = () => {
  const r = cell().querySelector('.stage').getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height, scale: 1 };
};

window.__ready = true;
</script>
</body>
</html>
`;
}

const TYPES = {
  '/': 'text/html; charset=utf-8',
  '/common.css': 'text/css; charset=utf-8',
  '/user.css': 'text/css; charset=utf-8',
  '/runtime.mjs': 'text/javascript; charset=utf-8',
};

/**
 * 舞台を配信する。返る url をそのままブラウザに渡せる。
 *
 * @param {{css: string, markup?: string, id?: string}} options
 */
export async function serveHarness({ css, markup = SUBJECT, id = 'css' }) {
  const [commonCss, runtimeJs] = await Promise.all([
    readFile(join(ROOT, 'lab', 'common.css'), 'utf8'),
    readFile(join(ROOT, 'scripts', 'checks', 'runtime.mjs'), 'utf8'),
  ]);
  const html = page({ id, markup });
  const bodies = {
    '/': html,
    '/common.css': commonCss,
    '/user.css': css,
    '/runtime.mjs': runtimeJs,
  };

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const body = bodies[path];
    if (body === undefined) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path], 'cache-control': 'no-store' });
    res.end(body);
  });

  // 外から触れる必要はまったく無い。127.0.0.1 の空きポートに閉じる。
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
