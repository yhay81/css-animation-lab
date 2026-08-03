/**
 * CSS アニメーションの実行時検査。
 *
 * 静的検査（static.mjs）が「書き方の誤り」を見るのに対し、ここでは
 * 「実際に生成されたアニメーションが何をしているか」を見る。計算値が変わっていても
 * 描画に届いていないことがあるため、判定は必ず描画に効く値と実測の矩形で行う（F028）。
 *
 * このファイルはブラウザの中でしか動かないが、ページに閉じていない。
 * lab/verify.html（カタログ全件）と bin/csslab.mjs（任意の CSS を headless で）が
 * 同じものを呼ぶ。検査を 2 か所に書くと必ず片方が古くなる。
 */

/**
 * CSS アニメーションかどうか。CSSTransition と区別するために使う。
 * CSSAnimation だけが animationName を持つ。
 */
export function isCssAnimation(a) {
  return typeof a.animationName === 'string';
}

/** 描画に効く値。ここに無い性質は「変わっていない」と誤判定される。 */
export const PAINTED = [
  'opacity', 'backgroundColor', 'color', 'filter', 'clipPath', 'borderRadius',
  'backgroundPosition', 'backgroundSize', 'backgroundImage', 'maskImage', 'maskPosition',
  'boxShadow', 'textShadow', 'borderColor', 'borderImageSource', 'backdropFilter',
  'strokeDashoffset', 'strokeWidth', 'stroke', 'fill', 'd',
  'offsetDistance', 'offsetRotate', 'rotate', 'scale', 'translate', 'transform',
  'fontWeight', 'fontVariationSettings', 'letterSpacing', 'textEmphasisColor',
  'cornerShape', 'gridTemplateColumns', 'gridTemplateRows', 'gap', 'aspectRatio',
  'width', 'height', 'visibility', 'contentVisibility',
];

/**
 * 負荷の分類。プロパティからの保守的な見積もりであって、
 * DevTools の実レイヤ割当を保証するものではない。
 */
const COMPOSITOR = new Set(['opacity', 'transform', 'translate', 'rotate', 'scale']);
const LAYOUT = new Set([
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'left', 'right', 'top', 'bottom', 'margin', 'padding', 'gap',
  'gridTemplateColumns', 'gridTemplateRows', 'aspectRatio', 'fontSize', 'letterSpacing',
]);

const TIMING_KEYS = ['offset', 'computedOffset', 'easing', 'composite'];

/** 対象の実験だけを進める。文書全体を進めると件数の二乗になって終わらない。 */
export function seekOnly(list, t) {
  for (const a of list) {
    try { a.currentTime = t; } catch { /* 尺が auto のものは無視 */ }
  }
}

function pushStyle(out, cs) {
  for (const p of PAINTED) out.push(cs[p]);
}

/** 見た目の指紋。描画に効く値だけを拾う（計算値だけでは足りない ── F028）。 */
function signature(cell) {
  const stage = cell.querySelector('.stage');
  const sr = stage.getBoundingClientRect();
  const out = [];
  for (const el of cell.querySelectorAll('.stage *')) {
    const r = el.getBoundingClientRect();
    out.push(
      Math.round(r.left - sr.left), Math.round(r.top - sr.top),
      Math.round(r.width), Math.round(r.height),
    );
    pushStyle(out, getComputedStyle(el));
    // 擬似要素は DOM に無い。走査に含めないと glitch のような実験を見落とす。
    pushStyle(out, getComputedStyle(el, '::before'));
    pushStyle(out, getComputedStyle(el, '::after'));
    if (typeof el.getBBox === 'function') {
      try {
        const b = el.getBBox();
        out.push(Math.round(b.x * 10), Math.round(b.y * 10),
          Math.round(b.width * 10), Math.round(b.height * 10));
      } catch { /* 描画されていない図形 */ }
    }
  }
  return out.join('|');
}

/** 位置と不透明度だけの数値ベクトル。継ぎ目の大きさを測るのに使う。 */
function vector(cell) {
  const stage = cell.querySelector('.stage');
  const sr = stage.getBoundingClientRect();
  const v = [];
  for (const el of cell.querySelectorAll('.stage *')) {
    const r = el.getBoundingClientRect();
    v.push(r.left - sr.left, r.top - sr.top, r.width, r.height,
      Number(getComputedStyle(el).opacity) * 40);
  }
  return v;
}

/**
 * 標本を取る時点。等間隔だと、短い区間で起きる変化（neon の明滅など）を飛ばす。
 * 各アニメーションのキーフレームが置かれている時点そのものを拾い、
 * steps で保持される値も取れるように直後の点も足す。
 */
export function samplePoints(list, duration) {
  const ts = new Set([0, duration - 1]);
  for (const a of list) {
    const t = a.effect?.getComputedTiming?.();
    if (!t) continue;
    const dur = Number(t.duration) || duration;
    const delay = Number(t.delay) || 0;
    for (const kf of a.effect.getKeyframes()) {
      const at = delay + kf.computedOffset * dur;
      for (const v of [at, at + 2, at - 2]) {
        // 尺が 1 周より短いものは繰り返すので、剰余で 1 周内へ畳む。
        const w = ((v % duration) + duration) % duration;
        ts.add(Math.round(w));
      }
    }
  }
  // 取りこぼし防止に等間隔も足す。多すぎると遅いので上限を置く。
  for (let k = 0; k < 8; k++) ts.add(Math.round((duration * k) / 8));

  const all = [...ts].filter((t) => t >= 0 && t < duration).sort((a, b) => a - b);
  const MAX = 60;
  if (all.length <= MAX) return all;
  // 先頭から切ると 1 周の終わりが落ち、継ぎ目の測定が壊れる。両端を残して間引く。
  const out = [];
  for (let k = 0; k < MAX; k++) out.push(all[Math.round((k * (all.length - 1)) / (MAX - 1))]);
  return [...new Set(out)];
}

const dist = (a, b) => {
  if (a.length !== b.length) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s;
};

const median = (xs) => {
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/** アニメーションが動かすプロパティを集めて負荷を分類する。 */
export function classify(animations) {
  const properties = new Set();
  for (const animation of animations) {
    for (const frame of animation.effect?.getKeyframes?.() ?? []) {
      for (const key of Object.keys(frame)) {
        if (!TIMING_KEYS.includes(key)) properties.add(key);
      }
    }
  }
  const keys = [...properties];
  const cost = keys.some((key) => LAYOUT.has(key))
    ? 'layout'
    : keys.length && keys.every((key) => COMPOSITOR.has(key))
      ? 'compositor'
      : keys.length ? 'paint' : 'unknown';
  return { cost, properties: keys.sort() };
}

/**
 * セル 1 件を実行時に検査する。
 *
 * @param {Element} cell `.stage` を内包する要素。
 * @param {object} options
 * @param {string} options.id     指摘に付ける名前。
 * @param {string} options.css    この実験の CSS。キーフレームに変数を隠しているかの判定に使う。
 * @param {number} options.duration 1 周の長さ（ms）。
 * @param {boolean} options.measurable 幅のある場所で描画されているか。偽なら寸法の判定を行わない。
 * @param {boolean} options.clockDriven 共通時計で動かせるか。state / scroll / interactive では偽。
 * @returns {{findings: Array, cost: string, properties: string[], animationCount: number, timed: Animation[]}}
 */
export function inspect(cell, {
  id = 'css',
  css = '',
  duration = 1000,
  measurable = true,
  clockDriven = true,
} = {}) {
  const findings = [];
  const add = (sev, rule, msg, why) => findings.push({ sev, id, rule, msg, why });

  const own = cell.getAnimations({ subtree: true }).filter(isCssAnimation);
  // スクロール駆動（scroll() / view()）は時間ではなく位置で進む。時計の管轄外。
  const timed = own.filter((a) => a.timeline === document.timeline);
  const { cost, properties } = classify(own);
  const result = { findings, cost, properties, animationCount: own.length, timed };

  // R1 時計で駆動するはずなのにアニメーションが無い
  if (clockDriven && timed.length === 0) {
    add('fail', '動きが無い', 'アニメーションが 1 本も生成されていない',
      '指定が通っていても生成されないことがある。擬似要素などは特に。');
    return result;
  }
  // 状態・スクロール・操作で動くものは時計では測れない。
  if (!clockDriven) return result;

  const points = samplePoints(timed, duration);
  const sig = [];
  const vec = [];
  for (const t of points) {
    seekOnly(timed, t);
    sig.push(signature(cell));
    vec.push(vector(cell));
  }
  seekOnly(timed, 0);

  // 幅が無い環境では、以下の判定はすべて意味を持たない。
  if (!measurable) return result;

  // R2 描画が変わらない
  const uniq = new Set(sig).size;
  if (uniq <= 1) {
    add('fail', '見た目が変わらない', `${points.length} 点すべてで描画上の差が無い`,
      '計算値が変わっていても描画に届いていないことがある。形や位置で測る。');
  }

  // R3 繰り返しの継ぎ目
  //
  // 最初と最後のキーフレームが同じ値なら、作者は繋げるつもりで書いている。
  // それでも飛ぶなら不具合。値が違うなら、頭から再生し直す設計なので飛んで当然。
  // 1 本でも「頭から再生し直す」ものが混ざっていれば、飛ぶのは設計どおり。
  const intendsSeamless = timed.length > 0 && timed.every((a) => {
    const kfs = a.effect?.getKeyframes?.() ?? [];
    if (kfs.length < 2) return false;
    const first = kfs[0];
    const last = kfs[kfs.length - 1];
    const keys = Object.keys(first).filter((k) => !TIMING_KEYS.includes(k));
    if (!keys.length) return false;
    return keys.every((k) => first[k] === last[k]);
  });
  const loops = timed.some((a) => a.effect?.getComputedTiming?.().iterations === Infinity);

  // getKeyframes() はカスタムプロパティを返さない。
  // 動きの本体を変数に持たせている実験は、先頭と末尾の比較が当てにならない。
  const hidesValues = /@keyframes[^{]*\{[^@]*?--[\w-]+\s*:/.test(css);
  // steps で刻む動きは、最後のコマを 100% まで保持してから頭へ戻る。
  // 飛ぶのは刻みの性質そのもので、繋ぎ方の誤りではない。
  const stepped = timed.some((a) =>
    /steps/.test(getComputedStyle(a.effect?.target ?? cell).animationTimingFunction));

  if (loops && intendsSeamless && uniq > 1 && !hidesValues && !stepped) {
    const steps = vec.slice(1).map((v, i) => dist(vec[i], v));
    const wrap = dist(vec[vec.length - 1], vec[0]);
    // steps で刻む動きは隣接標本の大半が同値になり、中央値が 0 に落ちる。
    // それだと「どんな差も異常に大きい」と判定されるので、最大の一歩も基準に入れる。
    const med = median(steps);
    const peak = Math.max(0, ...steps);
    if (wrap > Math.max(med * 4, peak * 1.5) + 8) {
      add('warn', '継ぎ目', `1 周の終わりで飛ぶ（通常 ${med.toFixed(0)} に対し ${wrap.toFixed(0)}）`,
        '繰り返す動きは最初と最後の見た目を一致させる。');
    }
  }

  // R4 入れ物より大きい要素の中央寄せ（F029）
  for (const el of cell.querySelectorAll('.stage *')) {
    const parent = el.parentElement;
    if (!parent) continue;
    const ps = getComputedStyle(parent);
    // 効かなくなるのは格子の中央寄せ。少しのはみ出しは意図的なことが多いので閾値を置く。
    if (ps.display !== 'grid') continue;
    if (!/center/.test(ps.justifyItems) && !/center/.test(ps.alignItems)) continue;
    if (getComputedStyle(el).position === 'absolute') continue;
    const OVER = 20;
    if (el.offsetWidth > parent.clientWidth + OVER || el.offsetHeight > parent.clientHeight + OVER) {
      // 4 回繰り返した罠なので注意ではなく要修正として扱う。
      add('fail', 'はみ出しの中央寄せ',
        `${el.className || el.tagName} が入れ物より大きい（${el.offsetWidth}×${el.offsetHeight} > ${parent.clientWidth}×${parent.clientHeight}）`,
        '中央寄せは効かず始端に張り付く。負の margin で中心を出す。');
      break;
    }
  }

  // R5 順序が 1 周に収まらない（diagram-build の組み上げが揃わなかった）
  //
  // 先頭と末尾が同値なら、位相をずらして流し続ける波。はみ出しても途切れない。
  // 値が違うなら「始まって終わる」順序なので、1 周に収まらないと完了しない。
  // 尺が 1 周と同じなら、遅延が少しでもあれば末尾は必ずはみ出す。
  // それ自体は問題ではない。問題は「最後の要素が仕事を終える前に 1 周が尽きる」こと。
  // 仕事の終わりは、値が最後に変わるキーフレームの位置で決まる。
  if (!intendsSeamless) for (const a of timed) {
    const t = a.effect?.getComputedTiming?.();
    if (!t) continue;
    const delay = Number(t.delay) || 0;
    const dur = Number(t.duration) || 0;
    if (delay <= 0 || !dur) continue;

    const kfs = a.effect.getKeyframes();
    const keys = Object.keys(kfs[0] ?? {}).filter((k) => !TIMING_KEYS.includes(k));
    let lastChange = 0;
    for (let i = 1; i < kfs.length; i++) {
      if (keys.some((k) => kfs[i][k] !== kfs[i - 1][k])) lastChange = kfs[i].computedOffset;
    }
    const finishesAt = delay + lastChange * dur;
    if (finishesAt > duration + 1) {
      add('fail', '1 周に収まらない',
        `最後の変化が ${Math.round(finishesAt)}ms（1 周は ${duration}ms）`,
        '最後の要素が動き終える前に頭へ戻る。順序は遅延ではなくキーフレームの位置で表す。');
      break;
    }
  }

  // R6 経路をなぞる要素が線からずれている（handwriting のペン）
  const paths = [...cell.querySelectorAll('path')];
  for (const el of cell.querySelectorAll('.stage *')) {
    const op = getComputedStyle(el).offsetPath;
    if (!op || !op.startsWith('path(')) continue;
    const svg = paths[0]?.ownerSVGElement;
    if (!paths.length || !svg) continue;
    const sr = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    if (!vb?.width || !sr.width) continue;
    const scale = sr.width / vb.width;
    const off = parseFloat(getComputedStyle(el).offsetDistance) / 100;
    if (!Number.isFinite(off)) continue;
    try {
      const p = paths[0].getPointAtLength(paths[0].getTotalLength() * off);
      const r = el.getBoundingClientRect();
      const gap = Math.hypot(
        r.left + r.width / 2 - (sr.left + p.x * scale),
        r.top + r.height / 2 - (sr.top + p.y * scale),
      );
      if (gap > 8) {
        add('fail', '経路からずれる',
          `${el.className || el.tagName} が線から ${gap.toFixed(0)}px 離れている`,
          'offset-path はパスの生の数値を px として進む。SVG を拡大して描くと追従する要素だけ取り残される。');
      }
    } catch { /* 経路を測れない図形 */ }
    break;
  }

  // R7 入れ子の同名要素が重なっている（rig-chain の段が全部同じ位置だった）
  const byClass = new Map();
  for (const el of cell.querySelectorAll('.stage *')) {
    const key = el.className;
    if (!key || typeof key !== 'string') continue;
    if (!el.parentElement?.className || el.parentElement.className !== key) continue;
    (byClass.get(key) ?? byClass.set(key, []).get(key)).push(el);
  }
  for (const [key, els] of byClass) {
    if (els.length < 2) continue;
    const tops = els.map((e) => Math.round(e.getBoundingClientRect().top));
    const lefts = els.map((e) => Math.round(e.getBoundingClientRect().left));
    if (new Set(tops).size === 1 && new Set(lefts).size === 1) {
      add('fail', '入れ子が重なる',
        `.${key} の入れ子 ${els.length + 1} 段が同じ位置にある`,
        '境界も余白も無い入れ子では margin が相殺され、子ではなく親ごと動く。translate なら相殺されない。');
    }
  }

  return result;
}
