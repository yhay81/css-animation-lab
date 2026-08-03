/**
 * CSS アニメーションの静的検査。
 *
 * 実際に踏んだ不具合だけを規則にしてある。どれも「エラーにならないまま黙って壊れる」
 * 種類のもので、書いた本人が画面を見ても原因に辿り着けなかったものを残している。
 * 根拠は FINDINGS.md の各項目を参照。
 *
 * このファイルは DOM を使わない。文字列を受け取って指摘を返すだけなので、
 * ブラウザ（lab/verify.html）からも Node（bin/csslab.mjs）からも同じものが動く。
 * 検査を 2 か所に書くと必ず片方が古くなるため、共有できる形に閉じている。
 */

/**
 * 実験が名前を重ねてはいけないクラス。
 *
 * common.css の情景部品（.subject / .bar / .line / .scene など）は借りて使うためのもので、
 * 名前が同じでも事故にならない。実験側で拡張するのが想定された使い方。
 *
 * 事故になるのは、ハーネス自身が枠組みに使っている名前と重なったとき。
 * 判の .mark が figcaption の評価印と衝突し、margin-left: auto を食ったのがこれ。
 */
export const HARNESS_CLASSES = new Set(['cell', 'stage', 'sheet', 'id', 'title', 'mark']);

/** 動きの本体になりやすく、静的な指定と食い合うプロパティ。 */
const RISKY = ['rotate', 'scale', 'translate', 'transform', 'clip-path', 'offset-distance'];

/**
 * @keyframes を取り除いた上で、セレクタと本体の組を取り出す。
 * 先に取り除かないと 0% { … } が別の規則として数えられ、誤検出になる。
 */
function topLevelRules(css) {
  const withoutKeyframes = css.replace(/@keyframes[^{]*\{[\s\S]*?\n\}/g, '');
  return [...withoutKeyframes.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ sel: m[1].trim(), body: m[2] }))
    .filter((r) => !r.sel.startsWith('@'));
}

/**
 * 静的検査を1件ぶん走らせる。
 *
 * @param {{id?: string, markup?: string|null}} item 実験のメタデータ。
 *   markup は被写体の HTML。`null` を渡すと「被写体が分からない」扱いになり、
 *   markup を前提にする規則を伏せる。手元の CSS ファイルだけを見るときはこちら。
 *   省略（undefined）は「既定の被写体」を意味し、カタログの実験がこれに当たる。
 * @param {string} css 検査する CSS。
 * @param {Set<string>} shared 重ねてはいけないクラス名。
 * @returns {Array<{sev: 'fail'|'warn', id: string, rule: string, msg: string, why: string}>}
 */
export function staticChecks(item, css, shared = HARNESS_CLASSES) {
  const id = item?.id ?? 'css';
  const knownMarkup = item?.markup !== null;
  const markup = item?.markup ?? '';
  const findings = [];
  const add = (sev, rule, msg, why) => findings.push({ sev, id, rule, msg, why });

  // S1 共有部品との名前衝突（stamp の .mark が margin-left: auto を食った）
  //
  // common.css の部品を意図して借りている場合は、実験側でその名前を書かない。
  // 実験側にも同名の規則があるなら、独自の意味を持たせるつもりなので衝突になる。
  const seen = new Set();
  for (const m of markup.matchAll(/class="([^"]+)"/g)) {
    for (const cls of m[1].split(/\s+/)) {
      if (!shared.has(cls) || seen.has(cls)) continue;
      seen.add(cls);
      add('fail', '名前衝突',
        `.${cls} はハーネス自身が使っている名前`,
        '書いた覚えのない指定が当たる。枠組みの名前は実験で使わない。');
    }
  }

  const rules = topLevelRules(css);

  // S2 未登録の変数に sibling-index()
  //
  // 同じ要素の中で使うぶんには問題ない。差し込まれた先でも同じ要素なので同じ値になる。
  // 壊れるのは要素をまたぐとき（text-scramble）と、別の変数を経由するとき（crowd-wave）。
  // どちらも評価の場所が宣言した要素から動く。
  // @keyframes の中身は要素ごとに評価されるので「別のセレクタ」には当たらない。
  for (const r of rules) {
    for (const m of r.body.matchAll(/(--[\w-]+)\s*:\s*([^;]*sibling-index\(\)[^;]*)/g)) {
      const name = m[1];
      if (new RegExp(`@property\\s+${name}\\b`).test(css)) continue;

      const viaVar = rules.some((o) => new RegExp(`--[\\w-]+\\s*:[^;]*var\\(\\s*${name}\\b`).test(o.body));
      const crossEl = rules.some((o) => o.sel !== r.sel && new RegExp(`var\\(\\s*${name}\\b`).test(o.body));
      if (!viaVar && !crossEl) continue;

      add('fail', '未登録の変数',
        `${name} が sibling-index() を含み、${viaVar ? '別の変数を経由して' : '別のセレクタで'}使われている`,
        '登録しない変数はトークン列のまま渡り、差し込まれた先で評価される。宣言した要素の値にならない。');
    }
  }

  // S3 d は path にしか効かない（F028）
  // 被写体が分からないときは判定できない。<path> を渡していないだけかもしれない。
  if (knownMarkup && /(^|[{;\s])d\s*:/.test(css) && !/<path/.test(markup)) {
    add('fail', 'd は path 限定',
      'd を指定しているが markup に <path> が無い',
      '計算値には現れるのに描画は変わらない。circle や rect では効かない。');
  }

  // S4 動かすプロパティを静的にも書いている（万華鏡の rotate）
  //
  // ファイル単位で見ると、別々の要素の指定を同じものと数えてしまう。
  // 「同じ規則が animation-name とそのプロパティの両方を持つ」ときだけが実害。
  const kfProps = new Set();
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)[^{]*\{([\s\S]*?)\n\}/g)) {
    for (const prop of RISKY) {
      if (new RegExp(`(^|[{;\\s])${prop}\\s*:`, 'm').test(m[2])) kfProps.add(`${m[1]}|${prop}`);
    }
  }
  for (const r of rules) {
    const named = r.body.match(/animation-name\s*:\s*([^;]+)/);
    if (!named) continue;
    const names = named[1].split(',').map((s) => s.trim());
    for (const prop of RISKY) {
      if (!new RegExp(`(^|[{;\\s])${prop}\\s*:`, 'm').test(r.body)) continue;
      if (!names.some((n) => kfProps.has(`${n}|${prop}`))) continue;
      add('fail', '静的な値が食われる',
        `${r.sel.slice(0, 48)} が ${prop} を静的にも指定している`,
        'アニメーションが値を占有するため静的な指定は無視される。配置と動きは別のプロパティに分ける。');
    }
  }

  // S6 面積ゼロの多角形（panel-split の 4 枚目が頂点一直線で消えていた）
  for (const m of css.matchAll(/clip-path:\s*polygon\(([^)]*)\)/g)) {
    const pts = m[1].split(',').map((s) => s.trim().split(/\s+/).map(parseFloat));
    if (pts.length < 3 || pts.some((p) => p.length < 2 || p.some(Number.isNaN))) continue;
    // 靴紐公式。頂点が一直線に並ぶと 0 になる。
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      area += x1 * y2 - x2 * y1;
    }
    if (Math.abs(area / 2) < 0.5) {
      add('fail', '面積ゼロの切り抜き',
        `polygon(${m[1].slice(0, 40)}…) の面積が 0`,
        '頂点が一直線に並んでいる。エラーにはならず、その要素だけが黙って消える。');
    }
  }

  // S7 pathLength と non-scaling-stroke の併用（eye-path の線が 3 分の 1 しか描けなかった）
  if (/pathLength=/.test(markup) && /non-scaling-stroke/.test(markup)
      && /stroke-das(harray|hoffset)/.test(css)) {
    add('fail', '破線の座標系',
      'pathLength と non-scaling-stroke を併用している',
      '正規化が無効になり、破線の長さがデバイス座標で解釈される。書いた値と描画長が一致しない。');
  }

  // S8 裏返した面の非対称な指定（page-turn の角丸が反転していた）
  //
  // グラデーションの向きが裏で反転しても気づかれないことが多いので、
  // 実際に食い違いが見える角丸だけを対象にする。
  for (const r of rules) {
    if (!/rotateY\(\s*180deg\s*\)|rotate:\s*y\s*180deg|scale:\s*-1\b/.test(r.body)) continue;
    const hit = r.body.match(/border-radius:\s*([^;]+)/);
    if (!hit) continue;
    const corners = hit[1].trim().split(/\s+/);
    if (new Set(corners).size <= 1) continue; // 一律なら反転しても同じ
    // 反転を織り込み済みだと書いてあれば、指摘しない。
    if (/反転済み/.test(r.body)) continue;
    add('warn', '裏面の非対称な指定',
      `${r.sel.replace(/\/\*[\s\S]*?\*\//g, '').trim().slice(0, 40)} が裏返しつつ角丸を持つ`,
      '裏面は左右が反転する。画面で見たい形ではなく、反転された結果がその形になる値を書く。');
  }

  // S5 入れ子の同名要素を margin で離している（rig-chain の段が全部重なった）
  for (const m of css.matchAll(/\.([\w-]+)\s+\.\1\s*\{([^}]*)\}/g)) {
    if (/margin(-top|-block-start)?\s*:/.test(m[2])) {
      add('fail', '余白の相殺',
        `.${m[1]} .${m[1]} の間隔を margin で取っている`,
        '境界も余白も無い入れ子では上下の余白が相殺され、子ではなく親ごと下がる。translate なら相殺されない。');
    }
  }

  return findings;
}
