---
name: css-animation
description: >
  Write, choose, and verify CSS animations. Use whenever producing or reviewing CSS
  @keyframes, transitions, scroll-driven animation, or motion for a UI — including
  "make this fade in", "add a loading spinner", "why doesn't this animation work",
  "is this animation expensive". Verifies that the animation actually renders,
  classifies its cost (compositor/paint/layout), and draws on a catalog of 211
  experiments plus findings recorded with explicit confidence.
---

# CSS アニメーションを書く・選ぶ・確かめる

CSS アニメーションは、書くより**確かめるほうが高くつく**。構文が正しく、レビューを通り、
それでも**何も起きていない**ことがある。誤った `@keyframes` 名、描画に届かないプロパティ、
頂点が一直線の `clip-path` — どれもエラーにならない。見るまで分からない。

だから、CSS アニメーションを出す前に必ず機械で確かめる。

## 1. 書いたら検査する（必須）

```bash
npx css-animation-lab check path/to/anim.css --runtime
```

`--runtime` は headless Chrome で実際に動かす。npm 依存は増えない（既にある Chrome を借りる）。
「要修正」が 1 件でもあれば終了コードは 1 になる。

捕まえるもののうち、コードを読んでも分からないのは次の 3 つ。

- **動きが無い** — アニメーションが 1 本も生成されていない
- **見た目が変わらない** — 計算値は変わるが描画に届いていない
- **継ぎ目** — 繰り返しの 1 周の終わりで飛ぶ

同時に負荷を分類する。`layout` が出たら、`transform` / `opacity` で書き直せないかを検討する。
`width` / `height` / `top` / `left` を毎フレーム動かすと、要素ごとにレイアウトが再計算される。

機械可読で欲しいときは `--json`。プログラムからは:

```js
import { checkCss } from 'css-animation-lab';
const { findings, runtime } = await checkCss(css, { runtime: true });
```

## 2. 動きを静止画で読む

再生を見ずに判断したいとき、あるいは利用者に見せたいときは連番に展開する。

```bash
npx css-animation-lab strip anim.css --frames 9 --out strip
```

前半に密なサンプリングを既定にしてある。`ease-out` 系は時間の 25% で出力が 78% に達するため、
等間隔で採ると後半のコマが全部同じ絵になる。

## 3. 何を作れるかを引く

```bash
npx css-animation-lab catalog "ローディング"
npx css-animation-lab catalog --layer T --limit 30
```

211 件の実験を、用途・技法・名称から引ける。層は
`L0`=原子 / `L2`=合成 / `L3`=stagger / `L4`=レシピ / `T`=技法 / `E`=他領域由来。

## 4. 罠を踏む前に知見を引く

```bash
npx css-animation-lab findings "offset-path"
```

1 件ごとに「主張・根拠・確度・効き方」を持つ。確度は `実測` / `仕様から確定` / `仮説` のいずれか。
**効かなかったことも同じだけ記録されている** ので、実装前に引くと手戻りが減る。

よく効くもの:

- `ease-out` 系の体感時間は指定値よりずっと短い。指定 600ms は体感 200ms 前後として設計する
- `box-shadow` による elevation は下地が明るいことに依存する。暗色テーマでは影が沈んで見えない
- `offset-path: path()` は箱の大きさに追従しない。再利用する部品なら基本図形で書く

## 5. どの動きを選ぶか

```bash
npx css-animation-lab patterns
```

型ごとの性格を、**注意度・由来を示すか・反復耐性**の 3 軸で書いてある。優劣は書いていない。
決めているのは UI 部品の種類ではなく、その場面が持つ性質のほう。

- 注意度が高い型（`overshoot` など）は、めったに出ないものに使う
- 反復耐性が低い型は、1 セッションに何度も出るものには使えない。
  見出しには使えても、トーストに使うと過剰になる
- 由来を示す型（`rise` / `slide`）は、出どころを分からせたいときに使う

## 判断の分担

| 層 | 何を決めるか | 誰がやるか |
|---|---|---|
| 機械検証 | 動いているか、重くないか、継ぎ目はないか | この道具 |
| 静止画 | 軌跡、行き過ぎ、到達の早さ | 連番を読む |
| 感性 | 気持ちよさ、上品さ、場面との相性 | 人間だけ |

最後の層は代行しない。「良い動きです」と言い切らず、確かめた事実（動いている・負荷はこれ・
継ぎ目はない）と、判断が要る点を分けて伝える。
