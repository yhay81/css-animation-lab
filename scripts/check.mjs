/**
 * 検査の中核。CLI・MCP サーバー・ライブラリの 3 経路がここを共有する。
 *
 * 静的検査だけなら何も要らない。実行時の検査は Chrome を借りるが、
 * 複数のファイルを見るときは 1 つのブラウザを使い回す（毎回起動すると 1 件 2 秒かかる）。
 */
import { staticChecks, HARNESS_CLASSES } from './checks/static.mjs';
import { serveHarness, SUBJECT } from './harness.mjs';
import { launch } from './chrome.mjs';

/**
 * 実際に動かして測る。舞台はカタログの実験と同じ土俵（common.css）に載せる。
 *
 * @param {object} browser scripts/chrome.mjs の launch() が返すページ。
 */
export async function runtimeCheck(browser, { css, markup = SUBJECT, id = 'css' }) {
  const harness = await serveHarness({ css, markup, id });
  try {
    await browser.goto(harness.url);
    // スタイル解決とアニメーション生成を待つ。
    // 描画が止まっている環境では requestAnimationFrame が来ないので、時間で待つ。
    await browser.evaluate(`(async () => {
      for (let i = 0; i < 40 && !window.__ready; i++) await new Promise((r) => setTimeout(r, 50));
      for (let i = 0; i < 40; i++) {
        if (document.getAnimations().length) break;
        await new Promise((r) => setTimeout(r, 50));
      }
    })()`);

    // ラボの内部尺は 1000ms 固定だが、外から来た CSS は自分の尺を持っている。
    const cycleMs = await browser.evaluate('window.__cycle()');
    const result = await browser.evaluate(`window.__inspect(${JSON.stringify({
      id, css, duration: cycleMs, measurable: true, clockDriven: true,
    })})`);
    return { ...result, cycleMs };
  } finally {
    await harness.close();
  }
}

/**
 * CSS を 1 件検査する。
 *
 * @param {string} css 検査する CSS。
 * @param {object} [options]
 * @param {string} [options.id] 指摘に付ける名前。
 * @param {string|null} [options.markup] 被写体の HTML。null なら「分からない」扱いで、
 *   markup を前提にする規則を伏せる。
 * @param {boolean} [options.runtime] Chrome で実際に動かすか。
 * @param {object} [options.browser] 使い回すブラウザ。省略時は必要なら自前で起動して閉じる。
 * @returns {Promise<{id: string, findings: Array, runtime: object|null}>}
 */
export async function checkCss(css, { id = 'css', markup = null, runtime = false, browser = null } = {}) {
  const findings = staticChecks({ id, markup }, css, HARNESS_CLASSES);
  if (!runtime) return { id, findings, runtime: null };

  const own = browser ?? await launch();
  try {
    const result = await runtimeCheck(own, { css, markup: markup ?? SUBJECT, id });
    return { id, findings: [...findings, ...result.findings], runtime: result };
  } finally {
    if (!browser) await own.close();
  }
}

/** 指摘の重さ。1 件でも `fail` があれば直すべき状態だと見なす。 */
export const hasFailure = (findings) => findings.some((f) => f.sev === 'fail');
