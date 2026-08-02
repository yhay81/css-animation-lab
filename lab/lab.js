// 一覧ページとフィルムストリップで共有する部品。

/** 比較の軸として全体に一括適用するイージング。切り替えは常にグローバル。 */
export const EASINGS = [
  { id: 'linear', label: 'linear（素）', value: 'linear' },
  { id: 'ease-out', label: 'ease-out', value: 'ease-out' },
  { id: 'ease-in-out', label: 'ease-in-out', value: 'ease-in-out' },
  { id: 'expo-out', label: 'expo-out', value: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  { id: 'back-out', label: 'back-out（行き過ぎ）', value: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  {
    id: 'spring',
    label: 'spring（linear()）',
    value:
      'linear(0, 0.006, 0.026 2.7%, 0.106 5.5%, 0.427 13.5%, 0.559, 0.673, 0.771, 0.851 27.6%, 0.916, 0.968, 1.008, 1.036, 1.054, 1.062, 1.061 46.6%, 1.052, 1.03 55.2%, 1.014, 1.006 66.7%, 0.999, 0.998, 1)',
  },
  {
    id: 'bounce',
    label: 'bounce（linear()）',
    value:
      'linear(0, 0.004, 0.016, 0.035, 0.063, 0.098, 0.141 13.6%, 0.25, 0.391, 0.563, 0.765, 1, 0.891 40.9%, 0.848, 0.813, 0.785, 0.766, 0.754, 0.75, 0.754, 0.766, 0.785, 0.813, 0.848, 0.891 68.2%, 1 72.7%, 0.973, 0.953, 0.941, 0.938, 0.941, 0.953, 0.973, 1, 0.988, 0.984, 0.988, 1)',
  },
  { id: 'steps', label: 'steps(6)（機械的）', value: 'steps(6, end)' },
];

/** 実験の内部尺。実時間の速さは別途 JS が決めるので、ここは固定値でよい。 */
export const DUR = 1000;

/**
 * 被写体の下地。動きとは独立した軸。
 * 既定のグラデーションは「膨らんだ物体」として読まれるため、それ自体が判定に影響する。
 */
export const SUBSTRATES = [
  { id: 'gradient', label: 'グラデ' },
  { id: 'flat', label: '単色' },
  { id: 'paper', label: '白い面' },
  { id: 'outline', label: '輪郭のみ' },
];

/**
 * CSS アニメーションかどうか。CSSTransition と区別するために使う。
 * CSSAnimation だけが animationName を持つ。
 */
export function isCssAnimation(a) {
  return typeof a.animationName === 'string';
}

export async function loadCatalog() {
  if (location.protocol === 'file:') {
    throw new Error(
      'file:// では動きません。\nターミナルで `node lab/server.mjs` を起動し、http://localhost:5757/ から開いてください。',
    );
  }
  const res = await fetch('/api/catalog');
  if (!res.ok) throw new Error(`カタログを取得できません（HTTP ${res.status}）`);
  return res.json();
}

/** 失敗を黙って黒画面にしない。原因を画面に出す。 */
export function showFatal(err) {
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;left:16px;right:16px;bottom:16px;z-index:99;padding:14px 16px;' +
    'border:1px solid #f43f5e;border-radius:10px;background:#2a0f1c;color:#ffe4e6;' +
    'font:13px/1.9 ui-sans-serif,system-ui,sans-serif;white-space:pre-wrap';
  box.textContent = String(err?.message ?? err);
  document.body.append(box);
}

/** ページ先頭で呼ぶ。読み込み時の例外をすべて画面に出す。 */
export function reportFailures() {
  addEventListener('unhandledrejection', (e) => showFatal(e.reason));
  addEventListener('error', (e) => showFatal(e.error ?? e.message));
}

/** 各実験の anim.css を読み込む。セレクタは [data-exp="id"] で閉じている前提。 */
export function injectStyles(items) {
  return Promise.all(
    items.map(
      (it) =>
        new Promise((resolve) => {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = `/experiments/${it.id}/anim.css`;
          link.addEventListener('load', resolve, { once: true });
          link.addEventListener('error', resolve, { once: true });
          document.head.append(link);
        }),
    ),
  );
}

/**
 * DOM を挿入した直後はまだスタイル解決が走っておらず getAnimations() が空になる。
 * 2フレーム待って CSS アニメーションの生成を確実にする。
 */
export function afterStyleResolution() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/** 実験1件ぶんの見た目。中身は全実験で共通にして、差分を CSS だけに閉じ込める。 */
export function buildCell(item, { tabbable = true } = {}) {
  const fig = document.createElement('figure');
  fig.className = 'cell';
  fig.dataset.exp = item.id;
  fig.dataset.predicted = item.predicted ?? 'good';
  fig.dataset.state = 'pass';
  // keyframes 駆動は時計で任意の時点に固定できるが、state 駆動は実時間でしか動かない。
  fig.dataset.mode = item.mode ?? 'keyframes';
  if (tabbable) fig.tabIndex = 0;

  fig.innerHTML = `
    <div class="stage">${item.markup ?? SUBJECT}</div>
    <figcaption>
      <span class="id">${item.id}</span>
      <span class="title">${item.title}</span>
      <span class="mark"></span>
    </figcaption>`;
  return fig;
}

/** 既定の被写体。meta.json に markup があればそちらが使われる（多要素の編成実験用）。 */
export const SUBJECT = '<div class="subject"><span class="label">Aa</span></div>';

/**
 * 全アニメーションを1本の時計で駆動する。
 * CSS 側は animation-play-state: paused にしてあり、進行は currentTime の代入だけで起きる。
 * これで「同位相での比較」「任意時点への固定」「コマ送り」が同じ仕組みで手に入る。
 */
export function createClock({ onTick } = {}) {
  const clock = {
    t: 0,
    playing: true,
    // 1周にかける実時間。既定は内部尺と 1:1。
    // ここをずらすと、実験が指定した ms と実際に見えている時間が食い違い、時間の判定が狂う。
    cycleMs: DUR,
    // 終端で静止する時間。継ぎ目のない繰り返しでは休みがそのまま引っかかりになるため既定は 0。
    // 到達した状態を眺めたいときだけ「溜め」で足す。
    restMs: 0,
    restLeft: 0,
  };

  let last = performance.now();

  function apply() {
    for (const a of document.getAnimations()) {
      // getAnimations() は CSSTransition も返す。遷移まで時計で駆動すると、
      // 200ms の遷移が毎フレーム 1000ms 地点へ飛ばされて一瞬で終わってしまう。
      // 時計が動かすのは CSS アニメーションだけ。
      if (!isCssAnimation(a)) continue;
      // スクロール駆動（scroll() / view()）は時間ではなく位置で進む。時計の管轄外。
      if (a.timeline !== document.timeline) continue;
      try {
        a.currentTime = clock.t;
      } catch {
        /* 駆動できないアニメーションは黙って飛ばす */
      }
    }
    onTick?.(clock.t);
  }

  /**
   * 実時間 dt ぶんだけ時計を進める。
   * フレームから切り離してあるので、描画が動かない環境でも進行を検証できる。
   */
  clock.advance = (dt) => {
    if (clock.restLeft > 0) {
      clock.restLeft -= dt;
      if (clock.restLeft <= 0) clock.t = 0;
      return;
    }
    clock.t += (dt / clock.cycleMs) * DUR;
    if (clock.t < DUR) return;

    if (clock.restMs > 0) {
      // 溜めあり。終端で止めてから頭に戻す。
      clock.t = DUR;
      clock.restLeft = clock.restMs;
    } else {
      // 溜めなし。位相を保ったまま折り返す。0 に丸めると毎周わずかに飛ぶ。
      clock.t %= DUR;
    }
  };

  function frame(now) {
    const dt = now - last;
    last = now;
    if (clock.playing) clock.advance(dt);
    apply();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  clock.seek = (t) => {
    clock.t = Math.max(0, Math.min(DUR, t));
    clock.restLeft = 0;
    apply();
  };
  clock.toggle = () => (clock.playing = !clock.playing);
  clock.step = (d) => {
    clock.playing = false;
    clock.seek(clock.t + d);
  };
  return clock;
}

/** 一括適用のイージングを差し替える。CSS アニメーションは計算値の変化に追従する。 */
export function setEasing(root, value) {
  root.style.setProperty('--ease', value);
}
